# Power BI Chatbot v2 - Fluent Design

Power BI dataset-inə təbii dildə sual verib cavab almaq üçün advanced Streamlit chatbot.

## ✨ Yeni xüsusiyyətlər (v2)

- 🎨 **Microsoft Fluent Design** - Power BI-ə uyğun modern UI
- 📈 **Avtomatik qrafiklər** - Plotly ilə cavablarda chart (bar/line/pie/scatter)
- 💬 **Söhbət yaddaşı** - "həmin region üçün...", "o il üzrə..." kimi davamlı suallar
- 📥 **Export** - Excel (.xlsx) və PDF yüklə
- 💡 **Davam sualları** - AI hər cavabdan sonra 3 məntiqli davam sualı təklif edir
- 🗂️ **Çoxlu dataset** - Dropdown-dan dataset seçimi

## 📋 Tələblər

Əvvəlki versiyadakı bütün tələblər + yeni kitabxanalar (Plotly, openpyxl, reportlab).

## 🚀 Yeni quraşdırma

```bash
cd Chatbot
.\venv\Scripts\Activate.ps1

# Yeni kitabxanaları yüklə
pip install -r requirements.txt --upgrade

# İşə sal
streamlit run app.py
```

## 🆕 `.env` dəyişiklikləri

Köhnə format (hələ də işləyir):
```
WORKSPACE_ID=xxx
DATASET_ID=yyy
```

Yeni format (çoxlu dataset üçün):
```
DATASETS_JSON=[{"name":"Satış","workspace_id":"xxx","dataset_id":"yyy"},{"name":"HR","workspace_id":"aaa","dataset_id":"bbb"}]
```

Bir dataset üçün:
```
DATASETS_JSON=[{"name":"Əsas Dataset","workspace_id":"b55aa2d2-e811-4d59-9a96-58508564d57b","dataset_id":"ad69c614-30e4-4559-9dbf-8052f6febfe1"}]
```

## 📂 Fayl strukturu

```
Chatbot/
├── app.py              # Əsas Streamlit app
├── config.py           # Konfiqurasiya yükləyici
├── powerbi_client.py   # Power BI REST API client
├── llm_client.py       # Azure OpenAI client (yaddaş + chart + suggestion)
├── chart_builder.py    # Plotly chart generator
├── exporters.py        # Excel və PDF export
├── styles.py           # Fluent Design CSS
├── requirements.txt    # Asılılıqlar
└── .env                # Sirli məlumatlar (commit etmə!)
```

## 🎯 İstifadə

1. Streamlit açılandan sonra avtomatik schema çəkiləcək
2. Dataset dropdown-dan seçim et (çoxlu dataset varsa)
3. Sual ver → AI DAX yaradacaq və cavab verəcək
4. Cavabda:
   - Cədvəl + avtomatik chart
   - "🔍 DAX" expander ilə SQL bax
   - Excel/PDF download
5. Aşağıda 3 davam sualı çıxacaq - birini seç və davam et

## 💡 Pro İpucları

- **Schema-nı zənginləşdir**: Sidebar-dakı schema-ya measure-lərin izahını əlavə et:
  ```
  Measures:
    - [Total Sales]  (ümumi satış cəmi AZN-lə)
    - [YoY Growth]  (illik böyümə faizi)
  ```
- **Kontekstdə davamlılıq**: "Həmin məhsullar üçün keçən ili göstər" - kontekst avtomatik saxlanır
- **Yeni mövzu**: Mövzu dəyişdikdə söhbəti təmizlə (sidebar-dan)
- **Cache təmizlə**: Dataset yenilənibsə, "🔄 Yenilə" düyməsi

## 🔧 Troubleshooting

| Xəta | Həll |
|------|------|
| `DATASETS_JSON səhv formatdadır` | JSON syntax-ı yoxla, dırnaqlar düz olmalıdır |
| Chart görünmür | `pip install plotly --upgrade` |
| PDF xətası | `pip install reportlab --upgrade` |
| Suggestions çıxmır | GPT-4o-nun JSON cavab verməsi bəzən uğursuz olur, normal |
