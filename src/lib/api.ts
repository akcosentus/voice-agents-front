import type { Agent, AgentListItem, AgentSchema, PhoneNumber } from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

async function parseErrorBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ── Batches ──

export async function uploadBatch(file: File, agentName: string) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("agent_name", agentName)
  const res = await fetch(`${API_BASE}/api/batches/upload`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  return res.json()
}

export async function startBatch(batchId: string, concurrency = 1) {
  const res = await fetch(`${API_BASE}/api/batches/${batchId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concurrency }),
  })
  if (!res.ok) throw new Error(`Start failed: ${res.statusText}`)
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
  return res.json()
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
  return res.json()
}

export async function updateAgent(name: string, data: Record<string, unknown>): Promise<Agent> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throwFromApiBody(await parseErrorBody(res))
  return res.json()
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
  return res.json()
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

export async function updateAgentPrompt(
  name: string,
  content: string
): Promise<{ prompt_variables: string[]; prompt_preview: string }> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(name)}/prompt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getPostCallPrompt(name: string, analysisName: string): Promise<{ name: string; content: string }> {
  const res = await fetch(
    `${API_BASE}/api/agents/${encodeURIComponent(name)}/post-call/${encodeURIComponent(analysisName)}`
  )
  if (!res.ok) throw new Error(`Post-call prompt fetch failed: ${res.statusText}`)
  return res.json()
}

export async function updatePostCallPrompt(
  name: string,
  analysisName: string,
  content: string
): Promise<{ name: string; content: string }> {
  const res = await fetch(
    `${API_BASE}/api/agents/${encodeURIComponent(name)}/post-call/${encodeURIComponent(analysisName)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  )
  if (!res.ok) throw new Error(await res.text())
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

export async function deletePhoneNumber(id: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/phone-numbers/${encodeURIComponent(id)}`, { method: "DELETE" })
  const text = await res.text()
  if (!res.ok) {
    let body: unknown = text || res.statusText
    try {
      if (text) body = JSON.parse(text)
    } catch {
      /* use raw text */
    }
    throwFromApiBody(body)
  }
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
