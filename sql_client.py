"""SQL Server client — Microsoft Fabric SQL Database üçün (pyodbc + Azure AD token)"""

import struct
import time
import pandas as pd


class SQLClient:
    def __init__(self, tenant_id: str, client_id: str, client_secret: str):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._token_cache: dict = {}

    def _get_token(self) -> str:
        cached = self._token_cache
        if cached.get("expires_at", 0) > time.time() + 60:
            return cached["token"]
        import msal
        authority = f"https://login.microsoftonline.com/{self.tenant_id}"
        app = msal.ConfidentialClientApplication(
            self.client_id, authority=authority, client_credential=self.client_secret,
        )
        result = app.acquire_token_for_client(
            scopes=["https://database.windows.net/.default"]
        )
        if "access_token" not in result:
            raise RuntimeError(f"SQL token alına bilmədi: {result.get('error_description', result)}")
        self._token_cache = {
            "token": result["access_token"],
            "expires_at": time.time() + result.get("expires_in", 3600),
        }
        return result["access_token"]

    def _connect(self, server: str, database: str):
        import pyodbc
        token = self._get_token()
        token_bytes = token.encode("UTF-16-LE")
        token_struct = struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)
        SQL_COPT_SS_ACCESS_TOKEN = 1256

        # ODBC Driver 18 yoxdursa 17 cəhd et
        for driver in ["ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"]:
            conn_str = (
                f"Driver={{{driver}}};"
                f"Server={server};"
                f"Database={database};"
                f"Encrypt=yes;"
                f"TrustServerCertificate=no;"
            )
            try:
                return pyodbc.connect(conn_str, attrs_before={SQL_COPT_SS_ACCESS_TOKEN: token_struct})
            except Exception:
                continue
        raise RuntimeError("ODBC Driver tapılmadı (18 və ya 17 versiyası lazımdır)")

    def execute_query(self, server: str, database: str, sql: str) -> pd.DataFrame:
        conn = self._connect(server, database)
        try:
            cursor = conn.cursor()
            cursor.execute(sql)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            return pd.DataFrame.from_records(rows, columns=columns)
        finally:
            conn.close()

    def get_schema(self, server: str, database: str) -> str:
        sql = """
        SELECT t.TABLE_SCHEMA, t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE,
               c.CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.TABLES t
        JOIN INFORMATION_SCHEMA.COLUMNS c
            ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
        WHERE t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
        """
        try:
            df = self.execute_query(server, database, sql)
            if df.empty:
                return "(Cədvəl tapılmadı)"
            lines = []
            current_table = None
            for _, row in df.iterrows():
                tname = f"{row['TABLE_SCHEMA']}.{row['TABLE_NAME']}"
                if tname != current_table:
                    current_table = tname
                    lines.append(f"\n{tname} (cədvəl):")
                dtype = row["DATA_TYPE"]
                max_len = row.get("CHARACTER_MAXIMUM_LENGTH")
                try:
                    if max_len is not None and str(max_len) not in ("nan", "None", "-1"):
                        dtype += f"({int(float(max_len))})"
                except (ValueError, TypeError):
                    pass
                lines.append(f"  - {row['COLUMN_NAME']} ({dtype})")
            return "\n".join(lines)
        except Exception as e:
            return f"(Schema xətası: {e})"

    def test_connection(self, server: str, database: str) -> tuple:
        try:
            self.execute_query(server, database, "SELECT 1 AS test")
            return True, "Bağlantı uğurludur"
        except Exception as e:
            return False, str(e)
