"""Power BI REST API client — dinamik dataset switching ilə"""

import time
import requests
import pandas as pd


class PowerBIClient:
    def __init__(self, tenant_id, client_id, client_secret):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.workspace_id = None
        self.dataset_id = None
        self._token = None
        self._token_expires_at = 0

    def set_dataset(self, workspace_id: str, dataset_id: str):
        """Aktiv dataset-i dəyişdir"""
        self.workspace_id = workspace_id
        self.dataset_id = dataset_id

    def _get_token(self):
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        r = requests.post(
            f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "scope": "https://analysis.windows.net/powerbi/api/.default",
            },
            timeout=30,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Token alınmadı: {r.status_code} — {r.text}")
        j = r.json()
        self._token = j["access_token"]
        self._token_expires_at = time.time() + int(j.get("expires_in", 3600))
        return self._token

    def test_connection(self):
        try:
            token = self._get_token()
            r = requests.get(
                f"https://api.powerbi.com/v1.0/myorg/groups/{self.workspace_id}/datasets/{self.dataset_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            if r.status_code == 200:
                return True, f"✅ Bağlantı uğurlu — **{r.json().get('name', '?')}**"
            return False, f"❌ HTTP {r.status_code}: {r.text[:300]}"
        except Exception as e:
            return False, f"❌ {e}"

    def execute_query(self, dax: str) -> pd.DataFrame:
        if not self.workspace_id or not self.dataset_id:
            raise RuntimeError("Dataset seçilməyib — set_dataset() çağır")

        token = self._get_token()
        r = requests.post(
            f"https://api.powerbi.com/v1.0/myorg/groups/{self.workspace_id}/datasets/{self.dataset_id}/executeQueries",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "queries": [{"query": dax}],
                "serializerSettings": {"includeNulls": True},
            },
            timeout=120,
        )
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:500]}")

        j = r.json()

        # API-nin body-də xəta qaytarması
        if "error" in j:
            raise RuntimeError(f"Power BI API xətası: {j['error']}")

        try:
            result = j["results"][0]
            if "error" in result:
                raise RuntimeError(f"Query xətası: {result['error']}")
            rows = result["tables"][0]["rows"]
        except RuntimeError:
            raise
        except (KeyError, IndexError):
            return pd.DataFrame()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows)
        df.columns = [c.split("[")[-1].rstrip("]") for c in df.columns]
        return df

    # ---------------- Schema fetching (4 fallback strategies) ----------------
    def _try_execute(self, dax: str):
        try:
            return self.execute_query(dax)
        except Exception:
            return None

    def fetch_schema(self) -> str:
        schema = self._try_info_view()
        if schema:
            return schema + self._fetch_filter_values()
        schema = self._try_info_functions()
        if schema:
            return schema + self._fetch_filter_values()
        schema = self._try_tmschema_dmv()
        if schema:
            return schema + self._fetch_filter_values()
        return self._try_basic_tables()

    def _fetch_filter_values(self) -> str:
        """
        INFO.VIEW.COLUMNS() ilə Text sütunların faktiki dəyərlərini çəkir.
        LLM bu dəyərləri görərək DAX-da eyni formatı istifadə edir.
        """
        skip_patterns = [
            'parameter', 'frequency', 'monetary', 'recency',
            'number filter', 'borc score', 'theme',
            'x axis', 'y axis', 'z axis', 'home page',
            '_measures', 'alert',
        ]

        try:
            cols_df = self._try_execute("EVALUATE INFO.VIEW.COLUMNS()")
            if cols_df is None or cols_df.empty:
                return ""

            # Yalnız Text tipli, gizli olmayan sütunlar
            text_cols = cols_df[
                (cols_df["DataType"] == "Text") &
                (cols_df["IsHidden"] == False) &
                (cols_df["DataCategory"] == "Regular")
            ][["Table", "Name"]].drop_duplicates()

        except Exception:
            return ""

        lines = ["\n\n=== FİLTR DƏYƏRLƏRİ (DAX-da bu dəyərləri AYNEN istifadə et) ==="]

        for _, row in text_cols.iterrows():
            tbl = str(row["Table"])
            col = str(row["Name"])

            if self._is_internal_table(tbl) or self._is_internal_column(col):
                continue
            tl = tbl.lower()
            if any(p in tl for p in skip_patterns):
                continue

            try:
                df = self._try_execute(
                    f"EVALUATE TOPN(80, DISTINCT('{tbl}'[{col}]), '{tbl}'[{col}], ASC)"
                )
                if df is None or df.empty:
                    continue
                values = df.iloc[:, 0].dropna().astype(str).tolist()
                if 1 < len(values) <= 60:
                    lines.append(f"'{tbl}'[{col}]: {' | '.join(values)}")
            except Exception:
                continue

        return "\n".join(lines) if len(lines) > 1 else ""

    def _try_info_view(self):
        try:
            tables_df = self.execute_query("EVALUATE INFO.VIEW.TABLES()")
            if tables_df.empty:
                return None
        except Exception:
            return None

        table_col = next((c for c in tables_df.columns if c.lower() == "name"), None)
        if not table_col:
            return None
        table_names = tables_df[table_col].tolist()
        columns_df = self._try_execute("EVALUATE INFO.VIEW.COLUMNS()")
        measures_df = self._try_execute("EVALUATE INFO.VIEW.MEASURES()")
        return self._format_schema_from_view(table_names, columns_df, measures_df)

    def _try_info_functions(self):
        try:
            tables_df = self.execute_query(
                'EVALUATE SELECTCOLUMNS(INFO.TABLES(), "ID", [ID], "Name", [Name])'
            )
            if tables_df.empty:
                return None
        except Exception:
            return None

        table_map = dict(zip(tables_df["ID"], tables_df["Name"]))
        columns_df = self._try_execute(
            'EVALUATE SELECTCOLUMNS(INFO.COLUMNS(), "TableID", [TableID], "Name", [ExplicitName])'
        )
        measures_df = self._try_execute(
            'EVALUATE SELECTCOLUMNS(INFO.MEASURES(), "TableID", [TableID], "Name", [Name])'
        )
        return self._format_schema_with_map(table_map, columns_df, measures_df)

    def _try_tmschema_dmv(self):
        try:
            tables_df = self.execute_query(
                'SELECT [ID], [Name] FROM $SYSTEM.TMSCHEMA_TABLES WHERE [IsHidden] = FALSE'
            )
            if tables_df.empty:
                return None
        except Exception:
            return None

        id_col = next((c for c in tables_df.columns if c.upper() == "ID"), None)
        name_col = next((c for c in tables_df.columns if c.upper() == "NAME"), None)
        if not id_col or not name_col:
            return None

        table_map = dict(zip(tables_df[id_col], tables_df[name_col]))
        columns_df = self._try_execute(
            'SELECT [TableID], [ExplicitName] FROM $SYSTEM.TMSCHEMA_COLUMNS WHERE [IsHidden] = FALSE AND [Type] <> 2'
        )
        measures_df = self._try_execute(
            'SELECT [TableID], [Name] FROM $SYSTEM.TMSCHEMA_MEASURES WHERE [IsHidden] = FALSE'
        )
        return self._format_schema_with_map(table_map, columns_df, measures_df)

    def _try_basic_tables(self):
        try:
            token = self._get_token()
            r = requests.get(
                f"https://api.powerbi.com/v1.0/myorg/groups/{self.workspace_id}/datasets/{self.dataset_id}/tables",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            if r.status_code != 200:
                return "(schema çəkilə bilmədi)"

            tables = r.json().get("value", [])
            lines = []
            for t in tables:
                lines.append(f"{t['name']} (cədvəl):")
                for c in t.get("columns", []):
                    lines.append(f"  - {c['name']} ({c.get('dataType', '?')})")
                lines.append("")
            return "\n".join(lines) if lines else "(schema boş)"
        except Exception:
            return "(schema çəkilə bilmədi)"

    @staticmethod
    def _is_internal_table(name: str) -> bool:
        n = name.lower()
        return (
            n.startswith("datetabletemplate_")
            or n.startswith("localdatetable_")
            or n.startswith("$")
        )

    @staticmethod
    def _is_internal_column(name: str) -> bool:
        return name.startswith("RowNumber-")

    def _format_schema_from_view(self, table_names, columns_df, measures_df):
        _NUMERIC = {"int64", "double", "decimal", "currency", "integer", "int32", "int16"}

        lines = []
        dax_numeric: list = []   # SUM() üçün
        dax_text: list = []       # FILTER/GROUPBY üçün

        col_table_key = col_name_key = col_type_key = col_hidden_key = None
        if columns_df is not None and not columns_df.empty:
            for c in columns_df.columns:
                lc = c.lower()
                if lc == "table":              col_table_key = c
                elif lc == "name":             col_name_key = c
                elif lc in ("datatype", "data type"): col_type_key = c
                elif lc == "ishidden":         col_hidden_key = c

        for tname in sorted(table_names):
            if self._is_internal_table(tname):
                continue
            col_lines = []
            if columns_df is not None and col_table_key and col_name_key:
                tbl_cols = columns_df[columns_df[col_table_key] == tname]
                for _, c in tbl_cols.iterrows():
                    cname = str(c[col_name_key])
                    if self._is_internal_column(cname):
                        continue
                    if col_hidden_key and c.get(col_hidden_key) is True:
                        continue
                    dtype = str(c[col_type_key]) if col_type_key else "?"
                    col_lines.append(f"  - {cname} ({dtype})")
                    # DAX reference — boşluqlu cədvəl adı tək dırnaqla
                    ref = f"'{tname}'[{cname}]" if " " in tname or "(" in tname else f"{tname}[{cname}]"
                    if dtype.lower() in _NUMERIC:
                        dax_numeric.append(ref)
                    elif dtype.lower() == "text":
                        dax_text.append(ref)
            if col_lines:
                lines.append(f"{tname} (cədvəl):")
                lines.extend(col_lines)
                lines.append("")

        has_measures = measures_df is not None and not measures_df.empty
        if has_measures:
            lines.append("Measures:")
            m_table_key = next((c for c in measures_df.columns if c.lower() == "table"), None)
            m_name_key = next((c for c in measures_df.columns if c.lower() == "name"), None)
            if m_name_key:
                for _, m in measures_df.iterrows():
                    mt = m[m_table_key] if m_table_key else "?"
                    lines.append(f"  - [{m[m_name_key]}]  (table: {mt})")

        # DAX Quick Reference bölməsini ön hissəyə əlavə et
        hint_lines: list = []
        if dax_numeric:
            hint_lines.append("=== RƏQƏM SÜTUNLARI — SUM/AVG/MAX/MIN istifadə et (heç vaxt [MeasureAdı] yox) ===")
            for ref in dax_numeric[:30]:
                hint_lines.append(f"  SUM({ref})")
            hint_lines.append("")
        if dax_text:
            hint_lines.append("=== MƏTN SÜTUNLARI — FILTER / SUMMARIZECOLUMNS üçün ===")
            for ref in dax_text[:30]:
                hint_lines.append(f"  {ref}")
            hint_lines.append("")
        if not has_measures:
            hint_lines.insert(0, "⚠️  Bu datasetdə adlandırılmış MEASURE YOXDUR — yalnız sütun aggregasiyaları istifadə et.\n")

        if hint_lines:
            return (
                "\n".join(hint_lines)
                + "\n=== ƏTRAFLİ SCHEMA ===\n\n"
                + "\n".join(lines)
            )
        return "\n".join(lines)

    def _format_schema_with_map(self, table_map, columns_df, measures_df):
        lines = []
        col_tid_key = col_name_key = None
        if columns_df is not None and not columns_df.empty:
            for c in columns_df.columns:
                lc = c.lower()
                if "tableid" in lc: col_tid_key = c
                elif lc in ("explicitname", "name"): col_name_key = c

        for tid, tname in sorted(table_map.items(), key=lambda x: str(x[1])):
            if self._is_internal_table(str(tname)):
                continue
            col_lines = []
            if columns_df is not None and col_tid_key and col_name_key:
                tbl_cols = columns_df[columns_df[col_tid_key] == tid]
                for _, c in tbl_cols.iterrows():
                    if c[col_name_key] and not self._is_internal_column(str(c[col_name_key])):
                        col_lines.append(f"  - {c[col_name_key]}")
            if col_lines:
                lines.append(f"{tname} (cədvəl):")
                lines.extend(col_lines)
                lines.append("")

        if measures_df is not None and not measures_df.empty:
            lines.append("Measures:")
            m_tid_key = next((c for c in measures_df.columns if "tableid" in c.lower()), None)
            m_name_key = next((c for c in measures_df.columns if c.lower() == "name"), None)
            if m_name_key:
                for _, m in measures_df.iterrows():
                    tname = table_map.get(m[m_tid_key], "?") if m_tid_key else "?"
                    lines.append(f"  - [{m[m_name_key]}]  (table: {tname})")
        return "\n".join(lines)
