"""
RAG Context Builder — SQL-dən real dəyərləri çəkib GPT üçün zəngin kontekst hazırlayır.
Nəticə GPT-nin system prompt-una əlavə edilir → daha dəqiq SQL yaranır.
"""

import time
import pandas as pd
from sql_client import SQLClient


class ContextBuilder:
    def __init__(self, sql_client: SQLClient, cache_ttl: int = 3600):
        self._sql = sql_client
        self._cache_ttl = cache_ttl
        self._cache: dict = {}

    def _q(self, server: str, database: str, sql: str) -> pd.DataFrame:
        try:
            return self._sql.execute_query(server, database, sql)
        except Exception:
            return pd.DataFrame()

    def _vals(self, df: pd.DataFrame, col_idx: int = 0) -> list:
        if df.empty:
            return []
        return df.iloc[:, col_idx].dropna().astype(str).tolist()

    def build(self, server: str, database: str, db_name: str = "ErtAgro") -> str:
        cache_key = f"{server}:{database}"
        cached = self._cache.get(cache_key)
        if cached and cached["expires_at"] > time.time():
            return cached["context"]

        ctx = self._fetch(server, database, db_name)
        self._cache[cache_key] = {
            "context": ctx,
            "expires_at": time.time() + self._cache_ttl,
        }
        return ctx

    def invalidate(self, server: str, database: str):
        self._cache.pop(f"{server}:{database}", None)

    def build_filter_values(self, server: str, database: str) -> str:
        """Yalnız filtr dəyərlərini qaytarır — Power BI DAX prompt-u üçün.
        SQL cədvəl adları daxil deyil, yalnız real Anbar/Şöbə/Kateqoriya siyahıları."""
        cache_key = f"fv:{server}:{database}"
        cached = self._cache.get(cache_key)
        if cached and cached["expires_at"] > time.time():
            return cached["context"]

        lines = ["=== FİLTR DƏYƏRLƏRİ (Power BI filtrlərini bu dəyərlərlə yaz) ===\n"]

        anbar_q = ("SELECT DISTINCT Anbar FROM dbo.Mal_satisi_hesabati_Cam "
                   "WHERE Anbar IS NOT NULL ORDER BY Anbar")
        df = self._q(server, database, anbar_q)
        anbarlar = self._vals(df)
        if anbarlar:
            lines.append(f"Anbar dəyərləri ({len(anbarlar)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in anbarlar) + "\n")

        sobe_q = ("SELECT DISTINCT [Şöbə] FROM dbo.Mal_satisi_hesabati_Cam "
                  "WHERE [Şöbə] IS NOT NULL ORDER BY [Şöbə]")
        df = self._q(server, database, sobe_q)
        sobeler = self._vals(df)
        if sobeler:
            lines.append(f"Şöbə dəyərləri ({len(sobeler)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in sobeler) + "\n")

        kateq_q = ("SELECT DISTINCT Kateqoriya FROM dbo.Mal_satisi_hesabati_Cam "
                   "WHERE Kateqoriya IS NOT NULL ORDER BY Kateqoriya")
        df = self._q(server, database, kateq_q)
        kateqs = self._vals(df)
        if kateqs:
            lines.append(f"Kateqoriya dəyərləri ({len(kateqs)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in kateqs) + "\n")

        temsilci_q = ("SELECT DISTINCT [Satış Təmsilçisi] FROM dbo.Mal_satisi_hesabati_Cam "
                      "WHERE [Satış Təmsilçisi] IS NOT NULL ORDER BY [Satış Təmsilçisi]")
        df = self._q(server, database, temsilci_q)
        temsilciler = self._vals(df)
        if temsilciler:
            lines.append(f"Satış Təmsilçisi dəyərləri ({len(temsilciler)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in temsilciler) + "\n")

        # Top 200 mal adı
        df = self._q(server, database,
            "SELECT TOP 200 [Malın adı] FROM ("
            "  SELECT [Malın adı], SUM([Satış Məbləği]) AS s"
            "  FROM dbo.Mal_satisi_hesabati_Cam GROUP BY [Malın adı]"
            ") t ORDER BY s DESC")
        mallar = self._vals(df)
        if mallar:
            lines.append(f"Mal adları TOP 200 (azalan satış sırası ilə):")
            lines.append("  VACIB: Bütün mal adları '* ' prefiksi ilə başlayır!")
            lines.append("  Filtr yazarkən tam adı istifadə et: [Malın adı] = N'* Banan ERT 11'")
            lines.append("  " + ", ".join(f'"{v}"' for v in mallar) + "\n")

        ctx = "\n".join(lines)
        self._cache[cache_key] = {"context": ctx, "expires_at": time.time() + self._cache_ttl}
        return ctx

    def _fetch(self, server: str, database: str, db_name: str) -> str:
        lines = [f"=== VERİTABANI: {db_name} SQL Database ===\n"]

        # ── Satış hesabatı cədvəli ────────────────────────────────────────────
        lines.append("CƏDVƏL 1: dbo.Mal_satisi_hesabati_Cam (Satış hesabatı)")
        lines.append("Sütunlar: mal(int), [Malın adı], [Malın kodu], [Qutu Miqdarı], Tipi, Xüsusiyyət,")
        lines.append("  [Ölçü vahidi], [Maya Qiyməti], [Maya Məbləği], tarix(datetime2), gun, ay, il,")
        lines.append("  Miqdar, [Alış Məbləği], [Satış Məbləği], Güzəşt, [Sənəd nömrəsi],")
        lines.append("  Müştəri, [Çəki miqdarı], Növbə, [Yığılan qiymət], Mənşə,")
        lines.append("  Anbar, Şöbə, Kateqoriya, [Satış Təmsilçisi], Büdcə,")
        lines.append("  [Cashback Məbləği], [Büdcə Əməkdaş], Gelir, [Satış Qiyməti], Faiz\n")

        # Sətir sayı və tarix aralığı
        df = self._q(server, database,
            "SELECT COUNT(*) AS sayi, MIN(tarix) AS bas, MAX(tarix) AS son "
            "FROM dbo.Mal_satisi_hesabati_Cam")
        if not df.empty:
            sayi = df.iloc[0, 0]
            bas  = str(df.iloc[0, 1])[:10]
            son  = str(df.iloc[0, 2])[:10]
            lines.append(f"Sətir sayı: {int(sayi):,}")
            lines.append(f"Tarix aralığı: {bas} → {son}\n")

        # Ümumi satış
        df = self._q(server, database,
            "SELECT SUM([Satış Məbləği]) AS umumi FROM dbo.Mal_satisi_hesabati_Cam")
        if not df.empty and not pd.isna(df.iloc[0, 0]):
            lines.append(f"Ümumi satış məbləği: {float(df.iloc[0, 0]):,.0f} ₼\n")

        # Anbar dəyərləri
        df = self._q(server, database,
            "SELECT DISTINCT Anbar FROM dbo.Mal_satisi_hesabati_Cam "
            "WHERE Anbar IS NOT NULL ORDER BY Anbar")
        anbarlar = self._vals(df)
        if anbarlar:
            lines.append(f"Anbar dəyərləri ({len(anbarlar)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in anbarlar) + "\n")

        # Şöbə dəyərləri
        df = self._q(server, database,
            "SELECT DISTINCT [Şöbə] FROM dbo.Mal_satisi_hesabati_Cam "
            "WHERE [Şöbə] IS NOT NULL ORDER BY [Şöbə]")
        sobeler = self._vals(df)
        if sobeler:
            lines.append(f"Şöbə dəyərləri ({len(sobeler)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in sobeler) + "\n")

        # Kateqoriya dəyərləri
        df = self._q(server, database,
            "SELECT DISTINCT Kateqoriya FROM dbo.Mal_satisi_hesabati_Cam "
            "WHERE Kateqoriya IS NOT NULL ORDER BY Kateqoriya")
        kateqs = self._vals(df)
        if kateqs:
            lines.append(f"Kateqoriya dəyərləri ({len(kateqs)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in kateqs) + "\n")

        # Satış təmsilçiləri
        df = self._q(server, database,
            "SELECT DISTINCT [Satış Təmsilçisi] FROM dbo.Mal_satisi_hesabati_Cam "
            "WHERE [Satış Təmsilçisi] IS NOT NULL ORDER BY [Satış Təmsilçisi]")
        temsilciler = self._vals(df)
        if temsilciler:
            lines.append(f"Satış Təmsilçisi dəyərləri ({len(temsilciler)} ədəd):")
            lines.append("  " + ", ".join(f'"{v}"' for v in temsilciler) + "\n")

        # Ən çox satan 10 məhsul
        df = self._q(server, database,
            "SELECT TOP 10 [Malın adı], SUM([Satış Məbləği]) AS satis "
            "FROM dbo.Mal_satisi_hesabati_Cam GROUP BY [Malın adı] ORDER BY satis DESC")
        if not df.empty:
            lines.append("Ən çox satan 10 məhsul:")
            for _, row in df.iterrows():
                lines.append(f"  - {row.iloc[0]}: {float(row.iloc[1]):,.0f} ₼")
            lines.append("")

        # ── Mal qalıqları cədvəli ─────────────────────────────────────────────
        lines.append("CƏDVƏL 2: dbo.Mal_qaliqlan_FIFO (Mal qalıqları / anbar stoku)")
        lines.append("Sütunlar: mal(int), Barkod, Kod, Adı, [Ölçü vahidi], Miqdar, [Qutu Miqdarı],")
        lines.append("  [Çəki Miqdarı], Məbləğ, [Satış qiyməti _Market_], [Satış qiyməti _Naves_],")
        lines.append("  [Satış qiyməti _Baki_], [Satış qiyməti _Gəncə Basar_], [Satış qiyməti _Şəmkir_],")
        lines.append("  [Satış Məbləği], [Günlük Satış Miqdarı], [Planlanılan gün sayı],")
        lines.append("  Anbar, Tip, Xüsusiyyət, Kateqoriya, Vəziyyəti, Qiymət\n")

        df = self._q(server, database,
            "SELECT COUNT(*) AS sayi, SUM(Miqdar) AS umumi_miqdar "
            "FROM dbo.Mal_qaliqlan_FIFO")
        if not df.empty:
            lines.append(f"Sətir sayı: {int(df.iloc[0, 0]):,}")
            miqdar = df.iloc[0, 1]
            if not pd.isna(miqdar):
                lines.append(f"Ümumi stok miqdarı: {float(miqdar):,.0f}")
            lines.append("")

        # Ən çox satılan 200 malın adı
        df = self._q(server, database,
            "SELECT TOP 200 [Malın adı] FROM ("
            "  SELECT [Malın adı], SUM([Satış Məbləği]) AS s"
            "  FROM dbo.Mal_satisi_hesabati_Cam GROUP BY [Malın adı]"
            ") t ORDER BY s DESC")
        mallar = self._vals(df)
        if mallar:
            lines.append(f"Ən çox satılan malların adları TOP 200 (azalan sıra ilə):")
            lines.append("  VACIB: Bütün mal adları '* ' prefiksi ilə başlayır!")
            lines.append("  Filtr yazarkən MÜTLƏQDİR tam adı istifadə et: [Malın adı] = N'* Banan ERT 11'")
            lines.append("  " + ", ".join(f'"{v}"' for v in mallar) + "\n")

        # ── Stok/gün cədvəli ─────────────────────────────────────────────────
        lines.append("CƏDVƏL 3: dbo.Stok_Gun (Stok dövriyyəsi - gün hesabı)")
        lines.append("Sütunlar: Barkod, Kod, Adı, [Anbar qalığı], [Günlük Satış Miqdarı],")
        lines.append("  [Satış Qutu Miqdarı], [Planlanılan Gün Sayı], [Minimum Gün], Anbar, [Qutu Miqdarı]\n")

        df = self._q(server, database, "SELECT COUNT(*) AS sayi FROM dbo.Stok_Gun")
        if not df.empty:
            lines.append(f"Sətir sayı: {int(df.iloc[0, 0]):,}\n")

        # ── SQL qaydaları ─────────────────────────────────────────────────────
        lines.append("=== SQL YAZMA QAYDALARI ===")
        lines.append("- Boşluq/xüsusi hərf olan BÜTÜN sütun adları köşəli mötərizədə: [Malın adı], [Satış Məbləği]")
        lines.append("- Aggregate funksiyasında da: SUM([Satış Məbləği]), AVG([Maya Qiyməti])")
        lines.append("- Azərbaycan mətni üçün N'' prefiksi: WHERE Anbar = N'Semkir Anbar'")
        lines.append("- Tarix sütunu adı: tarix (datetime2)")
        lines.append("- Bu il: YEAR(tarix) = YEAR(GETDATE())")
        lines.append("- Bu ay: YEAR(tarix) = YEAR(GETDATE()) AND MONTH(tarix) = MONTH(GETDATE())")

        return "\n".join(lines)
