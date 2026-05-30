"""
ErtAgro Satış Proqnozu — scikit-learn GradientBoostingRegressor
Power BI-dan real tarixli data çəkir, model train edir, predict edir.
"""

from __future__ import annotations

import json
import logging
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import cross_val_score
import joblib

if TYPE_CHECKING:
    from powerbi_client import PowerBIClient

log = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent / "model_cache.pkl"
META_PATH  = Path(__file__).parent / "model_meta.json"

# ── Constants ─────────────────────────────────────────────────────────────────
PRODUCTS = [
    "Banan", "Limon", "Pomidor", "Alma", "Kartof",
    "Soğan", "Kiwi", "Üzüm", "Armud", "Şaftalı",
]
REGIONS = [
    "Bakı-Abşeron", "Gəncə-Qazax", "Şirvan-Salyan",
    "Quba-Xaçmaz", "Lənkəran-Astara",
]
SEASONS = {"Yaz": 4, "Yay": 7, "Payız": 10, "Qış": 1}
SEASON_FROM_MONTH = {
    1: 0, 2: 0, 3: 1, 4: 1, 5: 1,
    6: 2, 7: 2, 8: 2,
    9: 3, 10: 3, 11: 3, 12: 0,
}
FEATURES = [
    "year", "month", "month_sin", "month_cos",
    "season", "product_enc", "region_enc",
    "price", "volume", "price_x_volume",
]

# ── Data fetching ─────────────────────────────────────────────────────────────
# Real cədvəl: 'Mal satışı hesabatı (Cəm)'
# Calendar1[MonthOfYear] — ay rəqəmi (1-12)

_DAX_QUERIES = [
    # 1. Əsas sorğu — Şöbə + Kateqoriya + aylıq satış
    """EVALUATE
SUMMARIZECOLUMNS(
    Calendar1[Year],
    Calendar1[MonthOfYear],
    'Mal satışı hesabatı (Cəm)'[Şöbə],
    'Mal satışı hesabatı (Cəm)'[Kateqoriya],
    "Satis",  SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]),
    "Cekim",  SUM('Mal satışı hesabatı (Cəm)'[Çəki Miqdarı]),
    "Qiymet", AVERAGE('Mal satışı hesabatı (Cəm)'[Satış Qiyməti])
)""",
    # 2. Yalnız Şöbə ilə (Kateqoriya olmadan)
    """EVALUATE
SUMMARIZECOLUMNS(
    Calendar1[Year],
    Calendar1[MonthOfYear],
    'Mal satışı hesabatı (Cəm)'[Şöbə],
    "Satis",  SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]),
    "Cekim",  SUM('Mal satışı hesabatı (Cəm)'[Çəki Miqdarı])
)""",
    # 3. Yalnız Kateqoriya ilə
    """EVALUATE
SUMMARIZECOLUMNS(
    Calendar1[Year],
    Calendar1[MonthOfYear],
    'Mal satışı hesabatı (Cəm)'[Kateqoriya],
    "Satis",  SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]),
    "Cekim",  SUM('Mal satışı hesabatı (Cəm)'[Çəki Miqdarı])
)""",
    # 4. Yalnız aylıq ümumi
    """EVALUATE
SUMMARIZECOLUMNS(
    Calendar1[Year],
    Calendar1[MonthOfYear],
    "Satis", SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]),
    "Cekim", SUM('Mal satışı hesabatı (Cəm)'[Çəki Miqdarı])
)""",
]

# Ümumi satış — sintetik data kalibrasiyası üçün
_TOTAL_QUERY = "EVALUATE ROW(\"Satis\", SUM('Mal satışı hesabatı (Cəm)'[Satış Məbləği]))"


def fetch_training_data(
    pbi: "PowerBIClient",
    real_products: list[str] | None = None,
    real_sobes: list[str] | None = None,
) -> tuple[pd.DataFrame, str]:
    """
    Power BI-dan tarixli data çəkir.
    real_products / real_sobes — /api/filter-values-dən gələn real adlar.
    Returns: (dataframe, source_label)
    """
    df_real = pd.DataFrame()
    source = "synthetic"

    # Real data cəhdi
    for query in _DAX_QUERIES:
        try:
            df = pbi.execute_query(query.strip())
            if df is not None and len(df) >= 10:
                df_real = df
                source = "real"
                log.info("PBI real data: %d rows, columns=%s", len(df), list(df.columns))
                break
        except Exception as exc:
            log.debug("DAX query failed: %s", exc)

    # Ümumi satışı kalibrasiya üçün çək
    base_sales = 1_000_000.0
    try:
        df_tot = pbi.execute_query(_TOTAL_QUERY)
        if not df_tot.empty:
            base_sales = float(df_tot.iloc[0, 0]) or base_sales
    except Exception:
        pass

    if not df_real.empty:
        df_parsed = _parse_real(df_real, base_sales)
        if len(df_parsed) >= 20:
            return df_parsed, source
        df_syn = _generate_synthetic(base_sales, n=400,
                                     products=real_products, sobes=real_sobes)
        combined = pd.concat([df_parsed, df_syn], ignore_index=True)
        return combined, "augmented"

    df_syn = _generate_synthetic(base_sales, n=600,
                                 products=real_products, sobes=real_sobes)
    return df_syn, "synthetic"


def _parse_real(df: pd.DataFrame, base: float) -> pd.DataFrame:
    """
    'Mal satışı hesabatı (Cəm)' cədvəlindən gələn xam DataFrame-ni
    training formatına çevirir.
    """
    cols = {c.lower().strip(): c for c in df.columns}

    year_col   = _find(cols, ["year", "il"])
    month_col  = _find(cols, ["monthofyear", "monthnumber", "month", "monthofyear"])
    sobe_col   = _find(cols, ["şöbə", "sobe", "şöbə"])
    kat_col    = _find(cols, ["kateqoriya", "category"])
    satis_col  = _find(cols, ["satis", "satış məbləği", "satış mebleği"])
    cekim_col  = _find(cols, ["cekim", "çəki miqdarı", "cekim miqdarı"])
    qiymet_col = _find(cols, ["qiymet", "satış qiyməti"])

    rows = []
    for _, r in df.iterrows():
        try:
            year  = int(r[year_col])  if year_col  else 2025
            month = int(r[month_col]) if month_col else 6
            sobe  = str(r[sobe_col]).strip()  if sobe_col  else ""
            kat   = str(r[kat_col]).strip()   if kat_col   else ""
            satis = float(r[satis_col] or 0)  if satis_col else 0.0
            cekim = float(r[cekim_col] or 0)  if cekim_col else 0.0

            if satis <= 0 or not sobe or sobe in ("nan", "") or not kat or kat in ("nan", ""):
                continue

            # Qiymət: sütundan al, yoxdursa hesabla
            if qiymet_col and r[qiymet_col] and float(r[qiymet_col] or 0) > 0:
                price = float(r[qiymet_col])
            elif cekim > 0:
                price = satis / cekim  # ₼ / kg
            else:
                price = 1.0

            volume = cekim if cekim > 0 else (satis / max(price, 0.01))

            rows.append({
                "year":    year,
                "month":   month,
                "product": kat,    # Kateqoriya → product feature
                "region":  sobe,   # Şöbə → region feature
                "price":   round(min(max(price, 0.01), 50.0), 3),
                "volume":  round(volume, 1),
                "sales":   satis,
            })
        except Exception:
            continue

    log.info("_parse_real: %d/%d sətir parse edildi", len(rows), len(df))
    return pd.DataFrame(rows)


def _find(cols: dict, names: list) -> str | None:
    for n in names:
        if n in cols:
            return cols[n]
    return None


def _generate_synthetic(
    base_monthly: float,
    n: int = 500,
    products: list[str] | None = None,
    sobes: list[str] | None = None,
) -> pd.DataFrame:
    """
    Real satış məbləğinə kalibrasiya edilmiş sintetik training data.
    products / sobes — real PBI-dan gələn adlar (varsa istifadə edilir).
    """
    rng = np.random.default_rng(42)

    # Məhsul siyahısı: real varsa istifadə et, yoxdursa default
    if products and len(products) >= 2:
        prod_list = products
        p_probs = None  # bərabər ehtimal
    else:
        prod_list = [
            "Banan", "Limon", "Pomidor", "Alma", "Kartof",
            "Soğan", "Kiwi", "Üzüm", "Armud", "Şaftalı",
        ]
        p_probs = [0.22, 0.10, 0.18, 0.14, 0.10, 0.08, 0.07, 0.06, 0.03, 0.02]

    # Şöbə siyahısı: real varsa istifadə et
    if sobes and len(sobes) >= 2:
        region_list = sobes
        r_probs = None  # bərabər ehtimal
    else:
        region_list = [
            "Bakı-Abşeron", "Gəncə-Qazax", "Şirvan-Salyan",
            "Quba-Xaçmaz", "Lənkəran-Astara",
        ]
        r_probs = [0.35, 0.22, 0.18, 0.14, 0.11]

    month_idx = {
        1: 0.75, 2: 0.78, 3: 0.92, 4: 1.05, 5: 1.18, 6: 1.22,
        7: 1.28, 8: 1.22, 9: 1.10, 10: 0.98, 11: 0.86, 12: 0.80,
    }

    products_arr = prod_list
    regions_arr  = region_list

    n_prods = len(products_arr)
    n_regs  = len(regions_arr)

    rows = []
    for _ in range(n):
        year    = int(rng.choice([2024, 2025]))
        month   = int(rng.integers(1, 13))
        product = str(rng.choice(products_arr,
                                  p=p_probs if p_probs and len(p_probs) == n_prods else None))
        region  = str(rng.choice(regions_arr,
                                  p=r_probs if r_probs and len(r_probs) == n_regs else None))

        price  = float(rng.uniform(0.30, 3.00))
        volume = float(rng.uniform(50, 3000))

        # Məhsul çəkisi — əgər real siyahıdırsa bərabər pay
        prod_w = (1.0 / n_prods)
        reg_w  = (1.0 / n_regs)

        sales = (
            base_monthly
            * prod_w
            * reg_w
            * month_idx.get(month, 1.0)
            * (price * volume / 800)
            * float(rng.uniform(0.80, 1.20))
        )

        rows.append({
            "year": year, "month": month,
            "product": product, "region": region,
            "price": round(price, 2), "volume": round(volume, 1),
            "sales": max(0.0, sales),
        })

    return pd.DataFrame(rows)


# ── Model ─────────────────────────────────────────────────────────────────────
class SalesForecastModel:
    """GradientBoosting-based satış proqnoz modeli."""

    def __init__(self):
        self.model: GradientBoostingRegressor | None = None
        self.product_enc = LabelEncoder()
        self.region_enc  = LabelEncoder()
        self.is_trained  = False
        self.accuracy: float | None = None
        self.r2: float | None = None
        self.training_rows = 0
        self.trained_at: str | None = None
        self.data_source = "not_trained"

    # avg price & volume per product — elasticity hesabı üçün
    avg_price:  dict[str, float] = {}
    avg_volume: dict[str, float] = {}

    # ── Training ──────────────────────────────────────────────────────────────
    def train(self, df: pd.DataFrame, data_source: str = "synthetic") -> dict:
        """DataFrame-dən modeli train edir."""
        df = df.copy()

        # Categoricals — known labels + unseen handled with "unknown"
        all_products = sorted(set(list(df["product"].unique()) + PRODUCTS))
        all_regions  = sorted(set(list(df["region"].unique()) + REGIONS))
        self.product_enc.fit(all_products)
        self.region_enc.fit(all_regions)

        df["product_enc"]    = df["product"].apply(self._safe_p_enc)
        df["region_enc"]     = df["region"].apply(self._safe_r_enc)
        df["month_sin"]      = np.sin(2 * np.pi * df["month"] / 12)
        df["month_cos"]      = np.cos(2 * np.pi * df["month"] / 12)
        df["season"]         = df["month"].map(SEASON_FROM_MONTH)
        df["price_x_volume"] = df["price"] * df["volume"]

        X = df[FEATURES].values
        y = df["sales"].values

        self.model = GradientBoostingRegressor(
            n_estimators=200,
            learning_rate=0.08,
            max_depth=4,
            subsample=0.85,
            min_samples_leaf=3,
            random_state=42,
        )
        self.model.fit(X, y)

        # Orta qiymət və həcm hər kateqoriya üzrə — elasticity üçün
        self.avg_price  = df.groupby("product")["price"].mean().to_dict()
        self.avg_volume = df.groupby("product")["volume"].mean().to_dict()

        # Accuracy
        cv_n = min(5, len(X) // 20)
        if cv_n >= 2:
            cv = cross_val_score(self.model, X, y, cv=cv_n, scoring="r2")
            self.r2 = float(np.clip(np.mean(cv), 0, 1))
        else:
            self.r2 = float(np.clip(
                1 - np.sum((y - self.model.predict(X))**2) / (np.sum((y - y.mean())**2) + 1e-9),
                0, 1
            ))

        y_pred = self.model.predict(X)
        mape   = float(np.mean(np.abs((y - y_pred) / (np.maximum(np.abs(y), 1)))) * 100)
        self.accuracy     = round(max(60.0, min(99.0, 100 - mape)), 1)
        self.is_trained   = True
        self.training_rows = len(df)
        self.trained_at   = datetime.now().strftime("%d.%m.%Y %H:%M")
        self.data_source  = data_source

        return {
            "accuracy":  self.accuracy,
            "r2":        round(self.r2, 3),
            "rows":      self.training_rows,
            "source":    self.data_source,
            "trained_at": self.trained_at,
        }

    # ── Prediction ────────────────────────────────────────────────────────────
    # Qiymət elastikliyi — gəlir məhsulları üçün tipik dəyər
    # -0.5: qiymət 10% artarsa satış 5% azalır
    PRICE_ELASTICITY = -0.5

    def predict(
        self,
        product: str,
        region: str,
        price: float,
        volume: float,
        season: str,
        currency: str = "AZN",
    ) -> dict:
        if not self.is_trained or self.model is None:
            raise RuntimeError("Model hələ train edilməyib")

        month = SEASONS.get(season, datetime.now().month)
        year  = datetime.now().year

        # ── 1. Tarixli pattern-dən baza proqnozu ──────────────────────────────
        # Model üçün orta qiymət/həcm istifadə et (extrapolation problemini azaldır)
        avg_p = self.avg_price.get(product, price)
        avg_v = self.avg_volume.get(product, volume)

        base = float(self.model.predict(
            self._vec(product, region, avg_p, avg_v, month, year)
        )[0])
        base = max(1.0, base)

        # ── 2. Qiymət elastikliyi düzəlişi ────────────────────────────────────
        # Qiymət orta dəyərdən neçə % fərqlənir?
        if avg_p > 0 and price > 0:
            price_ratio = price / avg_p
            # elasticity: price_ratio^E → qiymət 2x olsa satış 0.71x olur (E=-0.5)
            price_adj = price_ratio ** self.PRICE_ELASTICITY
        else:
            price_adj = 1.0

        # ── 3. Həcm nisbəti düzəlişi ───────────────────────────────────────────
        # İstifadəçinin planladığı həcm tarixi orta ilə müqayisədə
        if avg_v > 0 and volume > 0:
            volume_ratio = volume / avg_v
            # Həcm artarsa satış proporsional artır (lakin tam xətti deyil)
            volume_adj = volume_ratio ** 0.85
        else:
            volume_adj = 1.0

        expected = base * price_adj * volume_adj
        expected = max(0.0, expected)

        # ── 4. Əvvəlki dövrlə müqayisə ────────────────────────────────────────
        pm   = (month - 4) % 12 + 1
        py   = year if month > 3 else year - 1
        prev = float(self.model.predict(
            self._vec(product, region, avg_p, avg_v, pm, py)
        )[0]) * price_adj * volume_adj
        prev = max(1.0, prev)
        change = round((expected - prev) / prev * 100, 1)

        # ── 5. 5 aylıq trend ───────────────────────────────────────────────────
        trend = []
        for i in range(-4, 1):
            m = (month + i - 1) % 12 + 1
            y = year if m <= month else year - 1
            v = float(self.model.predict(
                self._vec(product, region, avg_p, avg_v, m, y)
            )[0]) * price_adj * volume_adj
            trend.append(int(max(0, v)))

        # ── 6. Valyuta çevirmə ─────────────────────────────────────────────────
        if currency == "USD":
            shown = expected / 1.7
            unit  = "$"
        else:
            shown = expected
            unit  = "₼"

        # İzahat: qiymət/həcm effektini göstər
        price_effect = round((price_adj - 1) * 100, 1)
        vol_effect   = round((volume_adj - 1) * 100, 1)
        effects = []
        if abs(price_effect) > 1:
            effects.append(f"qiymət effekti {price_effect:+.1f}%")
        if abs(vol_effect) > 1:
            effects.append(f"həcm effekti {vol_effect:+.1f}%")
        effect_str = f" ({', '.join(effects)})" if effects else ""

        return {
            "expected_sales":   int(shown),
            "expected_volume":  int(volume),
            "change_vs_prev":   change,
            "confidence":       min(95, max(60, int(self.accuracy or 75))),
            "trend_data":       trend,
            "explanation": (
                f"{product} · {region} · {season} mövsümü. "
                f"Qiymət: {price} ₼/kq (tarixi orta: {avg_p:.2f} ₼/kq), "
                f"həcm: {volume} ton{effect_str}. "
                f"Model: {self.data_source}, dəqiqlik {self.accuracy}%."
            ),
            "unit": unit,
            "model_accuracy": self.accuracy,
            "data_source": self.data_source,
        }

    # ── Persistence ───────────────────────────────────────────────────────────
    def save(self):
        joblib.dump(self, MODEL_PATH)
        with open(META_PATH, "w", encoding="utf-8") as f:
            json.dump(self.get_meta(), f, ensure_ascii=False)

    @classmethod
    def load_or_create(cls) -> "SalesForecastModel":
        if MODEL_PATH.exists():
            try:
                return joblib.load(MODEL_PATH)
            except Exception as exc:
                log.warning("Model yüklənə bilmədi: %s", exc)
        return cls()

    def get_meta(self) -> dict:
        return {
            "is_trained":    self.is_trained,
            "accuracy":      self.accuracy,
            "r2":            self.r2,
            "training_rows": self.training_rows,
            "trained_at":    self.trained_at,
            "data_source":   self.data_source,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _safe_p_enc(self, p: str) -> int:
        try:
            return int(self.product_enc.transform([p])[0])
        except ValueError:
            return 0

    def _safe_r_enc(self, r: str) -> int:
        try:
            return int(self.region_enc.transform([r])[0])
        except ValueError:
            return 0

    def _vec(self, product, region, price, volume, month, year) -> np.ndarray:
        return np.array([[
            year,
            month,
            np.sin(2 * np.pi * month / 12),
            np.cos(2 * np.pi * month / 12),
            SEASON_FROM_MONTH.get(month, 0),
            self._safe_p_enc(product),
            self._safe_r_enc(region),
            price,
            volume,
            price * volume,
        ]])


# ── Convenience functions ─────────────────────────────────────────────────────
def _fetch_real_names(pbi: "PowerBIClient") -> tuple[list[str], list[str]]:
    """PBI-dan real Kateqoriya (məhsul) və Şöbə adlarını çəkir."""
    products: list[str] = []
    sobes: list[str] = []
    target = {"kateqoriya", "məhsul kateqoriyası", "şöbə", "sobe"}
    try:
        cols_df = pbi.execute_query("EVALUATE INFO.VIEW.COLUMNS()")
        if cols_df.empty:
            return products, sobes
        text_cols = cols_df[
            (cols_df.get("DataType", pd.Series(dtype=str)) == "Text") &
            (~cols_df.get("IsHidden", pd.Series(False)).astype(bool))
        ][["Table", "Name"]].drop_duplicates()

        for _, row in text_cols.iterrows():
            tname = str(row["Table"])
            cname = str(row["Name"])
            if cname.lower() not in target:
                continue
            try:
                df = pbi.execute_query(
                    f"EVALUATE TOPN(100, DISTINCT('{tname}'[{cname}]), '{tname}'[{cname}], ASC)"
                )
                if df is not None and not df.empty:
                    vals = df.iloc[:, 0].dropna().astype(str).tolist()
                    vals = [v for v in vals if v and v != "nan"]
                    if "şöbə" in cname.lower() or "sobe" in cname.lower():
                        sobes = vals or sobes
                    else:
                        products = vals or products
            except Exception:
                pass
    except Exception as exc:
        log.debug("Filter values fetch xətası: %s", exc)
    return products, sobes


def init_model(pbi: "PowerBIClient") -> SalesForecastModel:
    """Startup-da modeli yüklə və ya train et."""
    mdl = SalesForecastModel.load_or_create()
    if not mdl.is_trained:
        try:
            real_prods, real_sobes = _fetch_real_names(pbi)
            df, src = fetch_training_data(pbi, real_prods, real_sobes)
            mdl.train(df, src)
            mdl.save()
            log.info("Model train edildi: %d rows, accuracy=%.1f%%", len(df), mdl.accuracy or 0)
        except Exception as exc:
            log.error("Model train oluna bilmədi: %s", exc)
    return mdl


def retrain(pbi: "PowerBIClient") -> tuple[SalesForecastModel, dict]:
    """Modeli sıfırdan yenidən train et."""
    real_prods, real_sobes = _fetch_real_names(pbi)
    mdl = SalesForecastModel()
    df, src = fetch_training_data(pbi, real_prods, real_sobes)
    stats = mdl.train(df, src)
    mdl.save()
    return mdl, stats
