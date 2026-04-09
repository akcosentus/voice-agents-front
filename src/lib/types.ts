export interface Call {
  id: string
  agent_name: string
  from_number?: string | null
  target_number: string
  agent_display_name?: string | null
  direction: "outbound" | "inbound" | "test"
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

export interface PostCallField {
  name: string
  type: "text" | "selector"
  description: string
  format_examples?: string[]
  choices?: string[]
}

export interface PostCallConfig {
  model: string
  fields: PostCallField[]
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
  agent_display_name?: string | null
  from_number: string
  status: "draft" | "validating" | "ready" | "running" | "completed" | "failed" | "scheduled" | "paused" | "canceled"
  total_rows: number
  completed_rows: number
  failed_rows: number
  column_mapping: Record<string, string>
  config: Record<string, unknown>
  rows: unknown[]
  input_file_path: string | null
  output_file_path: string | null
  timezone: string | null
  calling_window_start: string | null
  calling_window_end: string | null
  calling_window_days: string[] | null
  concurrency: number | null
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

/** Tool is now an object, not a string */
export interface AgentTool {
  type: string
  description: string
  settings: Record<string, unknown>
}

export interface Agent {
  id: string
  name: string
  display_name: string
  description: string
  llm_provider: string
  llm_model: string
  temperature: number
  max_tokens: number
  enable_prompt_caching: boolean
  tts_provider: string
  tts_voice_id: string
  tts_model: string
  tts_stability: number
  tts_similarity_boost: number
  tts_style: number
  tts_use_speaker_boost: boolean
  tts_speed: number
  stt_provider: string
  stt_language: string
  stt_keywords: string[]
  tools: AgentTool[]
  system_prompt: string
  first_message: string
  recording_enabled: boolean
  recording_channels: number
  post_call_analyses: PostCallConfig
  idle_timeout_secs: number
  idle_message: string
  max_call_duration_secs: number
  voicemail_action: string
  voicemail_message: string
  max_retries: number
  retry_delay_secs: number
  default_concurrency: number
  calling_window_start: string
  calling_window_end: string
  calling_window_days: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Row in Supabase agent_drafts — same shape as Agent + draft metadata */
export interface AgentDraft extends Agent {
  agent_id: string
  has_unpublished_changes: boolean
}

export interface AgentVersion {
  id: string
  agent_id: string
  version_number: number
  version_name: string
  description: string
  config_snapshot: Record<string, unknown>
  phone_assignments: { number: string; friendly_name: string; direction: string }[]
  published_at: string
  published_by: string | null
}

export interface PhoneNumber {
  id: string
  number: string
  friendly_name: string
  inbound_agent: { id: string; name: string; display_name: string } | null
  outbound_agent: { id: string; name: string; display_name: string } | null
  is_active: boolean
}

export interface AgentSchema {
  llm_models: string[]
  tts_providers: string[]
  tts_models: Record<string, string[]>
  stt_providers: string[]
  stt_languages: string[]
  tool_types: string[]
  tool_settings_schema: Record<string, unknown>
  voicemail_actions: string[]
  field_ranges: Record<string, { min: number; max: number; step: number; default: number }>
  defaults: Record<string, unknown>
}

export interface Voice {
  voice_id: string
  name: string
  custom_name: string | null
  description: string | null
  preview_url: string | null
  gender: string | null
  accent: string | null
  age: string | null
  category: string | null
  labels: Record<string, string> | null
  created_at: string
}

/** List item from GET /api/agents (id used for phone routing; may include model fields flat on the object) */
export interface AgentListItem {
  id?: string
  name: string
  display_name: string
  description: string
  llm_model?: string | null
  tts_model?: string | null
  tts_voice_id?: string | null
}
