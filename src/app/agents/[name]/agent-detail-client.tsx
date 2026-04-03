"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  getAgent,
  getAgentSchema,
  updateAgent,
  updateAgentPrompt,
  getPostCallPrompt,
  updatePostCallPrompt,
  deleteAgent,
  cloneAgent,
  getPhoneNumbers,
  updatePhoneNumber,
} from "@/lib/api"
import { supabase } from "@/lib/supabase"
import type { AgentDraft, AgentSchema, AgentVersion } from "@/lib/types"
import {
  apiResponseToDraftRow,
  draftToApiPayload,
  extractPromptVariables,
  liveAgentToDraftRow,
} from "@/lib/agent-draft"
import { relativeTime } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AgentToolCard, AddToolMenu } from "@/components/agent-tool-editor"
import { toast } from "sonner"
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Pencil } from "lucide-react"

const DAYS = [
  { v: "mon", l: "Mon" },
  { v: "tue", l: "Tue" },
  { v: "wed", l: "Wed" },
  { v: "thu", l: "Thu" },
  { v: "fri", l: "Fri" },
  { v: "sat", l: "Sat" },
  { v: "sun", l: "Sun" },
]

function formatVoicemailLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function publishBody(draft: AgentDraft): Record<string, unknown> {
  const p = draftToApiPayload(draft)
  delete p.system_prompt
  return p
}

function snapshotFromDraft(draft: AgentDraft): Record<string, unknown> {
  return { ...draftToApiPayload(draft), system_prompt: draft.system_prompt }
}

export default function AgentDetailClient({ encodedName }: { encodedName: string }) {
  const router = useRouter()
  const decodedName = decodeURIComponent(encodedName)
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [schema, setSchema] = useState<AgentSchema | null>(null)
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [missingDraft, setMissingDraft] = useState(false)
  const [kwInput, setKwInput] = useState("")

  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [versionName, setVersionName] = useState("")
  const [versionDesc, setVersionDesc] = useState("")
  const [phones, setPhones] = useState<Awaited<ReturnType<typeof getPhoneNumbers>>>([])
  const [pubInboundOn, setPubInboundOn] = useState(false)
  const [pubOutboundOn, setPubOutboundOn] = useState(false)
  const [pubInboundId, setPubInboundId] = useState("")
  const [pubOutboundId, setPubOutboundId] = useState("")

  const [discardOpen, setDiscardOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneName, setCloneName] = useState("")
  const [cloneDisplay, setCloneDisplay] = useState("")
  const [cloning, setCloning] = useState(false)

  const [postModal, setPostModal] = useState<{ name: string; content: string } | null>(null)
  const [postSaving, setPostSaving] = useState(false)
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMissingDraft(false)
    try {
      const sch = await getAgentSchema()
      setSchema(sch)

      const { data: row, error } = await supabase
        .from("agent_drafts")
        .select("*")
        .eq("name", decodedName)
        .maybeSingle()

      if (error || !row) {
        setMissingDraft(true)
        setDraft(null)
        setVersions([])
        setLoading(false)
        return
      }

      const d = row as AgentDraft
      setDraft(d)

      const { data: vers } = await supabase
        .from("agent_versions")
        .select("*")
        .eq("agent_id", d.agent_id)
        .order("version_number", { ascending: false })

      setVersions((vers as AgentVersion[]) ?? [])

      const phoneList = await getPhoneNumbers().catch(() => [])
      setPhones(phoneList.filter((p) => p.is_active !== false))

      const nextNum = vers?.length ? (vers as AgentVersion[])[0]!.version_number + 1 : 1
      setVersionName(`V${nextNum}`)
      setVersionDesc("")

      const inbound = phoneList.find((p) => p.inbound_agent?.id === d.id || p.inbound_agent?.name === d.name)
      const outbound = phoneList.find((p) => p.outbound_agent?.id === d.id || p.outbound_agent?.name === d.name)
      setPubInboundOn(!!inbound)
      setPubOutboundOn(!!outbound)
      setPubInboundId(inbound?.id ?? "")
      setPubOutboundId(outbound?.id ?? "")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load")
    }
    setLoading(false)
  }, [decodedName])

  useEffect(() => {
    load()
  }, [load])

  const patchDraft = useCallback(async (patch: Record<string, unknown>) => {
    let agentId: string | null = null
    setDraft((prev) => {
      if (!prev) return prev
      agentId = prev.agent_id
      return { ...prev, ...patch, has_unpublished_changes: true } as AgentDraft
    })
    if (!agentId) return
    const { error } = await supabase
      .from("agent_drafts")
      .update({ ...patch, has_unpublished_changes: true })
      .eq("agent_id", agentId)
    if (error) {
      toast.error(error.message)
      load()
    } else {
      toast.success("Draft saved", { id: "draft-patch", duration: 900 })
    }
  }, [load])

  const initDraftFromLive = async () => {
    try {
      const live = await getAgent(decodedName)
      const row = apiResponseToDraftRow(live, {
        agent_id: live.id,
        has_unpublished_changes: false,
      })
      const { error } = await supabase.from("agent_drafts").insert(row)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success("Draft initialized from live agent")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    }
  }

  const handleDiscard = async () => {
    if (!draft) return
    setDiscarding(true)
    try {
      const live = await getAgent(decodedName)
      const row = liveAgentToDraftRow(live, draft.agent_id)
      const { error } = await supabase.from("agent_drafts").update(row).eq("agent_id", draft.agent_id)
      if (error) throw new Error(error.message)
      toast.success("Draft discarded")
      setDiscardOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    }
    setDiscarding(false)
  }

  const handlePublish = async () => {
    if (!draft) return
    setPublishing(true)
    try {
      const body = publishBody(draft)
      await updateAgent(decodedName, body)
      await updateAgentPrompt(decodedName, draft.system_prompt)

      const agentId = draft.id

      if (pubInboundOn && pubInboundId) {
        await updatePhoneNumber(pubInboundId, { inbound_agent_id: agentId })
      }
      if (pubOutboundOn && pubOutboundId) {
        await updatePhoneNumber(pubOutboundId, { outbound_agent_id: agentId })
      }

      const nextNum = versions.length ? Math.max(...versions.map((x) => x.version_number)) + 1 : 1
      const assignments: { number: string; friendly_name: string; direction: string }[] = []
      if (pubInboundOn && pubInboundId) {
        const p = phones.find((x) => x.id === pubInboundId)
        if (p) assignments.push({ number: p.number, friendly_name: p.friendly_name, direction: "inbound" })
      }
      if (pubOutboundOn && pubOutboundId) {
        const p = phones.find((x) => x.id === pubOutboundId)
        if (p) assignments.push({ number: p.number, friendly_name: p.friendly_name, direction: "outbound" })
      }

      const { error: vErr } = await supabase.from("agent_versions").insert({
        agent_id: draft.agent_id,
        version_number: nextNum,
        version_name: versionName.trim() || `V${nextNum}`,
        description: versionDesc.trim(),
        config_snapshot: snapshotFromDraft(draft),
        phone_assignments: assignments,
        published_at: new Date().toISOString(),
        published_by: null,
      })
      if (vErr) throw new Error(vErr.message)

      const { error: dErr } = await supabase
        .from("agent_drafts")
        .update({ has_unpublished_changes: false })
        .eq("agent_id", draft.agent_id)
      if (dErr) throw new Error(dErr.message)

      toast.success(`Version ${versionName.trim() || `V${nextNum}`} published`)
      setPublishOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed")
    }
    setPublishing(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteAgent(decodedName)
      toast.success("Agent deleted")
      router.push("/agents")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    }
    setDeleting(false)
  }

  const handleClone = async () => {
    if (!cloneName.trim() || !cloneDisplay.trim()) {
      toast.error("Name and display name required")
      return
    }
    setCloning(true)
    try {
      const created = await cloneAgent(decodedName, { name: cloneName.trim(), display_name: cloneDisplay.trim() })
      const draftRow = apiResponseToDraftRow(created, {
        agent_id: created.id,
        has_unpublished_changes: false,
      })
      await supabase.from("agent_drafts").insert(draftRow)
      toast.success("Agent cloned")
      router.push(`/agents/${encodeURIComponent(created.name)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clone failed")
    }
    setCloning(false)
  }

  const revertVersion = async (v: AgentVersion) => {
    if (!draft) return
    const row = apiResponseToDraftRow(v.config_snapshot, {
      agent_id: draft.agent_id,
      has_unpublished_changes: true,
    })
    const { error } = await supabase.from("agent_drafts").update(row).eq("agent_id", draft.agent_id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`Draft reverted to V${v.version_number}. Publish to make it live.`)
    load()
  }

  const promptVars = useMemo(() => extractPromptVariables(draft?.system_prompt ?? ""), [draft?.system_prompt])

  const openPostPrompt = async (analysisName: string) => {
    try {
      const data = await getPostCallPrompt(decodedName, analysisName)
      setPostModal({ name: data.name, content: data.content })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load prompt")
    }
  }

  const savePostPrompt = async () => {
    if (!postModal) return
    setPostSaving(true)
    try {
      await updatePostCallPrompt(decodedName, postModal.name, postModal.content)
      toast.success("Post-call prompt saved")
      setPostModal(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    }
    setPostSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (missingDraft || !draft || !schema) {
    return (
      <div className="space-y-4">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} />
          Agents
        </Link>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No draft row found for this agent.</p>
          <Button className="mt-4" onClick={initDraftFromLive}>
            Initialize draft from live config
          </Button>
        </div>
      </div>
    )
  }

  const fr = schema.field_ranges
  const setF = (patch: Record<string, unknown>) => {
    void patchDraft(patch)
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
            Agents
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              className="h-auto max-w-xl border-0 border-b border-transparent px-0 py-1 text-2xl font-semibold tracking-tight shadow-none focus-visible:border-border focus-visible:ring-0"
              value={draft.display_name}
              onChange={(e) => void patchDraft({ display_name: e.target.value })}
            />
            {draft.has_unpublished_changes && (
              <Badge className="border-amber-300 bg-amber-50 text-amber-900">Draft — unpublished changes</Badge>
            )}
          </div>
          <Textarea
            className="mt-2 min-h-[60px] resize-none border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
            placeholder="Description"
            value={draft.description}
            onChange={(e) => void patchDraft({ description: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!draft.has_unpublished_changes}
            className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
            onClick={() => setPublishOpen(true)}
          >
            Publish
          </Button>
          {draft.has_unpublished_changes && (
            <Button variant="outline" onClick={() => setDiscardOpen(true)}>
              Discard draft
            </Button>
          )}
          <Button variant="outline" onClick={() => setCloneOpen(true)}>
            Clone
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid max-w-4xl gap-6">
        {/* LLM */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Language model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Model</Label>
                <Select value={draft.llm_model} onValueChange={(v) => setF({ llm_model: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {schema.llm_models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={draft.enable_prompt_caching}
                  onCheckedChange={(c) => setF({ enable_prompt_caching: !!c })}
                />
                <Label>Prompt caching</Label>
              </div>
            </div>
            {fr.temperature && (
              <SliderField
                label="Temperature"
                value={draft.temperature}
                range={fr.temperature}
                onChange={(v) => setF({ temperature: v })}
              />
            )}
            {fr.max_tokens && (
              <SliderField
                label="Max tokens"
                value={draft.max_tokens}
                range={fr.max_tokens}
                onChange={(v) => setF({ max_tokens: Math.round(v) })}
              />
            )}
          </CardContent>
        </Card>

        {/* TTS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Text-to-speech</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Readonly label="Provider" value={draft.tts_provider} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Voice ID</Label>
                <Input
                  className="font-mono text-xs"
                  value={draft.tts_voice_id}
                  onChange={(e) => setF({ tts_voice_id: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Model</Label>
                <Select value={draft.tts_model} onValueChange={(v) => setF({ tts_model: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(schema.tts_models[draft.tts_provider] ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fr.tts_stability && (
                <SliderField label="Stability" value={draft.tts_stability} range={fr.tts_stability} onChange={(v) => setF({ tts_stability: v })} />
              )}
              {fr.tts_similarity_boost && (
                <SliderField
                  label="Similarity boost"
                  value={draft.tts_similarity_boost}
                  range={fr.tts_similarity_boost}
                  onChange={(v) => setF({ tts_similarity_boost: v })}
                />
              )}
              {fr.tts_style && (
                <SliderField label="Style" value={draft.tts_style} range={fr.tts_style} onChange={(v) => setF({ tts_style: v })} />
              )}
              {fr.tts_speed && (
                <SliderField label="Speed" value={draft.tts_speed} range={fr.tts_speed} onChange={(v) => setF({ tts_speed: v })} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={draft.tts_use_speaker_boost} onCheckedChange={(c) => setF({ tts_use_speaker_boost: !!c })} />
              <Label>Speaker boost</Label>
            </div>
          </CardContent>
        </Card>

        {/* STT */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Speech-to-text</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Readonly label="Provider" value={draft.stt_provider} />
            <div className="space-y-1">
              <Label>Language</Label>
              <Select value={draft.stt_language} onValueChange={(v) => setF({ stt_language: v ?? "" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schema.stt_languages.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Keywords</Label>
              <div className="flex flex-wrap gap-1.5">
                {draft.stt_keywords.map((k) => (
                  <Badge key={k} variant="secondary" className="gap-1 pr-1">
                    {k}
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-muted"
                      onClick={() => setF({ stt_keywords: draft.stt_keywords.filter((x) => x !== k) })}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Keyword, Enter"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    const t = kwInput.trim()
                    if (t && !draft.stt_keywords.includes(t)) setF({ stt_keywords: [...draft.stt_keywords, t] })
                    setKwInput("")
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tools */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {draft.tools.map((tool, idx) => (
              <AgentToolCard
                key={idx}
                tool={tool}
                onChange={(t) => {
                  const next = [...draft.tools]
                  next[idx] = t
                  setF({ tools: next })
                }}
                onRemove={() => setF({ tools: draft.tools.filter((_, i) => i !== idx) })}
              />
            ))}
            <AddToolMenu
              schema={schema}
              existing={draft.tools.map((t) => t.type)}
              onAdd={(type) => {
                const desc =
                  (schema.tool_settings_schema as Record<string, { description?: string }>)?.[type]?.description ?? ""
                setF({
                  tools: [
                    ...draft.tools,
                    { type, description: typeof desc === "string" ? desc : "", settings: {} },
                  ],
                })
              }}
            />
          </CardContent>
        </Card>

        {/* Prompt */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {promptVars.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {promptVars.map((v) => (
                  <Badge key={v} variant="outline" className="font-mono text-xs">{`{{${v}}}`}</Badge>
                ))}
              </div>
            )}
            <Textarea
              className="min-h-[320px] font-mono text-xs"
              value={draft.system_prompt}
              onChange={(e) => setF({ system_prompt: e.target.value })}
            />
            <div className="space-y-1">
              <Label>First message</Label>
              <Textarea value={draft.first_message} onChange={(e) => setF({ first_message: e.target.value })} rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Call behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call behavior</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fr.idle_timeout_secs && (
              <SliderField
                label="Idle timeout"
                value={draft.idle_timeout_secs}
                range={fr.idle_timeout_secs}
                onChange={(v) => setF({ idle_timeout_secs: Math.round(v) })}
                formatDisplay={(v) => `${v} seconds`}
              />
            )}
            <div className="space-y-1">
              <Label>Idle message</Label>
              <Input value={draft.idle_message} onChange={(e) => setF({ idle_message: e.target.value })} />
            </div>
            {fr.max_call_duration_secs && (
              <SliderField
                label="Max call duration"
                value={draft.max_call_duration_secs}
                range={fr.max_call_duration_secs}
                onChange={(v) => setF({ max_call_duration_secs: Math.round(v) })}
                formatDisplay={(v) => `${Math.round(v / 60)} minutes`}
              />
            )}
            <div className="space-y-1">
              <Label>Voicemail</Label>
              <Select value={draft.voicemail_action} onValueChange={(v) => setF({ voicemail_action: v ?? "" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schema.voicemail_actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {formatVoicemailLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.voicemail_action === "leave_message" && (
              <div className="space-y-1">
                <Label>Voicemail message</Label>
                <Textarea value={draft.voicemail_message} onChange={(e) => setF({ voicemail_message: e.target.value })} rows={3} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Post-call */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Post-call analyses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.post_call_analyses.map((row, i) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Select
                        value={row.model}
                        onValueChange={(v) => {
                          const n = [...draft.post_call_analyses]
                          n[i] = { ...n[i]!, model: v ?? "" }
                          setF({ post_call_analyses: n })
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {schema.llm_models.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{row.output_type}</span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openPostPrompt(row.name)}>
                        <Pencil size={14} className="mr-1" />
                        Prompt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recording */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recording</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={draft.recording_enabled} onCheckedChange={(c) => setF({ recording_enabled: !!c })} />
              <Label>Enabled</Label>
            </div>
            <Readonly label="Channels" value={String(draft.recording_channels)} />
          </CardContent>
        </Card>

        {/* Scheduling */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scheduling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fr.default_concurrency && (
              <SliderField
                label="Default concurrency"
                value={draft.default_concurrency}
                range={fr.default_concurrency}
                onChange={(v) => setF({ default_concurrency: Math.round(v) })}
              />
            )}
            {fr.max_retries && (
              <SliderField label="Max retries" value={draft.max_retries} range={fr.max_retries} onChange={(v) => setF({ max_retries: Math.round(v) })} />
            )}
            {fr.retry_delay_secs && (
              <SliderField
                label="Retry delay"
                value={draft.retry_delay_secs}
                range={fr.retry_delay_secs}
                onChange={(v) => setF({ retry_delay_secs: Math.round(v) })}
                formatDisplay={(v) => `${Math.round(v / 60)} minutes`}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Calling window start</Label>
                <Input type="time" value={draft.calling_window_start} onChange={(e) => setF({ calling_window_start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Calling window end</Label>
                <Input type="time" value={draft.calling_window_end} onChange={(e) => setF({ calling_window_end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Calling days</Label>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((d) => (
                  <label key={d.v} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.calling_window_days.includes(d.v)}
                      onCheckedChange={(c) => {
                        if (c) setF({ calling_window_days: [...draft.calling_window_days, d.v] })
                        else setF({ calling_window_days: draft.calling_window_days.filter((x) => x !== d.v) })
                      }}
                    />
                    {d.l}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Version history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published versions yet.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
                    onClick={() => setExpandedVersionId(expandedVersionId === v.id ? null : v.id)}
                  >
                    {expandedVersionId === v.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        V{v.version_number} — {v.version_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{v.description || "—"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{relativeTime(v.published_at)}</span>
                  </button>
                  {v.phone_assignments?.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-3 pb-2">
                      {v.phone_assignments.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {p.direction}: {p.friendly_name || p.number}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {expandedVersionId === v.id && (
                    <div className="border-t p-3">
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                        {JSON.stringify(v.config_snapshot, null, 2)}
                      </pre>
                      <Button className="mt-2" variant="outline" size="sm" onClick={() => revertVersion(v)}>
                        Revert to this version
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish version</DialogTitle>
            <DialogDescription>Push draft to live and record a version.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Version name</Label>
              <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="V2 — Updated prompt" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={versionDesc} onChange={(e) => setVersionDesc(e.target.value)} rows={2} />
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium">Phone number assignment</p>
              <p className="text-xs text-muted-foreground">Optional. You can publish without assigning numbers.</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={pubInboundOn} onCheckedChange={(c) => setPubInboundOn(!!c)} id="pub-in" />
              <Label htmlFor="pub-in">Inbound phone number</Label>
            </div>
            {pubInboundOn && (
              <Select
                value={pubInboundId || "__none__"}
                onValueChange={(v) => setPubInboundId((v ?? "") === "__none__" ? "" : (v ?? ""))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select number" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select…</SelectItem>
                  {phones.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.friendly_name || p.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2">
              <Checkbox checked={pubOutboundOn} onCheckedChange={(c) => setPubOutboundOn(!!c)} id="pub-out" />
              <Label htmlFor="pub-out">Outbound phone number</Label>
            </div>
            {pubOutboundOn && (
              <Select
                value={pubOutboundId || "__none__"}
                onValueChange={(v) => setPubOutboundId((v ?? "") === "__none__" ? "" : (v ?? ""))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select number" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select…</SelectItem>
                  {phones.map((p) => (
                    <SelectItem key={`o-${p.id}`} value={p.id}>
                      {p.friendly_name || p.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button
              className="bg-[var(--color-brand)] text-white"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? <Loader2 className="animate-spin" size={16} /> : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard draft?</DialogTitle>
            <DialogDescription>
              This resets the draft to the last published live configuration. Unpublished edits will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)} disabled={discarding}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={discarding}>
              {discarding ? <Loader2 className="animate-spin" size={16} /> : "Discard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete agent?</DialogTitle>
            <DialogDescription>This soft-deletes the agent on the server.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" size={16} /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="space-y-1">
              <Label>New agent name (path)</Label>
              <Input className="font-mono text-sm" value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="team/new_agent" />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input value={cloneDisplay} onChange={(e) => setCloneDisplay(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)} disabled={cloning}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={cloning}>
              {cloning ? <Loader2 className="animate-spin" size={16} /> : "Clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!postModal} onOpenChange={(o) => !o && setPostModal(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post-call prompt — {postModal?.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            className="min-h-[360px] font-mono text-xs"
            value={postModal?.content ?? ""}
            onChange={(e) => postModal && setPostModal({ ...postModal, content: e.target.value })}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostModal(null)} disabled={postSaving}>
              Cancel
            </Button>
            <Button className="bg-[var(--color-brand)] text-white" onClick={savePostPrompt} disabled={postSaving}>
              {postSaving ? <Loader2 className="animate-spin" size={16} /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Readonly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function SliderField({
  label,
  value,
  range,
  onChange,
  formatDisplay,
}: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  onChange: (v: number) => void
  formatDisplay?: (v: number) => string
}) {
  const show = formatDisplay ? formatDisplay(value) : range.step < 1 ? value.toFixed(1) : String(Math.round(value))
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">{show}</span>
      </div>
      <Slider
        value={[value ?? 0]}
        min={range.min}
        max={range.max}
        step={range.step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0]! : v)}
      />
    </div>
  )
}
