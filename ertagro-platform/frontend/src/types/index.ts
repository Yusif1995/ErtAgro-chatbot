export interface KPI {
  id: string
  label: string
  value: number
  unit: string
  change: number
  trend: 'up' | 'down'
  icon: string
  sub: string
}

export interface KpiAlert {
  id: string
  label: string
  value: number
  unit: string
  change: number
  trend: 'up' | 'down'
  threshold: number
  alert: boolean
}

export interface ChartDataPoint {
  region: string
  value: number
}

export interface Chart {
  type: 'bar' | 'line' | 'pie'
  data: Record<string, string | number>[]
  xKey?: string
  yKey?: string
  title?: string
}

export interface Metric {
  label: string
  value: string
  change: string | null
}

export interface ChatResponse {
  answer: string
  chart: Chart
  metrics: Metric[]
  rows?: Record<string, string | number>[]
  dax?: string
  source: string
  model: string
  confidence: number
  timestamp: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  chatResponse?: ChatResponse
}

export interface ForecastRequest {
  product: string
  region: string
  price: number
  volume: number
  season: string
  currency: string
}

export interface ForecastResponse {
  expected_sales: number
  expected_volume: number
  change_vs_prev: number
  confidence: number
  trend_data: number[]
  explanation: string
}

export interface Filter {
  dateFrom?: string
  dateTo?: string
  sobe?: string
  anbar?: string
  category?: string
}

export interface SuggestedQuestion {
  id: number
  text: string
}

export interface RefreshStatus {
  status: string
  message?: string
  last_refresh: string
  next_refresh?: string
  dataset?: string
  rows_updated?: number
}

export interface SchemaColumn {
  name: string
  type: string
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
  measures: string[]
}

export interface Insight {
  type: 'trend' | 'warning' | 'info'
  text: string
}

export interface QuerySession {
  id: string
  text: string
  timestamp: string
  messages: Message[]
}
