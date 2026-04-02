import type { Agent, AgentSchema, AgentTool } from "./types"

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

function toolsArr(v: unknown): AgentTool[] {
  if (!Array.isArray(v)) return []
  return v.map((t) => {
    if (typeof t === "string") return { type: t, description: "", settings: {} }
    const o = t as Record<string, unknown>
    return {
      type: str(o.type, "end_call"),
      description: str(o.description, ""),
      settings: (o.settings && typeof o.settings === "object" ? o.settings : {}) as Record<string, unknown>,
    }
  })
}

function postAnalyses(v: unknown): Agent["post_call_analyses"] {
  if (!Array.isArray(v)) return []
  return v.map((x) => {
    const o = x as Record<string, unknown>
    return {
      name: str(o.name, "analysis"),
      model: str(o.model, ""),
      output_type: str(o.output_type, "text"),
      prompt: typeof o.prompt === "string" ? o.prompt : undefined,
    }
  })
}

/** Build initial Agent-shaped values from schema.defaults + field_ranges fallbacks */
export function agentDefaultsFromSchema(schema: AgentSchema): Omit<Agent, "id" | "name" | "created_at" | "updated_at"> {
  const d = schema.defaults ?? {}
  const fr = schema.field_ranges ?? {}

  const temp = fr.temperature?.default ?? num(d.temperature, 0.7)
  const maxTok = fr.max_tokens?.default ?? num(d.max_tokens, 1024)

  return {
    display_name: str(d.display_name, ""),
    description: str(d.description, ""),
    llm_provider: str(d.llm_provider, "openai"),
    llm_model: str(d.llm_model, schema.llm_models[0] ?? ""),
    temperature: temp,
    max_tokens: maxTok,
    enable_prompt_caching: bool(d.enable_prompt_caching, false),
    tts_provider: str(d.tts_provider, schema.tts_providers[0] ?? "elevenlabs"),
    tts_voice_id: str(d.tts_voice_id, ""),
    tts_model: str(d.tts_model, ""),
    tts_stability: num(d.tts_stability, fr.tts_stability?.default ?? 0.5),
    tts_similarity_boost: num(d.tts_similarity_boost, fr.tts_similarity_boost?.default ?? 0.75),
    tts_style: num(d.tts_style, fr.tts_style?.default ?? 0),
    tts_use_speaker_boost: bool(d.tts_use_speaker_boost, true),
    tts_speed: num(d.tts_speed, fr.tts_speed?.default ?? 1),
    stt_provider: str(d.stt_provider, schema.stt_providers[0] ?? "deepgram"),
    stt_language: str(d.stt_language, schema.stt_languages[0] ?? "en"),
    stt_keywords: strArr(d.stt_keywords),
    tools: toolsArr(d.tools),
    system_prompt: str(d.system_prompt, ""),
    first_message: str(d.first_message, ""),
    recording_enabled: bool(d.recording_enabled, true),
    recording_channels: num(d.recording_channels, 2),
    post_call_analyses: postAnalyses(d.post_call_analyses),
    idle_timeout_secs: num(d.idle_timeout_secs, fr.idle_timeout_secs?.default ?? 30),
    idle_message: str(d.idle_message, ""),
    max_call_duration_secs: num(d.max_call_duration_secs, fr.max_call_duration_secs?.default ?? 1800),
    voicemail_action: str(d.voicemail_action, schema.voicemail_actions[0] ?? "hang_up"),
    voicemail_message: str(d.voicemail_message, ""),
    max_retries: num(d.max_retries, fr.max_retries?.default ?? 3),
    retry_delay_secs: num(d.retry_delay_secs, fr.retry_delay_secs?.default ?? 300),
    default_concurrency: num(d.default_concurrency, fr.default_concurrency?.default ?? 1),
    calling_window_start: str(d.calling_window_start, "09:00"),
    calling_window_end: str(d.calling_window_end, "17:00"),
    calling_window_days: strArr(d.calling_window_days).length
      ? strArr(d.calling_window_days)
      : ["mon", "tue", "wed", "thu", "fri"],
    is_active: bool(d.is_active, true),
  }
}

/** Auto-generate agent name from display name (e.g. "Chris — Claim Status" → "chris/claim_status") */
export function suggestAgentName(displayName: string): string {
  const t = displayName.trim()
  if (!t) return ""
  const parts = t.split(/\s*[–—]\s*|\s+-\s+/)
  if (parts.length >= 2) {
    const a = parts[0]
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
    const b = parts
      .slice(1)
      .join(" ")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
    return `${a}/${b}`
  }
  return t
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/]/g, "")
}
