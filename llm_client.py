"""LLM client — classifier, DAX, chart, follow-up, advice + TOKEN TRACKING"""

import re
import json
from openai import AzureOpenAI
import pandas as pd
from cost_tracker import calculate_cost


def _fix_table_quotes(dax: str, schema: str) -> str:
    table_names = []
    for line in schema.splitlines():
        line = line.strip()
        if line.endswith("(cədvəl):"):
            tname = line[: -len("(cədvəl):")].strip()
            if " " in tname:
                table_names.append(tname)
    for tname in sorted(table_names, key=len, reverse=True):
        escaped = re.escape(tname)
        dax = re.sub(rf"(?<!')\b{escaped}\b(?!')", f"'{tname}'", dax)
    return dax


# ── System prompts ────────────────────────────────────────────────────────────

CLASSIFY_SYSTEM = """Sən ErtAgro Data Assistant-ın sual sinifləşdiricisən.
İstifadəçinin sualını oxu və YALNIZ JSON qaytart.

{"type": "...", "chart": "..."}

type:
- "greeting"     : Salam, necəsən, xoş gördük, hello, hi, sağ ol kimi ifadələr
- "off_topic"    : ErtAgro datası ilə əlaqəsiz suallar (hava, xəbər, resept, tarix, siyasət, AI haqqında və s.)
- "consultation" : Məsləhət, tövsiyə, nə analiz edim, nə baxım kimi ümumi istəklər — konkret data sorğusu olmadan
- "data_query"   : Satış, anbar, mal, müştəri, kateqoriya, stok, debitor ilə bağlı konkret suallar

chart (yalnız data_query üçün — istifadəçi chart adı çəkibsə doldur, yoxsa null):
- "bar", "line", "pie", "scatter", null

Nümunələr:
"Salam" → {"type":"greeting","chart":null}
"Sabahın xeyir" → {"type":"greeting","chart":null}
"Hava necədir?" → {"type":"off_topic","chart":null}
"Mənə bir resept de" → {"type":"off_topic","chart":null}
"Bu datadan nə məsləhət verərdin?" → {"type":"consultation","chart":null}
"Hansı analizlərə baxmalıyam?" → {"type":"consultation","chart":null}
"Ən çox satan məhsul?" → {"type":"data_query","chart":null}
"Aylıq satışı line chart ilə göstər" → {"type":"data_query","chart":"line"}
"Kateqoriyalar üzrə satışı pie ilə göstər" → {"type":"data_query","chart":"pie"}
"Satışları bar chart şəklində ver" → {"type":"data_query","chart":"bar"}"""

ADVICE_SYSTEM = """Sən ErtAgro şirkəti üçün data analitik məsləhətçisisən.
İstifadəçi konkret data sorğusu yox, ümumi məsləhət istəyir.

Schema-ya baxaraq Azərbaycan dilində praktiki məsləhətlər ver:
- Hansı KPI-lara diqqət etmeli (satış trendi, marja, stok dövriyyəsi, debitor)
- Hansı müqayisələr faydalıdır (ay/ay, şöbə/şöbə, kateqoriya üzrə)
- Hansı analizlər biznes qərarı üçün vacibdir

3-5 konkret, faydalı cümlə. DAX yaratma, kod göstərmə."""

DAX_SYSTEM = """Sən Power BI və DAX üzrə ekspert-sən. İstifadəçinin sualını düzgün DAX query-yə çevir.

QAYDALAR:
1. YALNIZ DAX query qaytar — heç bir izah, heç bir markdown.
2. Query EVALUATE ilə başlamalıdır.
3. Schema-dakı cədvəl və sütun adlarına sadiq qal.
4. Əgər əvvəlki söhbət varsa, kontekstə diqqət et.
5. Aggregate-lərdə mövcud measure-ləri üstün tut.
6. TOP N üçün TOPN() + ORDER BY.
7. Nəticə həmişə cədvəl formatda olmalıdır.
8. Boşluq olan cədvəl adlarını HƏMİŞƏ tək dırnaqla yaz: 'Mal satışı hesabatı (Cəm)'[Satış Məbləği]

FİLTR DƏYƏRİ QAYDASI — MÜTLƏQDİR:
- Schema-nın "FİLTR DƏYƏRLƏRİ" bölməsinə BAX və oradakı dəyərləri AYNEN istifadə et.
- İstifadəçinin yazdığı mətni DAX filterinə HEÇ VAXT birbaşa qoyma.
  ❌ YANLIŞ: [Anbar] = "Şəmkir"      ← istifadəçinin yazdığı
  ✅ DOĞRU:  [Anbar] = "Semkir Anbar" ← schema-dakı faktiki dəyər
- Tam uyğunluq tapa bilməsən: CONTAINSSTRING('Cədvəl'[Sütun], "dəyər")

TARİX QAYDASI:
- Calendar1[MonthName] İNGİLİS dilindədir: January...December
- Azərbaycan→İngilis: Yanvar=January, Fevral=February, Mart=March, Aprel=April, May=May, İyun=June, İyul=July, Avqust=August, Sentyabr=September, Oktyabr=October, Noyabr=November, Dekabr=December
- Tarix filtri üçün Calendar1[MonthOfYear] (1-12) və ya Calendar1[Year] istifadə et.
- "Bu ay"=MONTH(TODAY()), "Bu il"=YEAR(TODAY()), "Ötən ay"=MONTH(TODAY())-1
- "Bu gün"/"bugün" deyildikdə: 'Cədvəl'[tarix] = MAXX('Cədvəl', 'Cədvəl'[tarix])

NÜMUNƏLƏR:
Sual: "Bu il ümumi satış?"
DAX: EVALUATE ROW("Ümumi Satış", CALCULATE([Ümumi Satış], 'Calendar1'[Year] = YEAR(TODAY())))

Sual: "Aprel ayı satışı?"
DAX: EVALUATE ROW("Aprel Satışı", CALCULATE([Ümumi Satış], 'Calendar1'[MonthOfYear] = 4))

Sual: "Şəmkir şöbəsinin satışı?"
DAX: EVALUATE ROW("Satış", CALCULATE([Ümumi Satış], 'Mal satışı hesabatı (Cəm)'[Şöbə] = "Semkir"))

Sual: "Ən çox satan 5 məhsul"
DAX: EVALUATE TOPN(5, SUMMARIZE('Mal satışı hesabatı (Cəm)', 'Mal satışı hesabatı (Cəm)'[Malın adı], "Satış", [Ümumi Satış]), [Satış], DESC)

Sual: "Hər kateqoriya üzrə satış?"
DAX: EVALUATE SUMMARIZE('Mal satışı hesabatı (Cəm)', 'Mal satışı hesabatı (Cəm)'[Kateqoriya], "Satış", [Ümumi Satış])"""

ANSWER_SYSTEM = """Sən data-analyst köməkçisisən. Sualı, DAX-ı və nəticəni nəzərə alaraq Azərbaycan dilində qısa cavab ver.

RƏQƏM FORMATLAMA QAYDASI:
- Pul məbləği (satış, alış, gəlir, mənfəət, məbləğ, borc): Kəsirsiz, minlik ayırıcı, manat sonda: 1,234,568 ₼
- Qiymət (vahid/orta qiymət): 1 onluq, manat sonda: 56.0 ₼
- Miqdar/say/ədəd (qutu, kq, ədəd, müştəri sayı): Kəsirsiz: 1,234
- Faiz: Kəsirsiz tam: 12%

DİGƏR QAYDALAR:
- 2-4 cümlə
- Əsas tapıntını vurğula
- Cədvəl ayrıca göstərilir, onu təkrarlama"""

CHART_SYSTEM = """Sən data visualization ekspertisən. Sual və nəticə cədvəlinə baxıb ən uyğun chart növünü müəyyən et.

CHART SEÇİMİ MƏNTİQİ:
- "bar"     : Kateqoriyalar müqayisəsi (məhsul, anbar, şöbə, müştəri üzrə sıralama)
- "line"    : Zamanla trend (ay, həftə, gün üzrə dəyişim)
- "pie"     : Bütünün hissələri — YALNIZ 2-7 kateqoriya olduqda
- "scatter" : İki rəqəm arasında əlaqə (qiymət vs miqdar kimi)
- "none"    : Tək dəyər (ROW), çox sütun, və ya chart fayda vermir

QAYDALAR:
- Aşağıdakı JSON formatını qaytar (heç bir markdown, heç bir izah):
{"type":"<chart_type>","x":"<column_name>","y":"<column_name>","title":"<başlıq>"}
- x: kateqoriya və ya tarix sütunu adı
- y: əsas rəqəm sütunu adı
- Əgər chart lazım deyilsə: {"type":"none"}"""

SUGGESTIONS_SYSTEM = """Sən ErtAgro data analitikisən. İstifadəçinin SON SUALINA uyğun 3 davam sualı təklif et.

QAYDALAR:
- Azərbaycan dilində, qısa (5-8 söz)
- SON SUALIN birbaşa davamı olsun — eyni mövzu, daha dərin analiz
  Misal "Ən çox satan məhsul?" → "Bu məhsulun aylıq trendi?", "Hansı anbarda daha çox satılır?", "Bu məhsulun marjası nə qədərdir?"
- Fərqli açılardan bax: zaman, coğrafiya, kateqoriya, müqayisə
- JSON formatında: ["sual1", "sual2", "sual3"]
- Yalnız JSON array qaytar, başqa heç nə"""

SQL_SYSTEM = """Sən T-SQL (SQL Server) üzrə ekspert-sən. İstifadəçinin sualını düzgün T-SQL SELECT query-yə çevir.

QAYDALAR:
1. YALNIZ T-SQL query qaytar — heç bir izah, heç bir markdown, heç bir kod bloku.
2. Schema-dakı cədvəl və sütun adlarına sadiq qal (schema prefix ilə: dbo.CədvəlAdı).
3. YALNIZ SELECT sorğusu — INSERT, UPDATE, DELETE, DROP, EXEC qadağandır.
4. TOP N üçün: SELECT TOP N ... ORDER BY sütun DESC
5. Azərbaycan dilindəki mətn dəyərlər üçün N'' prefiksi: WHERE Sütun = N'Dəyər'
6. Tarix funksiyaları: GETDATE(), YEAR(GETDATE()), MONTH(GETDATE()), DATEADD()
7. Boşluq və ya xüsusi hərf (ə,ş,ğ,ı,ö,ü) olan BÜTÜN sütun adlarını köşəli mötərizəyə al — həm SELECT-də, həm aggregate-də, həm GROUP BY-da:
   ✅ SELECT [Malın adı], SUM([Satış Məbləği]) ... GROUP BY [Malın adı]
   ❌ SELECT Malın adı, SUM(Satış Məbləği)
8. Qruplaşdırmada SUM, COUNT, AVG, MIN, MAX aggregate funksiyaları işlət.

NÜMUNƏLƏR:
Sual: "Ən çox satan 5 məhsul"
SQL: SELECT TOP 5 [Malın adı], SUM([Satış Məbləği]) AS CemSatis FROM dbo.Mal_satisi_hesabati_Cam GROUP BY [Malın adı] ORDER BY CemSatis DESC

Sual: "Bu ilin satışları"
SQL: SELECT * FROM dbo.Satis WHERE YEAR(Tarix) = YEAR(GETDATE())

Sual: "Kateqoriyalar üzrə satış"
SQL: SELECT Kateqoriya, SUM(Mebleb) AS CemSatis FROM dbo.Satis GROUP BY Kateqoriya ORDER BY CemSatis DESC"""


class LLMClient:
    def __init__(self, endpoint, api_key, deployment, api_version="2024-10-21"):
        self.client = AzureOpenAI(
            azure_endpoint=endpoint, api_key=api_key, api_version=api_version
        )
        self.deployment = deployment

    def _chat(self, system, user, temperature=0.1, max_tokens=1000):
        resp = self.client.chat.completions.create(
            model=self.deployment,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = resp.choices[0].message.content.strip()
        cost = calculate_cost(
            input_tokens=resp.usage.prompt_tokens,
            output_tokens=resp.usage.completion_tokens,
            model=self.deployment,
        )
        return content, cost

    def _chat_with_history(self, system, history_messages, temperature=0.1, max_tokens=1000):
        messages = [{"role": "system", "content": system}]
        messages.extend(history_messages)
        resp = self.client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = resp.choices[0].message.content.strip()
        cost = calculate_cost(
            input_tokens=resp.usage.prompt_tokens,
            output_tokens=resp.usage.completion_tokens,
            model=self.deployment,
        )
        return content, cost

    def classify_question(self, question: str) -> dict:
        """Sualı təsnif et: greeting / off_topic / consultation / data_query"""
        try:
            resp, cost = self._chat(CLASSIFY_SYSTEM, question, temperature=0.1, max_tokens=60)
            if resp.startswith("```"):
                lines = resp.split("\n")
                resp = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            result = json.loads(resp.strip())
            result["_cost"] = cost
            return result
        except Exception:
            return {"type": "data_query", "chart": None, "_cost": calculate_cost(0, 0, self.deployment)}

    def get_advice(self, question: str, schema: str) -> tuple:
        """Məsləhət ver — DAX olmadan"""
        user = f"Schema (əsas cədvəllər):\n{schema[:2000]}\n\nSual: {question}"
        return self._chat(ADVICE_SYSTEM, user, temperature=0.5, max_tokens=400)

    def nl_to_dax(self, question: str, schema: str, history: list = None):
        schema_block = schema.strip() if schema else "(schema yoxdur)"
        history_msgs = []
        if history:
            for msg in history[-6:]:
                if msg["role"] == "user":
                    history_msgs.append({"role": "user", "content": msg["content"]})
                elif msg["role"] == "assistant":
                    content = msg.get("content", "")
                    if msg.get("dax"):
                        content = f"{content}\n(Əvvəlki DAX: {msg['dax']})"
                    history_msgs.append({"role": "assistant", "content": content})

        history_msgs.append({
            "role": "user",
            "content": f"SCHEMA:\n{schema_block}\n\nSUAL: {question}\n\nYalnız DAX qaytar."
        })

        dax, cost = self._chat_with_history(DAX_SYSTEM, history_msgs, temperature=0.1, max_tokens=1000)

        if dax.startswith("```"):
            lines = dax.split("\n")
            dax = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        dax = _fix_table_quotes(dax.strip(), schema_block)
        return dax, cost

    def data_to_answer(self, question: str, dax: str, data: pd.DataFrame):
        if data is None or data.empty:
            return "Bu suala uyğun data tapılmadı.", calculate_cost(0, 0, self.deployment)
        preview = data.head(20).to_string(index=False)
        user = f"SUAL: {question}\n\nDAX:\n{dax}\n\nNƏTİCƏ ({len(data)} sətir):\n{preview}"
        return self._chat(ANSWER_SYSTEM, user, temperature=0.3, max_tokens=500)

    def suggest_followups(self, question: str, answer: str, schema: str):
        try:
            user = f"Son sual: {question}\n\nCavab: {answer}"
            resp, cost = self._chat(SUGGESTIONS_SYSTEM, user, temperature=0.7, max_tokens=200)
            if resp.startswith("```"):
                lines = resp.split("\n")
                resp = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            suggestions = json.loads(resp.strip())
            return (suggestions[:3] if isinstance(suggestions, list) else []), cost
        except Exception:
            return [], calculate_cost(0, 0, self.deployment)

    def nl_to_sql(self, question: str, schema: str, history: list = None):
        schema_block = schema.strip() if schema else "(schema yoxdur)"
        history_msgs = []
        if history:
            for msg in history[-6:]:
                if msg["role"] == "user":
                    history_msgs.append({"role": "user", "content": msg["content"]})
                elif msg["role"] == "assistant":
                    content = msg.get("content", "")
                    if msg.get("sql"):
                        content = f"{content}\n(Əvvəlki SQL: {msg['sql']})"
                    history_msgs.append({"role": "assistant", "content": content})

        history_msgs.append({
            "role": "user",
            "content": f"SCHEMA:\n{schema_block}\n\nSUAL: {question}\n\nYalnız T-SQL SELECT qaytar."
        })

        sql, cost = self._chat_with_history(SQL_SYSTEM, history_msgs, temperature=0.1, max_tokens=800)

        if sql.startswith("```"):
            lines = sql.split("\n")
            sql = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        return sql.strip(), cost

    def fix_sql(self, original_sql: str, error: str, schema: str) -> tuple:
        """Xətalı SQL-i düzəldir — xəta mesajını göndərib düzgün versiyanı alır."""
        user = (
            f"SCHEMA:\n{schema}\n\n"
            f"XƏTALИ SQL:\n{original_sql}\n\n"
            f"XƏTA:\n{error}\n\n"
            f"Xətanı düzəlt və düzgün T-SQL SELECT qaytar. Yalnız SQL, başqa heç nə."
        )
        sql, cost = self._chat(SQL_SYSTEM, user, temperature=0.1, max_tokens=800)
        if sql.startswith("```"):
            lines = sql.split("\n")
            sql = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        return sql.strip(), cost

    def suggest_chart(self, question: str, data: pd.DataFrame, hint: str = None):
        """Chart növü seç. hint: istifadəçinin tələb etdiyi chart növü."""
        if data is None or data.empty:
            return {"type": "none"}, calculate_cost(0, 0, self.deployment)

        # İstifadəçi chart növü müəyyən edibsə, onu istifadə et
        if hint and hint in ("bar", "line", "pie", "scatter"):
            cols = list(data.columns)
            x_col = cols[0] if cols else ""
            y_col = next((c for c in cols[1:] if data[c].dtype in
                          ["float64", "int64", float, int]), cols[1] if len(cols) > 1 else "")
            return {
                "type": hint,
                "x": x_col,
                "y": y_col,
                "title": question[:60],
            }, calculate_cost(0, 0, self.deployment)

        if len(data.columns) < 2:
            return {"type": "none"}, calculate_cost(0, 0, self.deployment)

        preview = data.head(5).to_string(index=False)
        user = (f"SUAL: {question}\n\nSÜTUNLAR: {list(data.columns)}\n\n"
                f"İLK 5 SƏTIR:\n{preview}\n\nSətir sayı: {len(data)}")
        try:
            resp, cost = self._chat(CHART_SYSTEM, user, temperature=0.2, max_tokens=150)
            if resp.startswith("```"):
                lines = resp.split("\n")
                resp = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            chart = json.loads(resp.strip())
            return (chart if isinstance(chart, dict) else {"type": "none"}), cost
        except Exception:
            return {"type": "none"}, calculate_cost(0, 0, self.deployment)
