import type { Agent, AgentDraft } from "./types"

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

/** Map live API agent into draft row shape for Supabase update (discard draft) */
export function liveAgentToDraftRow(live: Agent, agentId: string): Record<string, unknown> {
  return {
    ...live,
    agent_id: agentId,
    has_unpublished_changes: false,
  }
}
