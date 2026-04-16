"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cloneAgent, createAgent, deleteAgent, getAgents, getAgent, getAgentSchema, getPhoneNumbers, getVoices, saveAgentDraft } from "@/lib/api"
import { apiResponseToDraftRow } from "@/lib/agent-draft"
import type { Agent, AgentListItem, PhoneNumber, Voice } from "@/lib/types"
import { formatPhone } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Bot, Loader2, MoreVertical, Plus } from "lucide-react"
import { toast } from "sonner"

/** E.g. +1 (949) 691-3324 → (949) 691-3324 for list display */
function formatPhoneNational(phone: string | null | undefined): string {
  if (phone == null || typeof phone !== "string") return ""
  return formatPhone(phone).replace(/^\+1\s+/, "")
}

function abbreviateLlmModel(model: string | null | undefined): string {
  if (model == null || typeof model !== "string") return "—"
  const m = model.trim()
  if (!m) return "—"
  const lower = m.toLowerCase()
  if (lower.startsWith("claude-")) return m.slice(7) || "—"
  if (lower.startsWith("claude_")) return m.slice(7) || "—"
  if (lower.startsWith("gpt-")) return m.slice(4) || "—"
  if (lower.startsWith("models/")) return m.slice(7) || "—"
  return m
}

/** Prefer non-empty values from GET /api/agents list when GET /api/agents/:name omits them */
function mergeAgentListFields(detail: Agent, row: AgentListItem | undefined): Agent {
  if (!row) return detail
  const llm = detail.llm_model?.trim() || row.llm_model?.trim() || detail.llm_model
  const ttsModel = detail.tts_model?.trim() || row.tts_model?.trim() || detail.tts_model
  const ttsVoice = detail.tts_voice_id?.trim() || row.tts_voice_id?.trim() || detail.tts_voice_id
  return { ...detail, llm_model: llm, tts_model: ttsModel, tts_voice_id: ttsVoice }
}

function generateAgentSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let suffix = ""
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `agent-${suffix}`
}

/** Comma-separated "(949) 691-3324 (inbound, outbound)" per number assigned to this agent */
function phoneAssignmentsForAgent(agentId: string | null | undefined, phones: PhoneNumber[]): string {
  if (!agentId) return ""
  const parts: string[] = []
  for (const p of phones) {
    if (p.is_active === false) continue
    const national = formatPhoneNational(p.number)
    if (!national) continue
    const dirs: string[] = []
    if (p.inbound_agent?.id === agentId) dirs.push("inbound")
    if (p.outbound_agent?.id === agentId) dirs.push("outbound")
    if (dirs.length === 0) continue
    parts.push(`${national} (${dirs.join(", ")})`)
  }
  return parts.join(", ")
}

export default function AgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [phones, setPhones] = useState<PhoneNumber[]>([])
  const [voiceMap, setVoiceMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const [cloning, setCloning] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [creating, setCreating] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getAgents()
      const listByName = new Map(list.map((a) => [a.name, a]))
      const [details, phoneList, voiceList] = await Promise.all([
        Promise.all(list.map((a) => getAgent(a.name).catch(() => null))),
        getPhoneNumbers().catch(() => [] as PhoneNumber[]),
        getVoices().catch(() => [] as Voice[]),
      ])
      setAgents(
        details
          .filter((d): d is Agent => d != null)
          .map((d) => mergeAgentListFields(d, listByName.get(d.name)))
      )
      setPhones(phoneList)
      setVoiceMap(new Map(voiceList.map((v) => [v.voice_id, v.custom_name || v.name])))
    } catch {
      setAgents([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const handleCloneAgent = async (source: Agent) => {
    setCloning(true)
    try {
      const name = generateAgentSlug()
      const display_name = `${source.display_name?.trim() || source.name} (Copy)`
      const [created, agentSchema] = await Promise.all([
        cloneAgent(source.name, { name, display_name }),
        getAgentSchema(),
      ])
      const draftRow = apiResponseToDraftRow(created, {
        agent_id: created.id,
        has_unpublished_changes: false,
      }, agentSchema)
      await saveAgentDraft(created.name, draftRow)
      toast.success("Agent cloned")
      router.push(`/agents/${encodeURIComponent(created.name)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clone failed")
    }
    setCloning(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAgent(deleteTarget.name)
      toast.success("Agent deleted")
      setDeleteOpen(false)
      setDeleteTarget(null)
      await fetchAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    }
    setDeleting(false)
  }

  const handleCreateAgent = async () => {
    setCreating(true)
    try {
      const name = generateAgentSlug()
      const [created, agentSchema] = await Promise.all([
        createAgent({
          name,
          display_name: "New Agent",
        }),
        getAgentSchema(),
      ])
      const draftRow = apiResponseToDraftRow(created, {
        agent_id: created.id,
        has_unpublished_changes: false,
      }, agentSchema)
      try {
        await saveAgentDraft(name, draftRow)
      } catch (draftErr) {
        toast.error(`Agent created but draft row failed: ${draftErr instanceof Error ? draftErr.message : "unknown error"}`)
      }
      toast.success("Agent created")
      router.push(`/agents/${encodeURIComponent(created.name)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create agent")
    }
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle mt-1">Voice agent configurations</p>
        </div>
        <Button
          onClick={() => void handleCreateAgent()}
          disabled={creating || cloning}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {creating ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Plus size={16} className="mr-1.5" />}
          New Agent
        </Button>
      </div>

      <div className="pt-2">
      {loading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Voice</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 rounded-md" /></TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : agents.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center py-20">
          <Bot size={48} className="text-muted-foreground/30" />
          <h3 className="mt-4 text-base font-medium">No agents configured</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create an agent to get started.</p>
          <Button
            onClick={() => void handleCreateAgent()}
            disabled={creating || cloning}
            className="mt-4 h-9 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)]"
          >
            {creating ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Plus size={16} className="mr-1.5" />}
            New Agent
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Voice</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const phoneLine = phoneAssignmentsForAgent(agent.id, phones)
              const llmShort = abbreviateLlmModel(agent.llm_model)
              const vid = agent.tts_voice_id?.trim() || ""
              const voiceLabel = vid ? (voiceMap.get(vid) ?? vid) : ""

              return (
                <TableRow
                  key={agent.name}
                  className="cursor-pointer"
                  onClick={() => router.push(`/agents/${encodeURIComponent(agent.name)}`)}
                >
                  <TableCell className="font-medium">
                    {agent.display_name?.trim() || agent.name || "—"}
                  </TableCell>
                  <TableCell>
                    {phoneLine ? (
                      <span className="mono">{phoneLine}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {voiceLabel || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {llmShort}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground hover:bg-transparent hover:text-foreground"
                          aria-label={`Actions for ${agent.display_name}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          disabled={cloning || creating}
                          onSelect={() => void handleCloneAgent(agent)}
                        >
                          Clone
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            setDeleteTarget(agent)
                            setDeleteOpen(true)
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden sm:max-w-[440px]">
          <div className="space-y-4 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">Delete agent?</DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                {deleteTarget ? (
                  <>
                    This soft-deletes{" "}
                    <span className="font-medium text-foreground">{deleteTarget.display_name}</span> on the server.
                  </>
                ) : (
                  "This soft-deletes the agent on the server."
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-3.5">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                What happens next
              </p>
              <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-foreground/75 marker:text-muted-foreground/60">
                <li>The agent no longer appears in your list or API</li>
                <li>Update phone routing if this agent was assigned to a number</li>
                <li className="font-medium text-foreground/90">This cannot be undone from the dashboard</li>
              </ul>
            </div>
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 basis-0 justify-center font-medium"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Delete agent"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
