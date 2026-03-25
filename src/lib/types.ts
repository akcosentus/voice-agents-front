export interface Call {
  id: string
  agent_name: string
  target_number: string
  direction: "outbound" | "inbound"
  status: "pending" | "in_progress" | "completed" | "failed" | "no_answer"
  started_at: string | null
  ended_at: string | null
  duration_secs: number | null
  case_data: Record<string, string>
  transcript: TranscriptTurn[]
  recording_path: string | null
  post_call_analyses: Record<string, unknown>
  error: string | null
  batch_id: string | null
  batch_row_index: number | null
  created_at: string
  updated_at: string
}

export interface TranscriptTurn {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

export interface Batch {
  id: string
  name: string
  agent_name: string
  from_number: string
  status: "draft" | "validating" | "ready" | "running" | "completed" | "failed"
  total_rows: number
  completed_rows: number
  failed_rows: number
  column_mapping: Record<string, string>
  config: Record<string, unknown>
  rows: unknown[]
  input_file_path: string | null
  output_file_path: string | null
  created_at: string
  updated_at: string
}

export interface UploadResponse {
  batch_id: string
  columns: string[]
  summary: {
    total: number
    valid: number
    fixable: number
    invalid: number
  }
  rows: UploadedRow[]
}

export interface UploadedRow {
  index: number
  phone_raw: string
  phone_normalized: string
  status: "valid" | "fixable" | "invalid"
  error: string | null
  data: Record<string, string>
}

export interface BatchStatusResponse {
  batch_id: string
  status: string
  total: number
  completed: number
  failed: number
}
