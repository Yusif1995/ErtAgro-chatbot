// API calls — relative path, same domain as FastAPI server
const BASE = '/api'

export const api = {
  getKpis: () =>
    fetch(`${BASE}/kpis`).then((r) => r.json()),

  getSuggestedQuestions: () =>
    fetch(`${BASE}/suggested-questions`).then((r) => r.json()),

  getRefreshStatus: () =>
    fetch(`${BASE}/refresh-status`).then((r) => r.json()),

  triggerRefresh: () =>
    fetch(`${BASE}/refresh`, { method: 'POST' }).then((r) => r.json()),

  getDatasets: () =>
    fetch(`${BASE}/datasets`).then((r) => r.json()),

  getSchema: () =>
    fetch(`${BASE}/schema`).then((r) => r.json()),

  getFilterValues: () =>
    fetch(`${BASE}/filter-values`).then((r) => r.json()),

  getInsights: () =>
    fetch(`${BASE}/insights`).then((r) => r.json()),

  getKpiAlerts: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams()
    if (dateFrom) params.append('date_from', dateFrom)
    if (dateTo) params.append('date_to', dateTo)
    return fetch(`${BASE}/kpi-alerts?${params}`).then((r) => r.json())
  },

  chat: async (body: object) => {
    const r = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || `Server xətası: ${r.status}`)
    return data
  },

  forecast: (body: object) =>
    fetch(`${BASE}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),

  getSqlDatabases: () =>
    fetch(`${BASE}/sql/databases`).then((r) => r.json()),

  testSqlConnection: (server: string, database: string) =>
    fetch(`${BASE}/sql/test?server=${encodeURIComponent(server)}&database=${encodeURIComponent(database)}`).then((r) => r.json()),
}
