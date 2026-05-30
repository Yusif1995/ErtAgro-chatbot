"""Config loader - .env-dən məlumat alır, çoxlu dataset dəstəyi"""

import os
import json
from pathlib import Path


def load_config():
    env_path = Path(__file__).parent / ".env"

    if env_path.exists():
        try:
            content = env_path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError:
            content = env_path.read_text(encoding="utf-16")

        for raw in content.splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            val = v.strip().strip('"').strip("'").strip()
            if val:
                os.environ[k.strip()] = val

    required = [
        "TENANT_ID", "CLIENT_ID", "CLIENT_SECRET",
        "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT",
    ]

    cfg = {}
    missing = []
    for k in required:
        v = os.environ.get(k, "").strip()
        if not v:
            missing.append(k)
        cfg[k] = v

    # Datasets - JSON formatda
    datasets_json = os.environ.get("DATASETS_JSON", "").strip()
    if not datasets_json:
        # Fallback: köhnə formata dəstək
        ws = os.environ.get("WORKSPACE_ID", "").strip()
        ds = os.environ.get("DATASET_ID", "").strip()
        if ws and ds:
            cfg["DATASETS"] = [{"name": "Default", "workspace_id": ws, "dataset_id": ds}]
        else:
            missing.append("DATASETS_JSON")
            cfg["DATASETS"] = []
    else:
        try:
            cfg["DATASETS"] = json.loads(datasets_json)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"DATASETS_JSON səhv formatdadır: {e}")

    if missing:
        raise RuntimeError(f"Bu environment variable-lar tapılmadı: {', '.join(missing)}")

    cfg["SMTP_HOST"] = os.environ.get("SMTP_HOST", "smtp.office365.com").strip()
    cfg["SMTP_PORT"] = int(os.environ.get("SMTP_PORT", "587").strip())
    cfg["SMTP_USER"] = os.environ.get("SMTP_USER", "").strip()
    cfg["SMTP_PASS"] = os.environ.get("SMTP_PASS", "").strip()
    cfg["EMAIL_FROM"] = os.environ.get("EMAIL_FROM", cfg["SMTP_USER"]).strip()

    cfg["AZURE_OPENAI_API_VERSION"] = os.environ.get(
        "AZURE_OPENAI_API_VERSION", "2024-10-21"
    ).strip()

    # SQL Servers — JSON formatda
    sql_json = os.environ.get("SQL_SERVERS_JSON", "").strip()
    if sql_json:
        try:
            cfg["SQL_SERVERS"] = json.loads(sql_json)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"SQL_SERVERS_JSON səhv formatdadır: {e}")
    else:
        cfg["SQL_SERVERS"] = []

    return cfg
