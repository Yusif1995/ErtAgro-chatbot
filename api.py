"""
ErtAgro – FastAPI backend
Mövcud powerbi_client.py, llm_client.py, config.py-ı import edir.
React static files-ı /frontend_dist/ qovluğundan serve edir.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from config import load_config
from cost_tracker import aggregate_costs
from llm_client import LLMClient
from powerbi_client import PowerBIClient
from query_memory import QueryMemory
from sql_client import SQLClient
from context_builder import ContextBuilder
from ml_model import SalesForecastModel, init_model, retrain

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ErtAgro API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Init clients ──────────────────────────────────────────────────────────────
_pbi: Optional[PowerBIClient] = None
_llm: Optional[LLMClient] = None
_sql: Optional[SQLClient] = None
_ctx_builder: Optional[ContextBuilder] = None
_cfg: dict = {}
_init_error: str = ""
_schema_cache: Dict[str, str] = {}
_sql_schema_cache: Dict[str, str] = {}
_ml_model: SalesForecastModel = SalesForecastModel()
_query_memory: QueryMemory = QueryMemory()

try:
    _cfg = load_config()
    _pbi = PowerBIClient(
        tenant_id=_cfg["TENANT_ID"],
        client_id=_cfg["CLIENT_ID"],
        client_secret=_cfg["CLIENT_SECRET"],
    )
    _llm = LLMClient(
        endpoint=_cfg["AZURE_OPENAI_ENDPOINT"],
        api_key=_cfg["AZURE_OPENAI_API_KEY"],
        deployment=_cfg["AZURE_OPENAI_DEPLOYMENT"],
        api_version=_cfg["AZURE_OPENAI_API_VERSION"],
    )
    _sql = SQLClient(
        tenant_id=_cfg["TENANT_ID"],
        client_id=_cfg["CLIENT_ID"],
        client_secret=_cfg["CLIENT_SECRET"],
    )
    _ctx_builder = ContextBuilder(_sql, cache_ttl=3600)
    # Default dataset
    _datasets: List[dict] = _cfg.get("DATASETS", [])
    if _datasets:
        _pbi.set_dataset(_datasets[0]["workspace_id"], _datasets[0]["dataset_id"])
    _initialized = True
    # ML model — arxa planda train et
    try:
        _ml_model = init_model(_pbi)
    except Exception as _me:
        import logging
        logging.getLogger(__name__).warning("ML model init xətası: %s", _me)
except Exception as e:
    _initialized = False
    _init_error = str(e)


def _get_schema(workspace_id: str, dataset_id: str) -> str:
    """PBI schema + SQL real dəyərlərini birləşdirir."""
    key = f"{workspace_id}:{dataset_id}"
    if key not in _schema_cache:
        try:
            _schema_cache[key] = _pbi.fetch_schema()
        except Exception:
            _schema_cache[key] = ""

    pbi_schema = _schema_cache[key]

    # SQL-dən yalnız filtr dəyərlərini əlavə et (cədvəl adları yox)
    if _ctx_builder and _cfg.get("SQL_SERVERS"):
        srv = _cfg["SQL_SERVERS"][0]
        try:
            filter_ctx = _ctx_builder.build_filter_values(srv["server"], srv["database"])
            return pbi_schema + "\n\n" + filter_ctx
        except Exception:
            pass

    return pbi_schema


def _safe_float(val: Any) -> float:
    try:
        return float(val) if val is not None and str(val) != "nan" else 0.0
    except Exception:
        return 0.0


def _fmt_val(val: Any, unit: str = "") -> str:
    try:
        v = float(val)
        if abs(v) >= 1_000_000:
            return f"{v/1_000_000:.1f}M {unit}".strip()
        if abs(v) >= 1_000:
            return f"{v/1_000:.1f}K {unit}".strip()
        return f"{v:,.1f} {unit}".strip()
    except Exception:
        return str(val)


# ── Pydantic models ───────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str
    filters: Optional[Dict[str, Any]] = {}
    workspace_id: Optional[str] = None
    dataset_id: Optional[str] = None


class ForecastRequest(BaseModel):
    product: str = "Banan"
    region: str = "Bakı-Abşeron"
    price: float = 0.85
    volume: float = 1000.0
    season: str = "Yay"
    currency: str = "AZN"


class SQLChatRequest(BaseModel):
    question: str
    server_name: str = "ErtAgro"


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"


class EmailRequest(BaseModel):
    to_email: str
    kpi_label: str
    kpi_value: str
    kpi_unit: str
    kpi_change: float = 0.0
    kpi_trend: str = "up"
    kpi_alert: bool = False
    filters_info: str = ""
    extra_message: str = ""


# ══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS  (all under /api/)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "initialized": _initialized, "error": _init_error}


@app.get("/api/test-connections")
async def test_connections():
    import requests as req
    results = {}

    # Test token
    try:
        token = _pbi._get_token()
        results["token"] = {"ok": True, "msg": "Token alındı"}
    except Exception as e:
        results["token"] = {"ok": False, "msg": str(e)}
        return results

    # List workspaces service principal can see
    try:
        r = req.get(
            "https://api.powerbi.com/v1.0/myorg/groups",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        workspaces = r.json().get("value", []) if r.status_code == 200 else []
        results["visible_workspaces"] = [
            {"id": w["id"], "name": w["name"]} for w in workspaces
        ]
    except Exception as e:
        results["visible_workspaces"] = str(e)

    # Test specific dataset
    try:
        ok, msg = _pbi.test_connection()
        results["powerbi"] = {"ok": ok, "msg": msg}
    except Exception as e:
        results["powerbi"] = {"ok": False, "msg": str(e)}

    results["configured"] = {
        "workspace_id": _pbi.workspace_id,
        "dataset_id": _pbi.dataset_id,
    }

    # Test LLM
    try:
        from openai import AzureOpenAI
        client = AzureOpenAI(
            azure_endpoint=_cfg["AZURE_OPENAI_ENDPOINT"],
            api_key=_cfg["AZURE_OPENAI_API_KEY"],
            api_version=_cfg.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
        )
        resp = client.chat.completions.create(
            model=_cfg["AZURE_OPENAI_DEPLOYMENT"],
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
        results["llm"] = {"ok": True, "msg": resp.choices[0].message.content}
    except Exception as e:
        results["llm"] = {"ok": False, "msg": str(e)}

    return results


@app.post("/api/tts")
async def text_to_speech(body: TTSRequest):
    import os
    from openai import OpenAI
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY tapılmadı")
    try:
        client = OpenAI(api_key=api_key)
        audio = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice=body.voice,
            input=body.text[:4096],
        )
        return Response(content=audio.content, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS xətası: {e}")


@app.post("/api/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    import os
    from openai import OpenAI
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY tapılmadı")
    try:
        client = OpenAI(api_key=api_key)
        audio_bytes = await audio.read()
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio.filename or "audio.webm", audio_bytes, audio.content_type or "audio/webm"),
        )
        return {"text": transcript.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT xətası: {e}")


@app.get("/api/datasets")
async def get_datasets():
    return _cfg.get("DATASETS", [])


@app.get("/api/kpis")
async def get_kpis():
    """Power BI-dan real KPI-lar çəkir. Xəta olarsa dummy qaytarır."""
    dummy = [
        {"id": "total_sales",       "label": "Total Satış",        "value": 24_800_000, "unit": "AZN", "change": 12.4, "trend": "up",   "icon": "TrendingUp",     "sub": "vs əvvəlki dövr"},
        {"id": "profit",            "label": "Ümumi Mənfəət",      "value": 6_300_000,  "unit": "AZN", "change": 8.7,  "trend": "up",   "icon": "DollarSign",     "sub": "Mənfəət Marjası: 25.4%"},
        {"id": "inventory",         "label": "Anbar Səviyyəsi",    "value": 18_742,     "unit": "ton", "change": -4.3, "trend": "down", "icon": "Package",        "sub": "vs əvvəlki dövr"},
        {"id": "forecast_accuracy", "label": "Proqnoz Dəqiqliyi", "value": 92.6,       "unit": "%",   "change": 3.2,  "trend": "up",   "icon": "Target",         "sub": "ML Model: Prophet"},
    ]

    if not _initialized:
        return dummy

    _T = "'Mal satışı hesabatı (Cəm)'"
    measures = [
        ("total_sales",       f"SUM({_T}[Satış Məbləği])",                                    "AZN",  "TrendingUp", "vs əvvəlki dövr"),
        ("profit",            f"SUM({_T}[Gelir])",                                             "AZN",  "DollarSign", "Ümumi gəlir"),
        ("inventory",         f"SUM({_T}[Miqdar])",                                            "ədəd", "Package",    "Satış miqdarı"),
        ("forecast_accuracy", f"DIVIDE(SUM({_T}[Gelir]),SUM({_T}[Satış Məbləği]))*100",        "%",    "Target",     "Gross Marja"),
    ]
    labels = ["Total Satış", "Ümumi Mənfəət", "Anbar Səviyyəsi", "Proqnoz Dəqiqliyi"]
    result = []
    for i, (kpi_id, measure, unit, icon, sub) in enumerate(measures):
        try:
            df = _pbi.execute_query(f"EVALUATE ROW(\"v\", {measure})")
            val = _safe_float(df.iloc[0, 0]) if not df.empty else 0.0
            result.append({
                "id": kpi_id, "label": labels[i], "value": val,
                "unit": unit, "change": dummy[i]["change"],
                "trend": dummy[i]["trend"], "icon": icon, "sub": sub,
            })
        except Exception:
            result.append(dummy[i])
    return result


@app.get("/api/suggested-questions")
async def suggested_questions():
    return [
        "Bu ayın ən çox satılan məhsulları hansılardır?",
        "Mənfəət marjası məhsullara görə necədir?",
        "Anbar səviyyəsi kritik olan məhsullar hansılardır?",
        "Regionlara görə satış trendi göstərin.",
        "Gələcək 3 ay üçün satış proqnozu nədir?",
    ]


@app.get("/api/refresh-status")
async def refresh_status():
    if not _initialized:
        return {"status": "error", "message": _init_error,
                "last_refresh": "-", "next_refresh": "-"}
    try:
        ok, msg = _pbi.test_connection()
        now = pd.Timestamp.now()
        return {
            "status": "success" if ok else "error",
            "message": msg,
            "last_refresh": now.strftime("%d.%m.%Y %H:%M"),
            "next_refresh": "Sabah 08:45 AM",
        }
    except Exception as e:
        return {"status": "error", "message": str(e),
                "last_refresh": "-", "next_refresh": "-"}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not _initialized:
        raise HTTPException(status_code=503, detail=_init_error or "Xidmət başlatılmayıb")

    # Dataset seçimi
    ws = req.workspace_id
    ds = req.dataset_id
    datasets = _cfg.get("DATASETS", [])
    if ws and ds:
        _pbi.set_dataset(ws, ds)
    elif datasets:
        _pbi.set_dataset(datasets[0]["workspace_id"], datasets[0]["dataset_id"])

    # Schema
    schema = _get_schema(_pbi.workspace_id or "", _pbi.dataset_id or "")

    # Oxşar keçmiş uğurlu sorğuları tap (few-shot üçün)
    mem_examples = _query_memory.similar(req.question, _pbi.dataset_id or "")

    # Step 1: NL → DAX
    try:
        dax, _ = _llm.nl_to_dax(
            question=req.question,
            schema=schema,
            memory_examples=mem_examples or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DAX yarada bilmədim: {e}")

    # Step 2: DAX → Data
    try:
        df = _pbi.execute_query(dax)
        _query_memory.record_success(req.question, dax, _pbi.dataset_id or "")
    except Exception as e:
        _query_memory.record_failure(req.question, dax, str(e), _pbi.dataset_id or "")
        raise HTTPException(status_code=500, detail=f"Power BI xətası: {e}")

    # Step 3: Data → Answer
    try:
        answer, _ = _llm.data_to_answer(req.question, dax, df)
    except Exception as e:
        answer = "Cavab formatlana bilmədi."

    # Step 4: Chart spec
    chart_data = None
    try:
        chart_spec, _ = _llm.suggest_chart(req.question, df)
        if chart_spec and chart_spec.get("type") != "none" and not df.empty:
            x_key = chart_spec.get("x", df.columns[0])
            y_key = chart_spec.get("y", df.columns[1] if len(df.columns) > 1 else df.columns[0])
            rows = []
            for _, row in df.iterrows():
                try:
                    rows.append({
                        x_key: str(row.get(x_key, "")),
                        y_key: _safe_float(row.get(y_key, 0)),
                    })
                except Exception:
                    pass
            chart_data = {
                "type": chart_spec["type"],
                "data": rows,
                "xKey": x_key,
                "yKey": y_key,
                "title": chart_spec.get("title", req.question[:40]),
            }
    except Exception:
        pass

    # Step 5: Metrics (single-row data → key-value pairs)
    metrics = []
    if not df.empty:
        if len(df) == 1:
            for col in df.columns:
                val = df.iloc[0][col]
                metrics.append({"label": col, "value": str(val) if pd.notna(val) else "—", "change": None})
        else:
            metrics = [{"label": f"{len(df)} sətir", "value": "", "change": None}]

    return {
        "answer": answer,
        "dax": dax,
        "chart": chart_data,
        "metrics": metrics,
        "rows": df.to_dict(orient="records") if not df.empty and len(df) <= 100 else [],
        "row_count": len(df),
        "source": "Power BI Dataset – ErtAgro",
        "model": _cfg.get("AZURE_OPENAI_DEPLOYMENT", "GPT-4o"),
        "confidence": 95,
        "timestamp": pd.Timestamp.now().isoformat(),
    }


@app.get("/api/query-memory/stats")
async def query_memory_stats():
    """Query memory statistikası — neçə sorğu öyrənilib."""
    return {**_query_memory.stats(), "recent": _query_memory.recent(10)}


@app.post("/api/refresh")
async def trigger_refresh():
    """Schema cache-ni sıfırla və connection yoxla."""
    _schema_cache.clear()
    if not _initialized:
        return {"status": "error", "message": _init_error}
    try:
        ok, msg = _pbi.test_connection()
        now = pd.Timestamp.now()
        return {
            "status": "success" if ok else "error",
            "message": msg,
            "last_refresh": now.strftime("%d.%m.%Y %H:%M"),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/schema")
async def get_schema():
    """Cədvəl və sütun strukturunu qaytarır."""
    if not _initialized:
        return {"tables": []}
    try:
        cols_df = _pbi.execute_query("EVALUATE INFO.VIEW.COLUMNS()")
        measures_df = _pbi.execute_query("EVALUATE INFO.VIEW.MEASURES()")

        tables: dict = {}

        if not cols_df.empty:
            for _, row in cols_df.iterrows():
                tname = str(row.get("Table", ""))
                cname = str(row.get("Name", ""))
                dtype = str(row.get("DataType", "?"))
                hidden = row.get("IsHidden", False)
                if PowerBIClient._is_internal_table(tname) or PowerBIClient._is_internal_column(cname):
                    continue
                if hidden:
                    continue
                if tname not in tables:
                    tables[tname] = {"name": tname, "columns": [], "measures": []}
                tables[tname]["columns"].append({"name": cname, "type": dtype})

        if not measures_df.empty:
            for _, row in measures_df.iterrows():
                tname = str(row.get("Table", ""))
                mname = str(row.get("Name", ""))
                if tname in tables:
                    tables[tname]["measures"].append(mname)

        return {"tables": list(tables.values())}
    except Exception as e:
        return {"tables": [], "error": str(e)}


@app.get("/api/filter-values")
async def get_filter_values():
    """Şöbə, Anbar, Kateqoriya dəyərlərini Power BI-dan qaytarır."""
    if not _initialized:
        return {}
    result = {}
    col_map = [
        ("Anbar",      "'Mal satışı hesabatı (Cəm)'[Anbar]"),
        ("Şöbə",       "'Mal satışı hesabatı (Cəm)'[Şöbə]"),
        ("Kateqoriya", "'Mal satışı hesabatı (Cəm)'[Kateqoriya]"),
    ]
    for col_name, pbi_col in col_map:
        try:
            df = _pbi.execute_query(
                f"EVALUATE TOPN(200, DISTINCT({pbi_col}), {pbi_col}, ASC)"
            )
            if not df.empty:
                vals = df.iloc[:, 0].dropna().astype(str).tolist()
                if vals:
                    result[col_name] = vals
        except Exception:
            pass
    return result


@app.get("/api/insights")
async def get_insights():
    """Power BI data-sından real insight-lar qaytarır."""
    insights = []
    if not _initialized:
        return insights

    queries = [
        (
            "top_sobe",
            "EVALUATE TOPN(1, SUMMARIZE(FILTER(ALL('Satış'),'Satış'[Şöbə]<>BLANK()),\
'Satış'[Şöbə],\"Satış\",[Ümumi Satış]),[Satış],DESC)",
            "top_region",
        ),
        (
            "low_stock",
            "EVALUATE TOPN(1, SUMMARIZE(FILTER(ALL('Satış'),'Satış'[Kateqoriya]<>BLANK()),\
'Satış'[Kateqoriya],\"Stok\",[Stok Miqdarı]),[Stok],ASC)",
            "low_stock",
        ),
    ]

    from datetime import datetime, timedelta
    now = datetime.now()
    m_start = now.replace(day=1).strftime("%Y-%m-%d")

    try:
        df_sales = _pbi.execute_query(
            f"EVALUATE ROW(\"Bu ay\", CALCULATE(SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]),Calendar1[Date]>=DATE({now.year},{now.month},1)),"
            f"\"Ötən ay\", CALCULATE(SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]),Calendar1[Date]>=DATE({now.year},{now.month-1 or 12},1),"
            f"Calendar1[Date]<DATE({now.year},{now.month},1)))"
        )
        if not df_sales.empty:
            bu_ay = _safe_float(df_sales.iloc[0, 0])
            oten_ay = _safe_float(df_sales.iloc[0, 1])
            if oten_ay > 0:
                change = round((bu_ay - oten_ay) / oten_ay * 100, 1)
                direction = "artım" if change > 0 else "azalma"
                insights.append({
                    "type": "trend",
                    "text": f"Bu ay satış ötən aya nisbətən {abs(change)}% {direction} göstərib. "
                            f"Cari ay: {_fmt_val(bu_ay, '₼')}.",
                })
    except Exception:
        pass

    if len(insights) == 0:
        insights = [
            {"type": "trend", "text": "Satış göstəriciləri stabil dinamika ilə davam edir. Ətraflı analiz üçün AI Chat-dan istifadə edin."},
            {"type": "warning", "text": "Anbar səviyyələrini mütəmadi izləyin. Kritik həddə çatmadan sifariş verin."},
            {"type": "info", "text": "Mövsüm dəyişiklikləri tələbatı əhəmiyyətli dərəcədə təsir edir. Proqnoz modulunu yoxlayın."},
        ]
    return insights


@app.get("/api/kpi-alerts")
async def get_kpi_alerts(
    date_from: str = "",
    date_to: str = "",
    anbar: str = "",
    sobe: str = "",
    category: str = "",
):
    """Real Power BI KPI-ları — Anbar/Şöbə/Kateqoriya/tarix filtrlər dəstəklənir."""
    if not _initialized:
        return []

    # Filter DAX konteksti
    def flt(measure: str) -> str:
        conds = []
        if date_from:
            conds.append(f"Calendar1[Date] >= DATE({date_from.replace('-', ',')})")
        if date_to:
            conds.append(f"Calendar1[Date] <= DATE({date_to.replace('-', ',')})")
        if anbar:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Anbar] = \"{anbar}\"")
        if sobe:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Şöbə] = \"{sobe}\"")
        if category:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Kateqoriya] = \"{category}\"")
        if conds:
            return f"CALCULATE({measure}, {', '.join(conds)})"
        return measure

    def now_month_flt(measure: str) -> str:
        conds = [
            f"Calendar1[Year] = YEAR(TODAY())",
            f"Calendar1[MonthOfYear] = MONTH(TODAY())",
        ]
        if anbar:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Anbar] = \"{anbar}\"")
        if sobe:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Şöbə] = \"{sobe}\"")
        if category:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Kateqoriya] = \"{category}\"")
        return f"CALCULATE({measure}, {', '.join(conds)})"

    def prev_month_flt(measure: str) -> str:
        conds = [
            f"Calendar1[Year] = IF(MONTH(TODAY())=1, YEAR(TODAY())-1, YEAR(TODAY()))",
            f"Calendar1[MonthOfYear] = IF(MONTH(TODAY())=1, 12, MONTH(TODAY())-1)",
        ]
        if anbar:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Anbar] = \"{anbar}\"")
        if sobe:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Şöbə] = \"{sobe}\"")
        if category:
            conds.append(f"'Mal satışı hesabatı (Cəm)'[Kateqoriya] = \"{category}\"")
        return f"CALCULATE({measure}, {', '.join(conds)})"

    def pbi_val(dax_expr: str) -> float:
        try:
            df = _pbi.execute_query(f"EVALUATE ROW(\"v\", {dax_expr})")
            return _safe_float(df.iloc[0, 0]) if not df.empty else 0.0
        except Exception:
            return 0.0

    def chg(curr: float, prev: float) -> float:
        return round((curr - prev) / prev * 100, 1) if prev else 0.0

    period = "Seçilmiş dövr" if (date_from or date_to) else "Bu ay"

    # KPI dəyərləri
    _T = "'Mal satışı hesabatı (Cəm)'"
    _SALES  = f"SUM({_T}[Satış Məbləği])"
    _PROFIT = f"SUM({_T}[Gelir])"
    _MARGIN = f"DIVIDE(SUM({_T}[Gelir]),SUM({_T}[Satış Məbləği]))*100"
    _STOK   = f"SUM({_T}[Miqdar])"

    sales_curr  = pbi_val(flt(_SALES))
    sales_now   = pbi_val(now_month_flt(_SALES))
    sales_prev  = pbi_val(prev_month_flt(_SALES))

    profit_curr = pbi_val(flt(_PROFIT))
    profit_now  = pbi_val(now_month_flt(_PROFIT))
    profit_prev = pbi_val(prev_month_flt(_PROFIT))

    margin_curr = pbi_val(flt(_MARGIN))
    margin_now  = pbi_val(now_month_flt(_MARGIN))
    margin_prev = pbi_val(prev_month_flt(_MARGIN))

    stok_curr   = pbi_val(flt(_STOK))

    return [
        {
            "id": "total_sales", "label": "Ümumi Satış",
            "value": sales_curr, "unit": "₼",
            "change": chg(sales_now, sales_prev),
            "trend": "up" if chg(sales_now, sales_prev) >= 0 else "down",
            "threshold": 500_000, "alert": sales_curr < 500_000,
            "period": period,
        },
        {
            "id": "profit", "label": "Gəlir",
            "value": profit_curr, "unit": "₼",
            "change": chg(profit_now, profit_prev),
            "trend": "up" if chg(profit_now, profit_prev) >= 0 else "down",
            "threshold": 50_000, "alert": profit_curr < 50_000,
            "period": period,
        },
        {
            "id": "margin", "label": "Mənfəət Marjası",
            "value": margin_curr, "unit": "%",
            "change": chg(margin_now, margin_prev),
            "trend": "up" if chg(margin_now, margin_prev) >= 0 else "down",
            "threshold": 15.0, "alert": margin_curr < 15.0,
            "period": period,
        },
        {
            "id": "inventory", "label": "Anbar Səviyyəsi",
            "value": stok_curr, "unit": "ton",
            "change": 0, "trend": "up",
            "threshold": 5_000, "alert": stok_curr < 5_000,
            "period": "Hal-hazırki",
        },
    ]


@app.get("/api/ml-status")
async def ml_status():
    """ML model məlumatı qaytarır."""
    return _ml_model.get_meta()


@app.post("/api/ml-train")
async def ml_train():
    """Modeli yenidən train edir (real PBI datası ilə)."""
    global _ml_model
    if not _initialized:
        raise HTTPException(status_code=503, detail="Power BI bağlantısı yoxdur")
    try:
        _ml_model, stats = retrain(_pbi)
        return {"status": "success", **stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/forecast")
async def forecast(req: ForecastRequest):
    """ML model əsasında satış proqnozu."""
    global _ml_model

    # Model train edilməyibsə — cəhd et
    if not _ml_model.is_trained and _initialized:
        try:
            _ml_model = init_model(_pbi)
        except Exception:
            pass

    if _ml_model.is_trained:
        try:
            return _ml_model.predict(
                product=req.product,
                region=req.region,
                price=req.price,
                volume=req.volume,
                season=req.season,
                currency=req.currency,
            )
        except Exception as e:
            # Model xətası → fallback
            import logging
            logging.getLogger(__name__).warning("ML predict xətası: %s", e)

    # Fallback: əgər model yoxdursa
    import random
    base  = req.price * req.volume * 850
    trend = [int(base * (0.88 + i * 0.03 + random.uniform(-0.01, 0.01))) for i in range(5)]
    return {
        "expected_sales":  trend[-1],
        "expected_volume": int(req.volume * 1.073),
        "change_vs_prev":  round((trend[-1] - trend[0]) / max(trend[0], 1) * 100, 1),
        "confidence":      75,
        "trend_data":      trend,
        "explanation": (
            f"{req.product} məhsulu üçün {req.region} regionunda "
            f"{req.season} mövsümündə proqnoz hesablandı (əsas model). "
            f"Qiymət {req.price} ₼/kq, həcm {req.volume} ton."
        ),
        "model_accuracy": None,
        "data_source": "fallback",
    }


# ══════════════════════════════════════════════════════════════════════════════
# SQL ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def _get_sql_server(name: str) -> Optional[dict]:
    """Server adına görə konfiqurasiyadan tapır."""
    servers = _cfg.get("SQL_SERVERS", [])
    return next((s for s in servers if s["name"].lower() == name.lower()), None)


def _get_sql_schema(name: str) -> str:
    """SQL schema-nı cache-dən qaytarır, yoxdursa çəkir."""
    if name in _sql_schema_cache:
        return _sql_schema_cache[name]
    srv = _get_sql_server(name)
    if not srv or not _sql:
        return ""
    schema = _sql.get_schema(srv["server"], srv["database"])
    _sql_schema_cache[name] = schema
    return schema


def _sql_where(date_from: str, date_to: str, anbar: str, sobe: str, category: str) -> str:
    conds = ["1=1"]
    if date_from:
        conds.append(f"tarix >= '{date_from}'")
    if date_to:
        conds.append(f"tarix <= '{date_to}'")
    if anbar:
        conds.append(f"Anbar = N'{anbar}'")
    if sobe:
        conds.append(f"[Şöbə] = N'{sobe}'")
    if category:
        conds.append(f"Kateqoriya = N'{category}'")
    return " AND ".join(conds)


@app.get("/api/kpi-alerts/sql")
async def get_kpi_alerts_sql(
    date_from: str = "",
    date_to: str = "",
    anbar: str = "",
    sobe: str = "",
    category: str = "",
):
    """SQL-dən real KPI məlumatları — filtrlər dəstəklənir."""
    if not _initialized or not _sql:
        raise HTTPException(503, "SQL client başlatılmayıb")
    srv = _get_sql_server("ErtAgro")
    if not srv:
        raise HTTPException(404, "ErtAgro SQL server tapılmadı")
    server, database = srv["server"], srv["database"]

    from datetime import datetime
    now = datetime.now()

    # Cari period WHERE
    curr_w = _sql_where(date_from, date_to, anbar, sobe, category)

    # Müqayisə periodu — bu ay vs keçən ay
    extra = ""
    if anbar:     extra += f" AND Anbar = N'{anbar}'"
    if sobe:      extra += f" AND [Şöbə] = N'{sobe}'"
    if category:  extra += f" AND Kateqoriya = N'{category}'"

    prev_month = now.month - 1 if now.month > 1 else 12
    prev_year  = now.year if now.month > 1 else now.year - 1
    curr_month_w = f"YEAR(tarix)={now.year} AND MONTH(tarix)={now.month}" + extra
    prev_month_w = f"YEAR(tarix)={prev_year} AND MONTH(tarix)={prev_month}" + extra

    def q(sql_text: str) -> float:
        try:
            df = _sql.execute_query(server, database, sql_text)
            if df.empty: return 0.0
            v = df.iloc[0, 0]
            return _safe_float(v)
        except Exception:
            return 0.0

    def change_pct(curr: float, prev: float) -> float:
        if prev == 0: return 0.0
        return round((curr - prev) / prev * 100, 1)

    # ── 1. Ümumi Satış ────────────────────────────────────────────────────────
    curr_sales = q(f"SELECT SUM([Satış Məbləği]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_w}")
    prev_sales = q(f"SELECT SUM([Satış Məbləği]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_month_w}")
    last_sales = q(f"SELECT SUM([Satış Məbləği]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {prev_month_w}")
    sales_chg  = change_pct(prev_sales, last_sales)

    # ── 2. Ümumi Miqdar ───────────────────────────────────────────────────────
    curr_vol  = q(f"SELECT SUM(Miqdar) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_w}")
    prev_vol  = q(f"SELECT SUM(Miqdar) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_month_w}")
    last_vol  = q(f"SELECT SUM(Miqdar) FROM dbo.Mal_satisi_hesabati_Cam WHERE {prev_month_w}")
    vol_chg   = change_pct(prev_vol, last_vol)

    # ── 3. Gəlir (Qazanc) ────────────────────────────────────────────────────
    curr_gelir = q(f"SELECT SUM(Gelir) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_w}")
    prev_gelir = q(f"SELECT SUM(Gelir) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_month_w}")
    last_gelir = q(f"SELECT SUM(Gelir) FROM dbo.Mal_satisi_hesabati_Cam WHERE {prev_month_w}")
    gelir_chg  = change_pct(prev_gelir, last_gelir)

    # ── 4. Orta Satış Qiyməti ─────────────────────────────────────────────────
    curr_price = q(f"SELECT AVG([Satış Qiyməti]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_w} AND [Satış Qiyməti] > 0")
    prev_price = q(f"SELECT AVG([Satış Qiyməti]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_month_w} AND [Satış Qiyməti] > 0")
    last_price = q(f"SELECT AVG([Satış Qiyməti]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {prev_month_w} AND [Satış Qiyməti] > 0")
    price_chg  = change_pct(prev_price, last_price)

    # ── 5. Kritik Stok ────────────────────────────────────────────────────────
    stok_w = "1=1"
    if anbar: stok_w += f" AND Anbar = N'{anbar}'"
    low_stock = q(
        f"SELECT COUNT(*) FROM dbo.Stok_Gun "
        f"WHERE {stok_w} AND [Planlanılan Gün Sayı] IS NOT NULL AND [Minimum Gün] IS NOT NULL "
        f"AND [Planlanılan Gün Sayı] < [Minimum Gün]"
    )

    # ── 6. Cashback ───────────────────────────────────────────────────────────
    curr_cb = q(f"SELECT SUM([Cashback Məbləği]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_w}")
    prev_cb = q(f"SELECT SUM([Cashback Məbləği]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {curr_month_w}")
    last_cb = q(f"SELECT SUM([Cashback Məbləği]) FROM dbo.Mal_satisi_hesabati_Cam WHERE {prev_month_w}")
    cb_chg  = change_pct(prev_cb, last_cb)

    return [
        {
            "id": "total_sales", "label": "Ümumi Satış",
            "value": curr_sales, "unit": "₼",
            "change": sales_chg, "trend": "up" if sales_chg >= 0 else "down",
            "threshold": 500_000, "alert": curr_sales < 500_000,
            "period": "Seçilmiş dövr" if (date_from or date_to) else "Bu ay",
        },
        {
            "id": "total_volume", "label": "Ümumi Miqdar",
            "value": curr_vol, "unit": "kq",
            "change": vol_chg, "trend": "up" if vol_chg >= 0 else "down",
            "threshold": 5_000, "alert": curr_vol < 5_000,
            "period": "Seçilmiş dövr" if (date_from or date_to) else "Bu ay",
        },
        {
            "id": "profit", "label": "Gəlir (Qazanc)",
            "value": curr_gelir, "unit": "₼",
            "change": gelir_chg, "trend": "up" if gelir_chg >= 0 else "down",
            "threshold": 50_000, "alert": curr_gelir < 50_000,
            "period": "Seçilmiş dövr" if (date_from or date_to) else "Bu ay",
        },
        {
            "id": "avg_price", "label": "Orta Satış Qiyməti",
            "value": curr_price, "unit": "₼/kq",
            "change": price_chg, "trend": "up" if price_chg >= 0 else "down",
            "threshold": 1.0, "alert": curr_price < 1.0,
            "period": "Seçilmiş dövr" if (date_from or date_to) else "Bu ay",
        },
        {
            "id": "low_stock", "label": "Kritik Stok",
            "value": low_stock, "unit": "mal",
            "change": 0, "trend": "down",
            "threshold": 20, "alert": low_stock > 20,
            "period": "Hal-hazırki",
        },
        {
            "id": "cashback", "label": "Cashback Məbləği",
            "value": curr_cb, "unit": "₼",
            "change": cb_chg, "trend": "up" if cb_chg >= 0 else "down",
            "threshold": 0, "alert": False,
            "period": "Seçilmiş dövr" if (date_from or date_to) else "Bu ay",
        },
    ]


@app.post("/api/send-email")
async def send_email(req: EmailRequest):
    """Microsoft Graph API ilə KPI məlumatını email göndərir."""
    import requests as http_req
    from datetime import datetime

    sender = _cfg.get("SMTP_USER", "")
    if not sender:
        raise HTTPException(500, "SMTP_USER konfiqurasiyası tapılmadı")

    # Graph API üçün token al
    import msal
    authority = f"https://login.microsoftonline.com/{_cfg['TENANT_ID']}"
    app_msal = msal.ConfidentialClientApplication(
        _cfg["CLIENT_ID"], authority=authority, client_credential=_cfg["CLIENT_SECRET"]
    )
    result = app_msal.acquire_token_for_client(
        scopes=["https://graph.microsoft.com/.default"]
    )
    if "access_token" not in result:
        raise HTTPException(500, f"Graph token xətası: {result.get('error_description', result)}")

    token = result["access_token"]

    alert_badge = "KRİTİK" if req.kpi_alert else "Normal"
    trend_arrow = "↑" if req.kpi_trend == "up" else "↓"
    change_color = "#16a34a" if req.kpi_trend == "up" else "#dc2626"
    now_str = datetime.now().strftime("%d.%m.%Y %H:%M")

    html = f"""
    <html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;
                box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="background:#166534;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">ErtAgro KPI Bildirisi</h2>
        <p style="color:#bbf7d0;margin:4px 0 0;font-size:13px;">{now_str}</p>
      </div>
      <div style="padding:24px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:16px;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">
            {req.kpi_label}
          </p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#111827;">
            {req.kpi_value} <span style="font-size:14px;color:#6b7280;">{req.kpi_unit}</span>
          </p>
          <div style="margin-top:8px;">
            <span style="font-size:13px;font-weight:600;color:{change_color};">
              {trend_arrow} {req.kpi_change:+.1f}%
            </span>
            &nbsp;&nbsp;
            <span style="font-size:12px;color:#9ca3af;">kecen ayla muqayisede</span>
            &nbsp;&nbsp;
            <span style="font-size:12px;font-weight:600;">{alert_badge}</span>
          </div>
        </div>
        {f'<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:16px;"><p style="margin:0;font-size:13px;color:#92400e;">Filtr: {req.filters_info}</p></div>' if req.filters_info else ''}
        {f'<div style="border-left:3px solid #166534;padding:8px 12px;margin-bottom:16px;"><p style="margin:0;font-size:13px;color:#374151;">{req.extra_message}</p></div>' if req.extra_message else ''}
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
          ErtAgro Analytics Platform
        </p>
      </div>
    </div>
    </body></html>
    """

    payload = {
        "message": {
            "subject": f"ErtAgro KPI: {req.kpi_label} - {req.kpi_value} {req.kpi_unit}",
            "body": {"contentType": "HTML", "content": html},
            "toRecipients": [{"emailAddress": {"address": req.to_email}}],
        },
        "saveToSentItems": "false",
    }

    try:
        resp = http_req.post(
            f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        if resp.status_code == 202:
            return {"status": "ok", "message": f"Email {req.to_email} unvanina gonderildi"}
        raise HTTPException(500, f"Graph API xetasi {resp.status_code}: {resp.text[:300]}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Email gondərme xetasi: {e}")


@app.get("/api/sql/databases")
async def sql_databases():
    """Konfiqurasiya edilmiş SQL serverlərin siyahısı."""
    servers = _cfg.get("SQL_SERVERS", [])
    result = []
    for srv in servers:
        result.append({
            "name": srv["name"],
            "server": srv["server"],
            "database": srv["database"],
        })
    return result


@app.get("/api/sql/schema")
async def sql_schema(db: str = "ErtAgro"):
    """SQL cədvəl strukturunu qaytarır."""
    if not _initialized or not _sql:
        return {"tables": [], "error": "SQL client başlatılmayıb"}
    srv = _get_sql_server(db)
    if not srv:
        raise HTTPException(status_code=404, detail=f"'{db}' adlı SQL server tapılmadı")
    try:
        sql_text = """
        SELECT t.TABLE_SCHEMA, t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE
        FROM INFORMATION_SCHEMA.TABLES t
        JOIN INFORMATION_SCHEMA.COLUMNS c
            ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
        WHERE t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
        """
        df = _sql.execute_query(srv["server"], srv["database"], sql_text)
        tables: dict = {}
        for _, row in df.iterrows():
            tname = f"{row['TABLE_SCHEMA']}.{row['TABLE_NAME']}"
            if tname not in tables:
                tables[tname] = {"name": tname, "columns": []}
            tables[tname]["columns"].append({"name": row["COLUMN_NAME"], "type": row["DATA_TYPE"]})
        return {"tables": list(tables.values()), "database": db}
    except Exception as e:
        return {"tables": [], "error": str(e)}


@app.get("/api/sql/test")
async def sql_test(db: str = "ErtAgro"):
    """SQL bağlantısını yoxlayır."""
    if not _initialized or not _sql:
        return {"status": "error", "message": "SQL client başlatılmayıb"}
    srv = _get_sql_server(db)
    if not srv:
        return {"status": "error", "message": f"'{db}' tapılmadı"}
    ok, msg = _sql.test_connection(srv["server"], srv["database"])
    if ok and _ctx_builder:
        _ctx_builder.invalidate(srv["server"], srv["database"])
    return {"status": "success" if ok else "error", "message": msg, "database": db}


@app.post("/api/sql/chat")
async def sql_chat(req: SQLChatRequest):
    """NL → SQL → Data → Cavab (SQL Server mənbəyi)."""
    if not _initialized or not _sql or not _llm:
        raise HTTPException(status_code=503, detail="Xidmət başlatılmayıb")

    srv = _get_sql_server(req.server_name)
    if not srv:
        raise HTTPException(status_code=404, detail=f"'{req.server_name}' adlı SQL server tapılmadı")

    # RAG kontekst — real dəyərləri ehtiva edir (cache-dən gəlir)
    schema = _ctx_builder.build(srv["server"], srv["database"], req.server_name)

    # Step 1: NL → SQL
    try:
        sql_query, _ = _llm.nl_to_sql(question=req.question, schema=schema)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SQL yarada bilmədim: {e}")

    # Təhlükəsizlik yoxlaması — yalnız SELECT
    first_word = sql_query.strip().split()[0].upper() if sql_query.strip() else ""
    if first_word not in ("SELECT", "WITH"):
        raise HTTPException(status_code=400, detail="Yalnız SELECT sorğuları icazəlidir")

    # Step 2: SQL → Data (xəta olarsa auto-retry)
    df = None
    last_error = ""
    for attempt in range(2):
        try:
            df = _sql.execute_query(srv["server"], srv["database"], sql_query)
            break
        except Exception as e:
            last_error = str(e)
            if attempt == 0:
                try:
                    sql_query, _ = _llm.fix_sql(sql_query, last_error, schema)
                    first_word = sql_query.strip().split()[0].upper() if sql_query.strip() else ""
                    if first_word not in ("SELECT", "WITH"):
                        break
                except Exception:
                    break

    if df is None:
        raise HTTPException(status_code=500, detail=f"SQL xətası: {last_error}")

    # Step 3: Data → Answer
    try:
        answer, _ = _llm.data_to_answer(req.question, sql_query, df)
    except Exception:
        answer = "Cavab formatlana bilmədi."

    # Step 4: Chart
    chart_data = None
    try:
        chart_spec, _ = _llm.suggest_chart(req.question, df)
        if chart_spec and chart_spec.get("type") != "none" and not df.empty:
            x_key = chart_spec.get("x", df.columns[0])
            y_key = chart_spec.get("y", df.columns[1] if len(df.columns) > 1 else df.columns[0])
            rows = []
            for _, row in df.iterrows():
                try:
                    rows.append({
                        x_key: str(row.get(x_key, "")),
                        y_key: _safe_float(row.get(y_key, 0)),
                    })
                except Exception:
                    pass
            chart_data = {
                "type": chart_spec["type"],
                "data": rows,
                "xKey": x_key,
                "yKey": y_key,
                "title": chart_spec.get("title", req.question[:40]),
            }
    except Exception:
        pass

    # Step 5: Metrics
    metrics = []
    if not df.empty:
        if len(df) == 1:
            for col in df.columns:
                val = df.iloc[0][col]
                metrics.append({"label": col, "value": str(val) if pd.notna(val) else "—", "change": None})
        else:
            metrics = [{"label": f"{len(df)} sətir", "value": "", "change": None}]

    return {
        "answer": answer,
        "sql": sql_query,
        "chart": chart_data,
        "metrics": metrics,
        "rows": df.to_dict(orient="records") if not df.empty and len(df) <= 100 else [],
        "row_count": len(df),
        "source": f"SQL Server – {req.server_name} ({srv['database']})",
        "model": _cfg.get("AZURE_OPENAI_DEPLOYMENT", "GPT-4o"),
        "confidence": 90,
        "timestamp": pd.Timestamp.now().isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# REACT STATIC FILES  (build olunmuş frontend)
# ══════════════════════════════════════════════════════════════════════════════
STATIC_DIR = Path(__file__).parent / "frontend_dist"


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """React SPA üçün catch-all. Fayl varsa qaytarır, yoxdursa index.html."""
    if not STATIC_DIR.exists():
        return JSONResponse(
            {"detail": "Frontend hələ build olunmayıb. "
                       "ertagro-platform/frontend/ içində `npm run build` işlət."},
            status_code=503,
        )
    target = STATIC_DIR / full_path
    if target.is_file():
        return FileResponse(str(target))
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(status_code=404)
