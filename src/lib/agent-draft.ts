import type { AgentDraft, AgentSchema, AgentTool, PostCallConfig, PostCallField } from "./types"

/** Fields not sent to PUT /api/agents/{name} */
const OMIT_FROM_API = new Set(["has_unpublished_changes", "agent_id"])

/**
 * Build JSON body for publishing draft to live API (partial merge supported by backend;
 * we send full snapshot from draft).
 */
export function draftToApiPayload(draft: AgentDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(draft)) {
    if (OMIT_FROM_API.has(k)) continue
    out[k] = v
  }
  return out
}

/** Extract {{var}} patterns from system prompt */
export function extractPromptVariables(text: string): string[] {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim()
    if (name) seen.add(name)
  }
  return [...seen]
}

function isObj(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x)
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean)
}

/** Numeric default: field_ranges[key].default, then defaults[key] */
export function schemaNumericFallback(schema: AgentSchema, key: string): number {
  const r = schema.field_ranges[key]
  if (r && typeof r.default === "number" && Number.isFinite(r.default)) return r.default
  const d = schema.defaults[key]
  if (typeof d === "number" && Number.isFinite(d)) return d
  throw new Error(
    `agent-schema: missing numeric default for "${key}" (field_ranges.${key}.default or defaults.${key})`
  )
}

export function schemaBoolFallback(schema: AgentSchema, key: string): boolean {
  const d = schema.defaults[key]
  if (typeof d === "boolean") return d
  throw new Error(`agent-schema: missing boolean default for "${key}" (defaults.${key})`)
}

export function schemaStringFallback(schema: AgentSchema, key: string): string {
  const d = schema.defaults[key]
  if (typeof d === "string") return d
  return ""
}

function schemaStringArrayFallback(schema: AgentSchema, key: string): string[] {
  const d = schema.defaults[key]
  if (Array.isArray(d)) return d.map((x) => String(x)).filter(Boolean)
  return []
}

function defaultPostCallModel(schema: AgentSchema): string {
  const d = schema.defaults.llm_model
  if (typeof d === "string" && d.trim()) return d
  const first = schema.llm_models[0]
  if (typeof first === "string" && first) return first
  throw new Error("agent-schema: set defaults.llm_model or llm_models for post-call model default")
}

function defaultToolType(schema: AgentSchema): string {
  const t = schema.tool_types[0]
  if (typeof t === "string" && t) return t
  throw new Error("agent-schema: tool_types must be non-empty")
}

function normalizeTools(v: unknown, schema: AgentSchema): AgentTool[] {
  const fallbackType = defaultToolType(schema)
  if (!Array.isArray(v)) return []
  return v.map((t) => {
    if (typeof t === "string") return { type: t, description: "", settings: {} }
    if (isObj(t)) {
      const settings = isObj(t.settings) ? (t.settings as Record<string, unknown>) : {}
      return {
        type: str(t.type, fallbackType),
        description: str(t.description, ""),
        settings,
      }
    }
    return { type: fallbackType, description: "", settings: {} }
  })
}

function normalizePostCallAnalyses(v: unknown, schema: AgentSchema): PostCallConfig {
  const defaultModel = defaultPostCallModel(schema)

  if (isObj(v) && Array.isArray(v.fields)) {
    const fields: PostCallField[] = v.fields.map((raw) => {
      const o = isObj(raw) ? raw : {}
      const type = str(o.type, "text")
      return {
        name: str(o.name, "field"),
        type: type === "selector" ? "selector" : "text",
        description: str(o.description, ""),
        format_examples: Array.isArray(o.format_examples)
          ? o.format_examples.map((x) => String(x)).filter(Boolean)
          : undefined,
        choices: Array.isArray(o.choices)
          ? o.choices.map((x) => String(x)).filter(Boolean)
          : undefined,
      }
    })

    const model = str(v.model, defaultModel) || defaultModel
    return { model, fields }
  }

  if (Array.isArray(v)) {
    const model = (() => {
      const first = v[0]
      if (isObj(first)) return str(first.model, defaultModel) || defaultModel
      return defaultModel
    })()

    const fields: PostCallField[] = v
      .map((raw) => {
        const o = isObj(raw) ? raw : null
        if (!o) return null
        const output = str(o.output_type, "text")
        return {
          name: str(o.name, "field"),
          type: output === "selector" ? "selector" : "text",
          description: typeof o.prompt === "string" ? o.prompt : "",
        } satisfies PostCallField
      })
      .filter(Boolean) as PostCallField[]

    return { model, fields }
  }

  return { model: defaultModel, fields: [] }
}

/**
 * Map GET /api/agents/{name} (or POST clone/create) response to **only** columns that exist
 * on `agent_drafts`. Handles both flat responses and legacy nested `{ llm, tts, stt, recording }`.
 * Defaults and ranges must come from `GET /api/agent-schema` — pass `schema` from that response.
 */
export function apiResponseToDraftRow(
  raw: unknown,
  opts: { agent_id: string; has_unpublished_changes: boolean },
  schema: AgentSchema
): Record<string, unknown> {
  const o = isObj(raw) ? raw : {}

  const llm = isObj(o.llm) ? o.llm : null
  const tts = isObj(o.tts) ? o.tts : null
  const ttsSettings = tts && isObj(tts.settings) ? tts.settings : null
  const stt = isObj(o.stt) ? o.stt : null
  const rec = isObj(o.recording) ? o.recording : null

  const flatLlm = !llm
  const flatTts = !tts
  const flatStt = !stt
  const flatRec = !rec

  const llm_provider = flatLlm ? str(o.llm_provider, schemaStringFallback(schema, "llm_provider")) : str(llm.provider, "")
  const llm_model = flatLlm ? str(o.llm_model, "") : str(llm.model, "")

  const tts_provider = flatTts
    ? str(o.tts_provider, schemaStringFallback(schema, "tts_provider"))
    : str(tts.provider, schemaStringFallback(schema, "tts_provider"))
  const tts_voice_id = flatTts ? str(o.tts_voice_id, "") : str(tts.voice_id, "")
  const tts_model = flatTts ? str(o.tts_model, "") : str(tts.model, "")

  const tts_stability = flatTts
    ? num(o.tts_stability, schemaNumericFallback(schema, "tts_stability"))
    : num(ttsSettings?.stability, schemaNumericFallback(schema, "tts_stability"))

  const tts_similarity_boost = flatTts
    ? num(o.tts_similarity_boost, schemaNumericFallback(schema, "tts_similarity_boost"))
    : num(ttsSettings?.similarity_boost, schemaNumericFallback(schema, "tts_similarity_boost"))

  const tts_style = flatTts
    ? num(o.tts_style, schemaNumericFallback(schema, "tts_style"))
    : num(ttsSettings?.style, schemaNumericFallback(schema, "tts_style"))

  const tts_use_speaker_boost = flatTts
    ? bool(o.tts_use_speaker_boost, schemaBoolFallback(schema, "tts_use_speaker_boost"))
    : bool(ttsSettings?.use_speaker_boost, schemaBoolFallback(schema, "tts_use_speaker_boost"))

  const tts_speed = flatTts
    ? num(o.tts_speed, schemaNumericFallback(schema, "tts_speed"))
    : num(ttsSettings?.speed, schemaNumericFallback(schema, "tts_speed"))

  const stt_provider = flatStt
    ? str(o.stt_provider, schemaStringFallback(schema, "stt_provider"))
    : str(stt.provider, schemaStringFallback(schema, "stt_provider"))
  const stt_language = str(o.stt_language, schemaStringFallback(schema, "stt_language"))

  const recording_enabled = flatRec
    ? bool(o.recording_enabled, schemaBoolFallback(schema, "recording_enabled"))
    : bool(rec.enabled, schemaBoolFallback(schema, "recording_enabled"))
  const recording_channels = flatRec
    ? num(o.recording_channels, schemaNumericFallback(schema, "recording_channels"))
    : num(rec.channels, schemaNumericFallback(schema, "recording_channels"))

  const callingDaysRaw = strArr(o.calling_window_days)
  const calling_window_days =
    callingDaysRaw.length > 0 ? callingDaysRaw : schemaStringArrayFallback(schema, "calling_window_days")

  return {
    agent_id: opts.agent_id,
    name: str(o.name, ""),
    display_name: str(o.display_name, ""),
    description: str(o.description, schemaStringFallback(schema, "description")),
    llm_provider,
    llm_model,
    temperature: num(o.temperature, schemaNumericFallback(schema, "temperature")),
    max_tokens: num(o.max_tokens, schemaNumericFallback(schema, "max_tokens")),
    enable_prompt_caching: bool(o.enable_prompt_caching, schemaBoolFallback(schema, "enable_prompt_caching")),
    tts_provider,
    tts_voice_id,
    tts_model,
    tts_stability,
    tts_similarity_boost,
    tts_style,
    tts_use_speaker_boost,
    tts_speed,
    stt_provider,
    stt_language,
    stt_keywords: strArr(o.stt_keywords),
    tools: normalizeTools(o.tools, schema),
    system_prompt: str(o.system_prompt, str(o.prompt_preview, schemaStringFallback(schema, "system_prompt"))),
    first_message: str(o.first_message, schemaStringFallback(schema, "first_message")),
    recording_enabled,
    recording_channels,
    post_call_analyses: normalizePostCallAnalyses(o.post_call_analyses, schema),
    idle_timeout_secs: num(o.idle_timeout_secs, schemaNumericFallback(schema, "idle_timeout_secs")),
    idle_message: str(o.idle_message, schemaStringFallback(schema, "idle_message")),
    max_call_duration_secs: num(
      o.max_call_duration_secs,
      schemaNumericFallback(schema, "max_call_duration_secs")
    ),
    voicemail_action: str(o.voicemail_action, schemaStringFallback(schema, "voicemail_action")),
    voicemail_message: str(o.voicemail_message, schemaStringFallback(schema, "voicemail_message")),
    max_retries: num(o.max_retries, schemaNumericFallback(schema, "max_retries")),
    retry_delay_secs: num(o.retry_delay_secs, schemaNumericFallback(schema, "retry_delay_secs")),
    default_concurrency: num(o.default_concurrency, schemaNumericFallback(schema, "default_concurrency")),
    calling_window_start: str(o.calling_window_start, schemaStringFallback(schema, "calling_window_start")),
    calling_window_end: str(o.calling_window_end, schemaStringFallback(schema, "calling_window_end")),
    calling_window_days,
    has_unpublished_changes: opts.has_unpublished_changes,
  }
}

/** Map live API agent into draft row for Supabase update (discard draft). */
export function liveAgentToDraftRow(live: unknown, agentId: string, schema: AgentSchema): Record<string, unknown> {
  return apiResponseToDraftRow(live, { agent_id: agentId, has_unpublished_changes: false }, schema)
}
