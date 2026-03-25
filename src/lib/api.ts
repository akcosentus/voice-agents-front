const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

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

export async function getAgents(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/agents`)
  if (!res.ok) throw new Error(`Agents fetch failed: ${res.statusText}`)
  return res.json()
}
