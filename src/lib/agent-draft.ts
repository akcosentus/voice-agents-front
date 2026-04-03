import type { AgentDraft } from "./types"
import type { AgentTool } from "./types"

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

function normalizeTools(v: unknown): AgentTool[] {
  if (!Array.isArray(v)) return []
  return v.map((t) => {
    if (typeof t === "string") return { type: t, description: "", settings: {} }
    if (isObj(t)) {
      const settings = isObj(t.settings) ? (t.settings as Record<string, unknown>) : {}
      return {
        type: str(t.type, "end_call"),
        description: str(t.description, ""),
        settings,
      }
    }
    return { type: "end_call", description: "", settings: {} }
  })
}

function normalizePostCallAnalyses(
  v: unknown
): { name: string; model: string; prompt?: string; output_type: string }[] {
  if (!Array.isArray(v)) return []
  return v.map((item) => {
    if (!isObj(item)) return { name: "analysis", model: "", output_type: "text" }
    return {
      name: str(item.name, "analysis"),
      model: str(item.model, ""),
      output_type: str(item.output_type, "text"),
      prompt: typeof item.prompt === "string" ? item.prompt : undefined,
    }
  })
}

/**
 * Map GET /api/agents/{name} (or POST clone/create) response to **only** columns that exist
 * on `agent_drafts`. Handles both flat responses and legacy nested `{ llm, tts, stt, recording }`.
 */
export function apiResponseToDraftRow(
  raw: unknown,
  opts: { agent_id: string; has_unpublished_changes: boolean }
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

  const llm_provider = flatLlm ? str(o.llm_provider, "") : str(llm.provider, "")
  const llm_model = flatLlm ? str(o.llm_model, "") : str(llm.model, "")

  const tts_provider = flatTts ? str(o.tts_provider, "elevenlabs") : str(tts.provider, "elevenlabs")
  const tts_voice_id = flatTts ? str(o.tts_voice_id, "") : str(tts.voice_id, "")
  const tts_model = flatTts ? str(o.tts_model, "") : str(tts.model, "")

  const tts_stability = flatTts ? num(o.tts_stability, 0.5) : num(ttsSettings?.stability, 0.5)

  const tts_similarity_boost = flatTts
    ? num(o.tts_similarity_boost, 0.75)
    : num(ttsSettings?.similarity_boost, 0.75)

  const tts_style = flatTts ? num(o.tts_style, 0) : num(ttsSettings?.style, 0)

  const tts_use_speaker_boost = flatTts
    ? bool(o.tts_use_speaker_boost, true)
    : bool(ttsSettings?.use_speaker_boost, true)

  const tts_speed = flatTts ? num(o.tts_speed, 1) : num(ttsSettings?.speed, 1)

  const stt_provider = flatStt ? str(o.stt_provider, "deepgram") : str(stt.provider, "deepgram")
  const stt_language = str(o.stt_language, "en")

  const recording_enabled = flatRec ? bool(o.recording_enabled, true) : bool(rec.enabled, true)
  const recording_channels = flatRec ? num(o.recording_channels, 2) : num(rec.channels, 2)

  return {
    agent_id: opts.agent_id,
    name: str(o.name, ""),
    display_name: str(o.display_name, ""),
    description: str(o.description, ""),
    llm_provider,
    llm_model,
    temperature: num(o.temperature, 0.7),
    max_tokens: num(o.max_tokens, 1024),
    enable_prompt_caching: bool(o.enable_prompt_caching, false),
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
    tools: normalizeTools(o.tools),
    system_prompt: str(o.system_prompt, str(o.prompt_preview, "")),
    first_message: str(o.first_message, ""),
    recording_enabled,
    recording_channels,
    post_call_analyses: normalizePostCallAnalyses(o.post_call_analyses),
    idle_timeout_secs: num(o.idle_timeout_secs, 30),
    idle_message: str(o.idle_message, ""),
    max_call_duration_secs: num(o.max_call_duration_secs, 1800),
    voicemail_action: str(o.voicemail_action, "hang_up"),
    voicemail_message: str(o.voicemail_message, ""),
    max_retries: num(o.max_retries, 3),
    retry_delay_secs: num(o.retry_delay_secs, 300),
    default_concurrency: num(o.default_concurrency, 1),
    calling_window_start: str(o.calling_window_start, "09:00"),
    calling_window_end: str(o.calling_window_end, "17:00"),
    calling_window_days:
      strArr(o.calling_window_days).length > 0
        ? strArr(o.calling_window_days)
        : ["mon", "tue", "wed", "thu", "fri"],
    has_unpublished_changes: opts.has_unpublished_changes,
  }
}

/** Map live API agent into draft row for Supabase update (discard draft). */
export function liveAgentToDraftRow(live: unknown, agentId: string): Record<string, unknown> {
  return apiResponseToDraftRow(live, { agent_id: agentId, has_unpublished_changes: false })
}
