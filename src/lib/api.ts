import type { Agent, AgentListItem, AgentSchema, PhoneNumber, Voice } from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

function authHeaders(): Record<string, string> {
  return { "X-API-Key": process.env.NEXT_PUBLIC_COSENTUS_API_KEY || "" }
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() }
}

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

// ── Calls ─────────────────────────────────────────────────────────

export async function listCalls(params?: {
  page?: number
  page_size?: number
  agent_name?: string
  agent_display_name?: string
  status?: string
  direction?: string
  sort_by?: string
  sort_order?: string
}): Promise<{ calls: import("./types").Call[]; total: number; page: number; page_size: number }> {
  const query = new URLSearchParams()
  if (params?.page != null) query.set("page", String(params.page))
  if (params?.page_size) query.set("page_size", String(params.page_size))
  if (params?.agent_name) query.set("agent_name", params.agent_name)
  if (params?.agent_display_name) query.set("agent_display_name", params.agent_display_name)
  if (params?.status) query.set("status", params.status)
  if (params?.direction) query.set("direction", params.direction)
  if (params?.sort_by) query.set("sort_by", params.sort_by)
  if (params?.sort_order) query.set("sort_order", params.sort_order)
  const qs = query.toString()
  const res = await fetch(`${API_BASE}/api/calls${qs ? `?${qs}` : ""}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to list calls: ${res.status}`)
  return res.json()
}

export async function getCall(callId: string): Promise<import("./types").Call> {
  const res = await fetch(`${API_BASE}/api/calls/${encodeURIComponent(callId)}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to get call: ${res.status}`)
  return res.json()
}

export async function getCallAgentNames(): Promise<{ display_name: string; agent_name: string }[]> {
  const res = await fetch(`${API_BASE}/api/calls/agents`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to get agent names: ${res.status}`)
  const data = await res.json()
  const list = data.agents ?? data.agent_names ?? data
  if (Array.isArray(list)) {
    if (list.length > 0 && typeof list[0] === "string") {
      return list.map((name: string) => ({ display_name: name, agent_name: name }))
    }
    return list
  }
  return []
}

export async function getRecordingUrl(callId: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/calls/${encodeURIComponent(callId)}/recording-url`, { headers: authHeaders() })
  if (!res.ok) return null
  const data = await res.json()
  return data.url ?? null
}

// ── Batches ──

export async function listBatches(): Promise<import("./types").Batch[]> {
  const res = await fetch(`${API_BASE}/api/batches`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to list batches: ${res.status}`)
  const data = await res.json()
  return data.batches ?? data
}

export async function getBatch(batchId: string): Promise<{
  batch: import("./types").Batch
  calls: import("./types").Call[]
}> {
  const res = await fetch(`${API_BASE}/api/batches/${encodeURIComponent(batchId)}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to get batch: ${res.status}`)
  return res.json()
}

export async function getBatchDownloadUrl(batchId: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/batches/${encodeURIComponent(batchId)}/download-url`, { headers: authHeaders() })
  if (!res.ok) return null
  const data = await res.json()
  return data.url ?? null
}

export async function deleteDraftBatch(batchId: string): Promise<void> {
  await fetch(`${API_BASE}/api/batches/${encodeURIComponent(batchId)}/draft`, {
    method: "DELETE",
    headers: authHeaders(),
  })
}

export async function uploadBatch(file: File, agentName: string, fromNumber: string) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("agent_name", agentName)
  formData.append("from_number", fromNumber)
  const res = await fetch(`${API_BASE}/api/batches/upload`, {
    method: "POST",
    headers: authHeaders(),
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
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
    body: JSON.stringify(options),
  })
  const body = await res.json().catch(() => ({ detail: "Start failed" }))
  if (!res.ok) {
    throw new Error(typeof body.detail === "string" ? body.detail : "Start failed")
  }
  return body
}

export async function pauseBatch(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/pause`, { method: "POST", headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Pause failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Pause failed")
  }
  return res.json()
}

export async function resumeBatch(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/resume`, { method: "POST", headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Resume failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Resume failed")
  }
  return res.json()
}

export async function cancelBatch(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/cancel`, { method: "POST", headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Cancel failed" }))
    throw new Error(typeof err.detail === "string" ? err.detail : "Cancel failed")
  }
  return res.json()
}

export async function getBatchStatus(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/status`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Status fetch failed: ${res.statusText}`)
  return res.json()
}

export async function downloadResults(batchId: string) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/results`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  return res.blob()
}

// ── Agent Drafts ──

export async function getAgentDraft(agentName: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentName)}/draft`, { headers: authHeaders() })
  if (!res.ok) return null
  const data = await res.json()
  return data.draft ?? data
}

export async function saveAgentDraft(agentName: string, draftData: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentName)}/draft`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(draftData),
  })
  if (!res.ok) {
    const body = await parseErrorBody(res)
    throwFromApiBody(body)
  }
}

// ── Agent Versions ──

export async function listAgentVersions(agentName: string): Promise<import("./types").AgentVersion[]> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentName)}/versions`, { headers: authHeaders() })
  if (!res.ok) return []
  const data = await res.json()
  return data.versions ?? data
}

export async function publishAgentVersion(
  agentName: string,
  publishData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentName)}/versions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(publishData),
  })
  if (!res.ok) {
    const body = await parseErrorBody(res)
    throwFromApiBody(body)
  }
  return res.json()
}

// ── Agents ──

export async function getAgents(): Promise<AgentListItem[]> {
  const res = await fetch(`${API_BASE}/api/agents`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Agents fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.agents ?? data
}

export async function getAgent(name: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Agent fetch failed: ${res.statusText}`)
  const data = await res.json()
  return unwrapAgentJson<Agent>(data)
}

export async function createAgent(data: Record<string, unknown>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return unwrapAgentJson<Agent>(await res.json())
}

export async function updateAgent(name: string, data: Record<string, unknown>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return unwrapAgentJson<Agent>(await res.json())
}

export async function deleteAgent(name: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, { method: "DELETE", headers: authHeaders() })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function cloneAgent(
  name: string,
  data: { name: string; display_name: string }
): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/clone`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return unwrapAgentJson<Agent>(await res.json())
}

export async function getAgentSchema(): Promise<AgentSchema> {
  const res = await fetch(`${API_BASE}/api/agent-schema`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Schema fetch failed: ${res.statusText}`)
  return res.json()
}

export async function getAgentPrompt(name: string): Promise<{ content: string; prompt_variables: string[] }> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/prompt`, { headers: authHeaders() })
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
    headers: jsonHeaders(),
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

// ── Phone numbers ──

export async function getPhoneNumbers(): Promise<PhoneNumber[]> {
  const res = await fetch(`${API_BASE}/api/phone-numbers`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Phone numbers fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.phone_numbers ?? data
}

export async function createPhoneNumber(data: { number: string; friendly_name: string }): Promise<PhoneNumber> {
  const res = await fetch(`${API_BASE}/api/phone-numbers`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function updatePhoneNumber(id: string, data: Record<string, unknown>): Promise<PhoneNumber> {
  const res = await fetch(`${API_BASE}/api/phone-numbers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function syncTwilioNumbers(): Promise<{ total: number }> {
  const res = await fetch(`${API_BASE}/api/phone-numbers/sync-twilio`, { method: "POST", headers: authHeaders() })
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

  const res = await fetch(`${API_BASE}/api/phone-numbers/search?${searchParams}`, { headers: authHeaders() })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function purchaseNumber(data: { number: string; friendly_name: string }) {
  const res = await fetch(`${API_BASE}/api/phone-numbers/purchase`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function releaseNumber(id: string) {
  const res = await fetch(`${API_BASE}/api/phone-numbers/${encodeURIComponent(id)}/release`, { method: "POST", headers: authHeaders() })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

// ── Voices ──

export async function getVoices(): Promise<Voice[]> {
  const res = await fetch(`${API_BASE}/api/voices`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Voices fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.voices ?? data
}

export async function syncVoices(): Promise<{ count: number }> {
  const res = await fetch(`${API_BASE}/api/voices/sync`, { method: "POST", headers: authHeaders() })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function lookupVoice(voiceId: string): Promise<Voice> {
  const res = await fetch(`${API_BASE}/api/voices/lookup`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ voice_id: voiceId }),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function addVoice(voiceId: string, customName?: string): Promise<Voice> {
  const res = await fetch(`${API_BASE}/api/voices/add`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ voice_id: voiceId, custom_name: customName || undefined }),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function refreshVoice(voiceId: string): Promise<Voice> {
  const res = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(voiceId)}/refresh`, { method: "POST", headers: authHeaders() })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  const data = await res.json()
  return data.voice ?? data
}

export async function removeVoice(voiceId: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: authHeaders() })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
}

export async function getVoiceAgents(voiceId: string): Promise<AgentListItem[]> {
  const res = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(voiceId)}/agents`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Voice agents fetch failed: ${res.statusText}`)
  const data = await res.json()
  return data.agents ?? data
}
