"""
Uğurlu DAX sorğularını yadda saxlayır.
Növbəti sorğularda few-shot nümunə kimi istifadə olunur.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List

_FILE = Path(__file__).parent / "query_memory.json"
_MAX = 300


def _jaccard(a: str, b: str) -> float:
    t1 = set(re.findall(r'\w+', a.lower()))
    t2 = set(re.findall(r'\w+', b.lower()))
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / len(t1 | t2)


class QueryMemory:
    def __init__(self):
        self._data: List[dict] = []
        self._load()

    def _load(self):
        try:
            if _FILE.exists():
                self._data = json.loads(
                    _FILE.read_text(encoding="utf-8")
                ).get("entries", [])
        except Exception:
            self._data = []

    def _save(self):
        try:
            _FILE.write_text(
                json.dumps(
                    {"entries": self._data[-_MAX:]},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception:
            pass  # Render-də fayl sistemi ephemeral ola bilər — in-memory işləyir

    def record_success(self, question: str, dax: str, dataset_id: str = ""):
        """Uğurlu sorğunu saxla. Eyni sual varsa yenilə."""
        for e in self._data:
            if (
                e.get("question") == question
                and e.get("ok")
                and e.get("ds") == dataset_id
            ):
                e["dax"] = dax
                e["ts"] = datetime.now().isoformat()
                self._save()
                return
        self._data.append({
            "question": question,
            "dax": dax,
            "ds": dataset_id,
            "ok": True,
            "ts": datetime.now().isoformat(),
        })
        self._save()

    def record_failure(self, question: str, dax: str, error: str, dataset_id: str = ""):
        """Uğursuz sorğunu qeydə al."""
        self._data.append({
            "question": question,
            "dax": dax,
            "ds": dataset_id,
            "ok": False,
            "error": error[:200],
            "ts": datetime.now().isoformat(),
        })
        self._save()

    def similar(self, question: str, dataset_id: str = "", limit: int = 3) -> List[dict]:
        """Oxşar uğurlu sorğuları tap (Jaccard similarity)."""
        pool = [
            e for e in self._data
            if e.get("ok") and (not dataset_id or e.get("ds") == dataset_id)
        ]
        ranked = sorted(
            pool,
            key=lambda e: _jaccard(question, e["question"]),
            reverse=True,
        )
        return [e for e in ranked[:limit] if _jaccard(question, e["question"]) > 0.1]

    def stats(self) -> dict:
        total = len(self._data)
        ok = sum(1 for e in self._data if e.get("ok"))
        return {
            "total": total,
            "success": ok,
            "failed": total - ok,
            "success_rate": round(ok / total * 100, 1) if total else 0.0,
        }

    def recent(self, limit: int = 20) -> List[dict]:
        """Son sorğuları qaytarır."""
        return list(reversed(self._data[-limit:]))
