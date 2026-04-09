import type { Agent, AgentListItem, AgentSchema, PhoneNumber, Voice } from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

/** Single-agent JSON may be the agent object or wrapped as `{ agent: {...} }` / `{ data: {...} }`. */
function unwrapAgentJson<T>(data: unknown): T {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>
    if (o.agent != null && typeof o.agent === "object" && !Array.isArray(o.agent)) {
      return o.agent as T
    }
    if (o.data != null && typeof o.data === "object" && !Array.isArray(o.data)) {
      return o.data as T
    }
  }
  return data as T
}

async function parseErrorBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ── Batches ──

export async function uploadBatch(file: File, agentName: string, fromNumber: string) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("agent_name", agentName)
  formData.append("from_number", fromNumber)
  const res = await fetch(`${API_BASE}/api/batches/upload`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Upload failed")
  }
  return res.json()
}

export async function updateBatchRows(
  batchId: string,
  payload: { mapping: Record<string, string>; rows: Record<string, unknown>[] }
) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/rows`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to save rows" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to save rows")
  }
  return res.json()
}

export async function startBatch(
  batchId: string,
  options: {
    concurrency: number
    schedule_mode: "now" | "scheduled"
    timezone?: string
    calling_window_start?: string
    calling_window_end?: string
    calling_window_days?: string[]
    start_date?: string
  }
) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
  const body = await res.json().catch(() => ({ detail: "Start failed" }))
  if (!res.ok) {
    throw new Error(typeof body.detail === "string" ? body.detail : "Start failed")
  }
  return body
}

export async function pauseBatch(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/pause`, { method: "POST" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Pause failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Pause failed")
  }
  return res.json()
}

export async function resumeBatch(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/resume`, { method: "POST" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Resume failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Resume failed")
  }
  return res.json()
}

export async function cancelBatch(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/cancel`, { method: "POST" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Cancel failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Cancel failed")
  }
  return res.json()
}

export async function getBatchStatus(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/status`)
  if (!res.ok) throw new Error(`Status fetch failed: ${res.statusText}`)
  return res.json()
}

export async function downloadResults(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/results`)
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  return res.blob()
}

// ── Agents ──

export async function getAgents(): Promise<AgentListItem[]> {
  const res = await fetch(`${API_BASE}/api/agents`)
  if (!res.ok) throw new Error(`Agents fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.agents ?? data
}

export async function getAgent(name: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`Agent fetch failed: ${res.statusText}`)
  const data = await res.json()
  return unwrapAgentJson<Agent>(data)
}

function throwFromApiBody(body: unknown): never {
  if (body instanceof Error) throw body
  if (typeof body === "string") throw new Error(body)
  if (body && typeof body === "object") {
    const d = (body as { detail?: unknown }).detail
    if (typeof d === "string") throw new Error(d)
    if (Array.isArray(d)) {
      const msgs = d.map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : String(x)))
      throw new Error(msgs.join("; ") || "Request failed")
    }
  }
  throw new Error(JSON.stringify(body))
}

export async function createAgent(data: Record<string, unknown>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return unwrapAgentJson<Agent>(await res.json())
}

export async function updateAgent(name: string, data: Record<string, unknown>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return unwrapAgentJson<Agent>(await res.json())
}

export async function deleteAgent(name: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, { method: "DELETE" })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function cloneAgent(
  name: string,
  data: { name: string; display_name: string }
): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return unwrapAgentJson<Agent>(await res.json())
}

export async function getAgentSchema(): Promise<AgentSchema> {
  const res = await fetch(`${API_BASE}/api/agent-schema`)
  if (!res.ok) throw new Error(`Schema fetch failed: ${res.statusText}`)
  return res.json()
}

export async function getAgentPrompt(name: string): Promise<{ content: string; prompt_variables: string[] }> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/prompt`)
  if (!res.ok) throw new Error(`Prompt fetch failed: ${res.statusText}`)
  return res.json()
}

/**
 * Live published agent for rebuilding `agent_drafts` (discard / init draft).
 * Uses GET /api/agents/{name} (agents table) and merges the canonical prompt from GET /api/agents/{name}/prompt.
 */
export async function getLiveAgentForDraft(name: string): Promise<Agent> {
  const live = await getAgent(name)
  try {
    const pr = await getAgentPrompt(name)
    if (typeof pr.content === "string") {
      return { ...live, system_prompt: pr.content }
    }
  } catch {
    // Prompt endpoint missing or failed — keep whatever getAgent returned
  }
  return live
}

export async function updateAgentPrompt(
  name: string,
  content: string
): Promise<{ prompt_variables: string[]; prompt_preview: string }> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/prompt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

// ── Phone numbers ──

export async function getPhoneNumbers(): Promise<PhoneNumber[]> {
  const res = await fetch(`${API_BASE}/api/phone-numbers`)
  if (!res.ok) throw new Error(`Phone numbers fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.phone_numbers ?? data
}

export async function createPhoneNumber(data: { number: string; friendly_name: string }): Promise<PhoneNumber> {
  const res = await fetch(`${API_BASE}/api/phone-numbers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function updatePhoneNumber(id: string, data: Record<string, unknown>): Promise<PhoneNumber> {
  const res = await fetch(`${API_BASE}/api/phone-numbers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function syncTwilioNumbers(): Promise<{ total: number }> {
  const res = await fetch(`${API_BASE}/api/phone-numbers/sync-twilio`, { method: "POST" })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function searchAvailableNumbers(params: {
  country?: string
  area_code?: string
  contains?: string
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.country) searchParams.set("country", params.country)
  if (params.area_code) searchParams.set("area_code", params.area_code)
  if (params.contains) searchParams.set("contains", params.contains)
  if (params.limit) searchParams.set("limit", String(params.limit))

  const res = await fetch(`${API_BASE}/api/phone-numbers/search?${searchParams}`)
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function purchaseNumber(data: { number: string; friendly_name: string }) {
  const res = await fetch(`${API_BASE}/api/phone-numbers/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function releaseNumber(id: string) {
  const res = await fetch(`${API_BASE}/api/phone-numbers/${encodeURIComponent(id)}/release`, { method: "POST" })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

// ── Voices ──

export async function getVoices(): Promise<Voice[]> {
  const res = await fetch(`${API_BASE}/api/voices`)
  if (!res.ok) throw new Error(`Voices fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.voices ?? data
}

export async function syncVoices(): Promise<{ count: number }> {
  const res = await fetch(`${API_BASE}/api/voices/sync`, { method: "POST" })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function lookupVoice(voiceId: string): Promise<Voice> {
  const res = await fetch(`${API_BASE}/api/voices/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_id: voiceId }),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function addVoice(voiceId: string, customName?: string): Promise<Voice> {
  const res = await fetch(`${API_BASE}/api/voices/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_id: voiceId, custom_name: customName || undefined }),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function refreshVoice(voiceId: string): Promise<Voice> {
  const res = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(voiceId)}/refresh`, { method: "POST" })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  const data = await res.json()
  return data.voice ?? data
}

export async function removeVoice(voiceId: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE" })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function getVoiceAgents(voiceId: string): Promise<AgentListItem[]> {
  const res = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(voiceId)}/agents`)
  if (!res.ok) throw new Error(`Voice agents fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.agents ?? data
}
