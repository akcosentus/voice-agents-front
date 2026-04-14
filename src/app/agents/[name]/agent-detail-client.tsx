"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  getAgentDraft,
  getAgentPrompt,
  getAgentSchema,
  getLiveAgentForDraft,
  listAgentVersions,
  publishAgentVersion,
  saveAgentDraft,
  updateAgent,
  updateAgentPrompt,
  getPhoneNumbers,
  updatePhoneNumber,
} from "@/lib/api"
import type { AgentDraft, AgentSchema, AgentVersion, PhoneNumber, PostCallField } from "@/lib/types"
import {
  apiResponseToDraftRow,
  draftToApiPayload,
  extractPromptVariables,
  liveAgentToDraftRow,
} from "@/lib/agent-draft"
import { cn, formatPhoneNumberLabel } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PromptEditor } from "@/components/prompt-editor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AgentToolCard, AddToolMenu, formatAgentToolTypeLabel } from "@/components/agent-tool-editor"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { DeleteIconButton } from "@/components/delete-icon-button"
import {
  SchemaSlider,
  expressivenessRange,
  llmMaxTokensRange,
  promptCardClassName,
  temperatureRange,
  ttsSpeedRange,
  voiceTemperatureRange,
} from "@/components/agent-editor-fields"
import { toast } from "sonner"
import { AlertTriangle, ChevronRight, Clock, FileText, Info, List, Loader2, Lock, Pause, Pencil, Play, Plus, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TestCallPanel } from "@/components/test-call-panel"
import { VoicePicker, useResolvedVoice } from "@/components/voice-picker"
import { useAudioPreview } from "@/hooks/use-audio-preview"
import { AddVoiceModal } from "@/components/add-voice-modal"
import { AgentConfigSection } from "@/components/agent-config-section"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PostCallFieldEditor } from "@/components/post-call-field-editor"

function publishBody(draft: AgentDraft): Record<string, unknown> {
  const p = draftToApiPayload(draft)
  delete p.system_prompt
  return p
}

function snapshotFromDraft(draft: AgentDraft): Record<string, unknown> {
  return { ...draftToApiPayload(draft), system_prompt: draft.system_prompt }
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function formatVersionDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function normalizeRoutePhoneId(id: string | null | undefined): string | null {
  if (id == null || id === "" || id === "__none__") return null
  return id
}

/** Compare server state vs desired selection; only include phones that need a PUT. */
function buildPhoneAssignmentPutMap(
  agentId: string,
  curInboundPhoneId: string | null,
  curOutboundPhoneId: string | null,
  wantInboundPhoneId: string | null,
  wantOutboundPhoneId: string | null
): Map<string, Record<string, unknown>> {
  const curIn = normalizeRoutePhoneId(curInboundPhoneId)
  const curOut = normalizeRoutePhoneId(curOutboundPhoneId)
  const wantIn = normalizeRoutePhoneId(wantInboundPhoneId)
  const wantOut = normalizeRoutePhoneId(wantOutboundPhoneId)

  const puts = new Map<string, Record<string, unknown>>()
  const merge = (pid: string, patch: Record<string, unknown>) => {
    puts.set(pid, { ...(puts.get(pid) ?? {}), ...patch })
  }

  if (curIn !== wantIn) {
    if (curIn) merge(curIn, { inbound_agent_id: null })
    if (wantIn) merge(wantIn, { inbound_agent_id: agentId })
  }
  if (curOut !== wantOut) {
    if (curOut) merge(curOut, { outbound_agent_id: null })
    if (wantOut) merge(wantOut, { outbound_agent_id: agentId })
  }

  return puts
}

export default function AgentDetailClient({ encodedName }: { encodedName: string }) {
  const decodedName = decodeURIComponent(encodedName)
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [schema, setSchema] = useState<AgentSchema | null>(null)
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [missingDraft, setMissingDraft] = useState(false)

  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [versionName, setVersionName] = useState("")
  const [versionDesc, setVersionDesc] = useState("")
  const [publishModalPhones, setPublishModalPhones] = useState<PhoneNumber[]>([])
  const [publishPhonesLoading, setPublishPhonesLoading] = useState(false)
  const [pubInboundOn, setPubInboundOn] = useState(false)
  const [pubOutboundOn, setPubOutboundOn] = useState(false)
  const [pubInboundId, setPubInboundId] = useState("")
  const [pubOutboundId, setPubOutboundId] = useState("")

  const [discardOpen, setDiscardOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<
    | null
    | { type: "tool"; index: number; label: string }
    | { type: "postField"; index: number; label: string }
  >(null)
  const [editingField, setEditingField] = useState<{ index: number | null; field: PostCallField } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<AgentVersion | null>(null)
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const configColumnRef = useRef<HTMLDivElement>(null)


  const load = useCallback(async () => {
    setLoading(true)
    setMissingDraft(false)
    try {
      const sch = await getAgentSchema()
      setSchema(sch)

      const row = await getAgentDraft(decodedName)

      if (!row) {
        setMissingDraft(true)
        setDraft(null)
        setVersions([])
        setLoading(false)
        return
      }

      const d = row as unknown as AgentDraft
      const normalized = apiResponseToDraftRow(d, {
        agent_id: d.agent_id,
        has_unpublished_changes: d.has_unpublished_changes,
      }) as unknown as AgentDraft
      setDraft(normalized)

      const vers = await listAgentVersions(decodedName)

      setVersions(vers ?? [])

      const nextNum = vers?.length ? (vers as AgentVersion[])[0]!.version_number + 1 : 1
      setVersionName(`V${nextNum}`)
      setVersionDesc("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load")
    }
    setLoading(false)
  }, [decodedName])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!publishOpen || !draft) return
    let cancelled = false
    setPublishPhonesLoading(true)
    void (async () => {
      try {
        const list = await getPhoneNumbers()
        const active = list.filter((p) => p.is_active !== false)
        if (cancelled) return
        setPublishModalPhones(active)
        const agentUuid = draft.agent_id
        const inbound = active.find((p) => p.inbound_agent?.id === agentUuid)
        const outbound = active.find((p) => p.outbound_agent?.id === agentUuid)
        setPubInboundOn(!!inbound)
        setPubOutboundOn(!!outbound)
        setPubInboundId(inbound?.id ?? "")
        setPubOutboundId(outbound?.id ?? "")
      } catch (e) {
        if (!cancelled) {
          toast.error(errMessage(e))
          setPublishModalPhones([])
          setPubInboundOn(false)
          setPubOutboundOn(false)
          setPubInboundId("")
          setPubOutboundId("")
        }
      } finally {
        if (!cancelled) setPublishPhonesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publishOpen, draft?.agent_id])

  const patchDraft = useCallback(async (patch: Record<string, unknown>) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, ...patch, has_unpublished_changes: true } as AgentDraft
    })
    try {
      await saveAgentDraft(decodedName, { ...patch, has_unpublished_changes: true })
      toast.success("Draft saved", { id: "draft-patch", duration: 900 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save draft")
      load()
    }
  }, [load, decodedName])

  const initDraftFromLive = async () => {
    try {
      const live = await getLiveAgentForDraft(decodedName)
      const row = apiResponseToDraftRow(live, {
        agent_id: live.id,
        has_unpublished_changes: false,
      })
      await saveAgentDraft(decodedName, row)
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
      const live = await getLiveAgentForDraft(decodedName)
      const row = liveAgentToDraftRow(live, draft.agent_id)
      await saveAgentDraft(decodedName, row)
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
    if (publishPhonesLoading) return

    if (pubInboundOn && !pubInboundId) {
      toast.error("Select an inbound phone number or uncheck Inbound.")
      return
    }
    if (pubOutboundOn && !pubOutboundId) {
      toast.error("Select an outbound phone number or uncheck Outbound.")
      return
    }

    setPublishing(true)
    const issues: string[] = []

    let livePromptBefore: string | undefined
    try {
      livePromptBefore = (await getAgentPrompt(decodedName)).content
    } catch {
      livePromptBefore = undefined
    }

    try {
      await updateAgent(decodedName, publishBody(draft))
    } catch (e) {
      toast.error(errMessage(e))
      setPublishing(false)
      return
    }

    try {
      const promptChanged =
        livePromptBefore === undefined || livePromptBefore !== draft.system_prompt
      if (promptChanged) {
        await updateAgentPrompt(decodedName, draft.system_prompt)
      }
    } catch (e) {
      toast.error(errMessage(e))
      setPublishing(false)
      return
    }

    const agentId = draft.agent_id

    try {
      const list = await getPhoneNumbers()
      const active = list.filter((p) => p.is_active !== false)
      const curInbound = active.find((p) => p.inbound_agent?.id === agentId)?.id ?? null
      const curOutbound = active.find((p) => p.outbound_agent?.id === agentId)?.id ?? null
      const wantInbound = pubInboundOn ? normalizeRoutePhoneId(pubInboundId) : null
      const wantOutbound = pubOutboundOn ? normalizeRoutePhoneId(pubOutboundId) : null

      const putMap = buildPhoneAssignmentPutMap(agentId, curInbound, curOutbound, wantInbound, wantOutbound)

      const phoneErrors: string[] = []
      for (const [phoneId, patch] of putMap) {
        try {
          await updatePhoneNumber(phoneId, patch)
        } catch (e) {
          phoneErrors.push(errMessage(e))
        }
      }
      if (phoneErrors.length > 0) {
        issues.push(`phone number assignment failed: ${phoneErrors[0]}`)
      }
    } catch (e) {
      issues.push(`Could not sync phone numbers: ${errMessage(e)}`)
    }

    const nextNum = versions.length ? Math.max(...versions.map((x) => x.version_number)) + 1 : 1
    const assignments: { number: string; friendly_name: string; direction: string }[] = []
    if (pubInboundOn && pubInboundId) {
      const p = publishModalPhones.find((x) => x.id === pubInboundId)
      if (p) assignments.push({ number: p.number, friendly_name: p.friendly_name, direction: "inbound" })
    }
    if (pubOutboundOn && pubOutboundId) {
      const p = publishModalPhones.find((x) => x.id === pubOutboundId)
      if (p) assignments.push({ number: p.number, friendly_name: p.friendly_name, direction: "outbound" })
    }

    try {
      await publishAgentVersion(decodedName, {
        agent_id: draft.agent_id,
        version_number: nextNum,
        version_name: versionName.trim() || `V${nextNum}`,
        description: versionDesc.trim(),
        config_snapshot: snapshotFromDraft(draft),
        phone_assignments: assignments,
        published_at: new Date().toISOString(),
        published_by: null,
      })
    } catch (e) {
      issues.push(`Version history not saved: ${e instanceof Error ? e.message : "unknown error"}`)
    }

    try {
      await saveAgentDraft(decodedName, { has_unpublished_changes: false })
    } catch (e) {
      issues.push(`Draft not marked published: ${e instanceof Error ? e.message : "unknown error"}`)
    }

    if (issues.length === 0) {
      toast.success(`Version ${versionName.trim() || `V${nextNum}`} published`)
    } else if (issues.length === 1 && issues[0].startsWith("phone number assignment failed:")) {
      toast.warning(`Agent published, but ${issues[0]}`)
    } else {
      toast.warning(`Agent published, but: ${issues.join(" · ")}`)
    }

    setPublishOpen(false)
    await load()
    setPublishing(false)
  }

  const revertVersion = async (v: AgentVersion) => {
    if (!draft) return
    const row = apiResponseToDraftRow(v.config_snapshot, {
      agent_id: draft.agent_id,
      has_unpublished_changes: true,
    })
    try {
      await saveAgentDraft(decodedName, row)
      toast.success(`Draft reverted to V${v.version_number}. Publish to make it live.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed")
    }
  }

  const promptVars = useMemo(() => extractPromptVariables(draft?.system_prompt ?? ""), [draft?.system_prompt])
  const { voice: resolvedVoice, voices: resolvedVoices, loaded: voicesLoaded } = useResolvedVoice(draft?.tts_voice_id ?? "")
  const { playingId: voicePlayingId, toggle: toggleVoicePreview } = useAudioPreview()
  const [addVoiceOpen, setAddVoiceOpen] = useState(false)

  const previewDraft = useMemo(() => {
    if (!previewVersion || !draft) return null
    const snap = previewVersion.config_snapshot as Record<string, unknown>
    const row = apiResponseToDraftRow(snap, {
      agent_id: draft.agent_id,
      has_unpublished_changes: false,
    }) as unknown as AgentDraft
    row.name = draft.name
    row.display_name = typeof snap.display_name === "string" ? snap.display_name : draft.display_name
    return row
  }, [previewVersion, draft])

  if (loading || !voicesLoaded) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
        <div className="surface-card mb-3 shrink-0 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-7 w-56" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,49fr)_minmax(0,24fr)_minmax(0,27fr)]">
          <div className="surface-card flex flex-col gap-3 p-4">
            <div className="flex gap-4">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="min-h-0 flex-1 rounded-lg" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (missingDraft || !draft || !schema) {
    return (
      <div className="space-y-4">
        <div className="surface-card p-8 text-center">
          <p className="text-muted-foreground">No draft row found for this agent.</p>
          <Button className="mt-4" onClick={initDraftFromLive}>
            Initialize draft from live config
          </Button>
        </div>
      </div>
    )
  }

  const activeDraft = previewDraft ?? draft
  const isReadOnly = !!previewVersion
  const nextVersionNum = versions.length ? Math.max(...versions.map((v) => v.version_number)) + 1 : 1

  const fr = schema.field_ranges
  const tempRange = temperatureRange(fr)
  const mtRange = llmMaxTokensRange(fr)
  const speedRange = ttsSpeedRange(fr)
  const voiceTempRange = voiceTemperatureRange(fr)
  const exprRange = expressivenessRange(fr)

  const setF = (patch: Record<string, unknown>) => {
    if (isReadOnly) return
    void patchDraft(patch)
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Top bar — compact surface card */}
      <div className="surface-card mb-3 shrink-0 px-5 py-3">
        {/* Row 1: Name + actions */}
        <div className="flex items-center justify-between gap-4">
          {editingName ? (
            <Input
              ref={nameInputRef}
              className="h-auto max-w-none border-0 border-b border-border bg-transparent px-0 py-0.5 text-xl font-semibold tracking-tight shadow-none focus-visible:ring-0 lg:max-w-3xl"
              value={draft.display_name}
              onChange={(e) => void patchDraft({ display_name: e.target.value })}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false) }}
              aria-label="Display name"
              autoFocus
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{draft.display_name}</h1>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="Edit name"
                onClick={() => {
                  setEditingName(true)
                  setTimeout(() => nameInputRef.current?.focus(), 0)
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={cn(
                "bg-white hover:bg-[var(--color-brand-light)]/60",
                historyOpen && "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
              )}
              title="Version history"
              aria-label="Version history"
              onClick={() => {
                if (historyOpen) {
                  setHistoryOpen(false)
                  setPreviewVersion(null)
                } else {
                  setHistoryOpen(true)
                }
              }}
            >
              <Clock className="size-4" />
            </Button>
            {!isReadOnly && (
              <>
                <span className="relative inline-flex">
                  {draft.has_unpublished_changes && (
                    <span
                      className="absolute -top-1 -right-1 z-10 size-2 rounded-full bg-amber-400 ring-2 ring-[#f4f5f7] shadow-sm"
                      title="Unpublished draft changes"
                      aria-hidden
                    />
                  )}
                  <Button
                    size="sm"
                    disabled={!draft.has_unpublished_changes}
                    className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
                    title={
                      draft.has_unpublished_changes
                        ? "Publish draft — replaces live agent"
                        : "No unpublished changes"
                    }
                    onClick={() => setPublishOpen(true)}
                  >
                    Publish
                  </Button>
                </span>
                {draft.has_unpublished_changes && (
                  <Button type="button" variant="destructive" size="sm" onClick={() => setDiscardOpen(true)}>
                    Discard
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Version preview banner */}
      {previewVersion && (
        <div className="mb-3 flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] px-5 py-2.5">
          <p className="text-sm text-foreground">
            Viewing{" "}
            <span className="font-semibold">V{previewVersion.version_number}</span>
            {" — Published "}
            {formatVersionDate(previewVersion.published_at)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
              onClick={() => {
                const v = previewVersion
                setPreviewVersion(null)
                void revertVersion(v)
              }}
            >
              Restore this version
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewVersion(null)}
            >
              Back to draft
            </Button>
          </div>
        </div>
      )}

      {/* Editor columns — flex layout with CSS-driven transitions */}
      <div
        className="agent-editor-cols min-h-0 flex-1 flex-col gap-3 overflow-hidden max-lg:flex max-lg:flex-col"
        data-history={historyOpen ? "true" : "false"}
      >
        {/* Left column — Prompt editor */}
        <div data-col="prompt" className={cn("flex min-h-0 min-w-0 flex-col", isReadOnly && "pointer-events-none opacity-70")}>
          <Card className={cn(promptCardClassName(), "flex min-h-0 flex-1 flex-col")}>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-3 pb-3">
              <div className="flex shrink-0 items-end gap-4">
                <div className="flex min-w-0 flex-[3] flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">LLM Model</span>
                  <Select value={activeDraft.llm_model} onValueChange={(v) => setF({ llm_model: v ?? "" })}>
                    <SelectTrigger className="h-9 w-full bg-white text-xs hover:bg-[var(--color-brand-light)]/60" aria-label="LLM model">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        {activeDraft.llm_model && <img src="/anthropic-logo.svg" alt="" className="size-3.5 shrink-0" />}
                        <span className="min-w-0 truncate"><SelectValue placeholder="Model" /></span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {schema.llm_models.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-[4] flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Voice</span>
                  <VoicePicker
                    value={activeDraft.tts_voice_id}
                    onChange={(id) => setF({ tts_voice_id: id })}
                    className="w-full border-0 hover:bg-[var(--color-brand-light)]/60"
                    initialVoices={resolvedVoices}
                  />
                </div>
                <div className="flex min-w-0 flex-[3] flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">TTS Model</span>
                  <Select value={activeDraft.tts_model} onValueChange={(v) => setF({ tts_model: v ?? "" })}>
                    <SelectTrigger className="h-9 w-full bg-white text-xs hover:bg-[var(--color-brand-light)]/60" aria-label="Voice model">
                      <SelectValue placeholder="Voice model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(schema.tts_models)
                        ? schema.tts_models
                        : schema.tts_models[activeDraft.tts_provider] ?? []
                      ).map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <PromptEditor
                className="w-full min-w-0 flex-1"
                value={activeDraft.system_prompt}
                onChange={(v) => setF({ system_prompt: v })}
                placeholder="You are a helpful assistant..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Center column — Config */}
        <div
          data-col="config"
          ref={configColumnRef}
          id="agent-config-column"
          className={cn("min-h-0 min-w-0 overflow-y-auto overflow-x-hidden", isReadOnly && "opacity-70")}
        >
          <div className="surface-card divide-y divide-[#e8eaed] overflow-hidden">
          <AgentConfigSection title="LLM">
            <FieldGroup className={cn("gap-5", isReadOnly && "pointer-events-none")}>
              <p className="text-xs text-muted-foreground">
                Provider: <span className="font-medium text-foreground">anthropic</span> · Model selector is in the quick bar.
              </p>
            <SchemaSlider
              label="Temperature"
              helper="Controls response randomness. 0.7 is recommended for most agents."
              value={activeDraft.temperature}
              onChange={(v) => setF({ temperature: v })}
              range={tempRange}
            />
            <SchemaSlider
              label="Max Response Tokens"
              helper="Maximum tokens per response turn. Voice responses should be concise."
              value={activeDraft.max_tokens}
              onChange={(v) => setF({ max_tokens: Math.round(v) })}
              range={mtRange}
            />
            </FieldGroup>
          </AgentConfigSection>

          <AgentConfigSection title="Voice">
            <FieldGroup className={cn("gap-5", isReadOnly && "pointer-events-none")}>
              <p className="text-xs text-muted-foreground">
                Provider: <span className="font-medium text-foreground">elevenlabs</span> · Voice and model selectors are in the quick bar.
              </p>
            <SchemaSlider
              label="Speed"
              helper="How fast the agent speaks. 0.7 (slower) to 1.2 (faster)."
              value={activeDraft.tts_speed}
              onChange={(v) => setF({ tts_speed: v })}
              range={speedRange}
              formatValue={(v) => `${Number(v).toFixed(2)}x`}
            />
            <SchemaSlider
              label="Voice Consistency"
              helper="How predictable the voice sounds."
              helperTooltip="Lower values add natural variation but may introduce artifacts like breathing or pitch shifts. Higher values are cleaner and more professional. Recommended: 0.70–0.85."
              value={activeDraft.tts_stability}
              onChange={(v) => setF({ tts_stability: v })}
              range={voiceTempRange}
            />
            <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-4 py-3">
              <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium">Similarity Boost: <span className="tabular-nums">0.8</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">Global setting — controlled by the pipeline, not per-agent.</p>
              </div>
            </div>
            <SchemaSlider
              label="Style"
              helper="Amplifies vocal expressiveness."
              helperTooltip="0 is neutral. Higher values add personality but may increase latency."
              value={activeDraft.tts_style}
              onChange={(v) => setF({ tts_style: v })}
              range={exprRange}
            />
            <Field
              orientation="horizontal"
              className="items-start gap-3 rounded-lg bg-secondary/60 p-4"
            >
              <Switch
                id="agent-speaker-boost"
                checked={activeDraft.tts_use_speaker_boost}
                onCheckedChange={(c) => setF({ tts_use_speaker_boost: !!c })}
                className="mt-0.5"
              />
              <FieldContent>
                <FieldLabel htmlFor="agent-speaker-boost" className="inline-flex items-center gap-1.5">
                  Voice Clarity Boost
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" className="inline-flex shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground" />}>
                      <Info size={13} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] leading-relaxed">
                      Enhances voice crispness. Turn off for a more natural phone-call sound. Turn on for clearer, more polished enunciation.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
              </FieldContent>
            </Field>
            </FieldGroup>
          </AgentConfigSection>

          <AgentConfigSection title="Tools">
            <FieldGroup className="gap-5">
              <FieldDescription className="text-xs text-muted-foreground">
                What the agent is allowed to do during a call (hang up, dial digits, transfer, etc.).
              </FieldDescription>
            <div className="space-y-4">
              {activeDraft.tools.map((tool, idx) => (
                <AgentToolCard
                  key={idx}
                  tool={tool}
                  readOnly={isReadOnly}
                  onChange={(t) => {
                    const next = [...activeDraft.tools]
                    next[idx] = t
                    setF({ tools: next })
                  }}
                  onRemove={() =>
                    setPendingDelete({
                      type: "tool",
                      index: idx,
                      label: formatAgentToolTypeLabel(activeDraft.tools[idx]!.type),
                    })
                  }
                />
              ))}
              {!isReadOnly && (
                <AddToolMenu
                  schema={schema}
                  existing={activeDraft.tools.map((t) => t.type)}
                  onAdd={(type) => {
                    const desc =
                      (schema.tool_settings_schema as Record<string, { description?: string }>)?.[type]?.description ?? ""
                    setF({
                      tools: [
                        ...activeDraft.tools,
                        { type, description: typeof desc === "string" ? desc : "", settings: {} },
                      ],
                    })
                  }}
                />
              )}
            </div>
            </FieldGroup>
          </AgentConfigSection>

          <AgentConfigSection title="Post-Call Data Extraction">
            <FieldGroup className="gap-3">
              <FieldDescription className="text-xs">
                Define the information to extract from each call.
              </FieldDescription>

              <div className="space-y-2">
                {activeDraft.post_call_analyses.fields.length > 0 && (
                  activeDraft.post_call_analyses.fields.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="rounded-lg bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="flex h-5 shrink-0 items-center text-muted-foreground">
                            {f.type === "selector" ? (
                              <List className="size-4" aria-hidden />
                            ) : (
                              <FileText className="size-4" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-medium leading-5 truncate block">{f.name}</span>
                            {f.description ? (
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {f.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={isReadOnly ? "View" : "Edit"}
                            onClick={() => setEditingField({ index: i, field: { ...f } })}
                          >
                            <Pencil size={14} />
                          </Button>
                          {!isReadOnly && (
                            <DeleteIconButton
                              title="Delete field"
                              onClick={() =>
                                setPendingDelete({
                                  type: "postField",
                                  index: i,
                                  label: f.name || "this field",
                                })
                              }
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!isReadOnly && (
                <div className="flex items-center justify-between gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8">
                        <Plus className="mr-1.5 size-4" aria-hidden />
                        Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={() =>
                          setEditingField({
                            index: null,
                            field: { name: "", type: "text", description: "", format_examples: [] },
                          })
                        }
                      >
                        <FileText className="size-4" aria-hidden />
                        Text
                        <span className="ml-auto text-xs text-muted-foreground">
                          Free-form text output
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setEditingField({
                            index: null,
                            field: { name: "", type: "selector", description: "", choices: [""] },
                          })
                        }
                      >
                        <List className="size-4" aria-hidden />
                        Selector
                        <span className="ml-auto text-xs text-muted-foreground">
                          Choose from predefined options
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              <div className={cn("space-y-1.5 pt-1", isReadOnly && "pointer-events-none")}>
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Select
                  value={activeDraft.post_call_analyses.model}
                  onValueChange={(v) =>
                    setF({ post_call_analyses: { ...activeDraft.post_call_analyses, model: v ?? "" } })
                  }
                >
                  <SelectTrigger className="h-9 w-full">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {activeDraft.post_call_analyses?.model && <img src="/anthropic-logo.svg" alt="" className="size-3.5 shrink-0" />}
                      <span className="min-w-0 truncate"><SelectValue placeholder="Select model" /></span>
                    </span>
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
            </FieldGroup>
          </AgentConfigSection>
          </div>
        </div>

        {/* Right column — Test panel */}
        <div data-col="test" className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", isReadOnly && "pointer-events-none opacity-70")}>
          <TestCallPanel
            agentName={draft.name}
            displayName={draft.display_name}
            isDraft={draft.has_unpublished_changes}
            immediateStart={false}
            promptVariables={promptVars}
            validateBeforeStart={() => {
              const missing: string[] = []
              if (!draft.tts_voice_id?.trim()) missing.push("Voice")
              if (!draft.system_prompt?.trim()) missing.push("System Prompt")
              if (!draft.llm_model?.trim()) missing.push("LLM Model")
              if (missing.length > 0) {
                toast.error(`Configure ${missing.join(", ")} before testing`)
                return false
              }
              return true
            }}
            className="min-h-0 flex-1"
          />
        </div>

        {/* History panel — 4th pillar */}
        <div data-col="history" className="flex min-h-0 min-w-0 flex-col overflow-hidden max-lg:hidden">
          <div className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-6 pb-2 pt-4">
              <h3 className="text-sm font-semibold">History</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { setHistoryOpen(false); setPreviewVersion(null) }}
                aria-label="Close history"
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {versions.length === 0 && !draft.has_unpublished_changes ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">No versions yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Publish to create the first snapshot.
                  </p>
                </div>
              ) : (
                <div className="relative ml-6 border-l border-[#e8eaed]">
                  {/* Draft entry */}
                  {draft.has_unpublished_changes && (
                    <button
                      type="button"
                      className={cn(
                        "relative flex w-full gap-3 py-3 pl-5 pr-4 text-left transition-colors hover:bg-black/[0.02]",
                        !previewVersion && "bg-[var(--color-brand-light)]/40"
                      )}
                      onClick={() => setPreviewVersion(null)}
                    >
                      <div
                        className={cn(
                          "absolute left-[-5px] top-[17px] size-2.5 rounded-full ring-2 ring-[#f4f5f7]",
                          !previewVersion ? "bg-[var(--color-brand)]" : "bg-amber-400"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn("text-sm font-semibold", !previewVersion && "text-[var(--color-brand-dark)]")}>
                            Draft — V{nextVersionNum}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">Current working draft</p>
                      </div>
                    </button>
                  )}

                  {/* Published versions */}
                  {versions.map((v) => {
                    const isActive = previewVersion?.id === v.id
                    const versionLabel = (() => {
                      const raw = v.version_name?.trim() ?? ""
                      return raw && raw !== `V${v.version_number}` ? raw : `V${v.version_number}`
                    })()
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={cn(
                          "relative flex w-full gap-3 py-3 pl-5 pr-4 text-left transition-colors hover:bg-black/[0.02]",
                          isActive && "bg-[var(--color-brand-light)]/40"
                        )}
                        onClick={() => setPreviewVersion(v)}
                      >
                        <div
                          className={cn(
                            "absolute left-[-5px] top-[17px] size-2.5 rounded-full ring-2 ring-[#f4f5f7]",
                            isActive ? "bg-[var(--color-brand)]" : "bg-[#d1d5db]"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={cn("text-sm font-semibold", isActive && "text-[var(--color-brand-dark)]")}>
                              {versionLabel}
                            </span>
                            <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dateTime={v.published_at}>
                              {formatVersionDate(v.published_at)}
                            </time>
                          </div>
                          {v.description?.trim() && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {v.description.trim()}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Publish dialog */}
      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          setPublishOpen(open)
          if (!open) {
            setPublishModalPhones([])
            setPublishPhonesLoading(false)
            setPubInboundOn(false)
            setPubOutboundOn(false)
            setPubInboundId("")
            setPubOutboundId("")
          }
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,720px)] flex-col gap-0 overflow-hidden sm:max-w-lg">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
            <div className="space-y-5 pb-2">
              <DialogHeader className="space-y-3 text-left">
                <DialogTitle className="text-lg font-semibold tracking-tight">Publish version</DialogTitle>
                <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                  Push your draft to live for{" "}
                  <span className="font-medium text-foreground">
                    {draft?.display_name?.trim() || decodedName}
                  </span>{" "}
                  and record a named version in history.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Version details
                </p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Version name</Label>
                    <Input
                      value={versionName}
                      onChange={(e) => setVersionName(e.target.value)}
                      placeholder="V2 — Updated prompt"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea
                      value={versionDesc}
                      onChange={(e) => setVersionDesc(e.target.value)}
                      rows={2}
                      className="min-h-[4.5rem] resize-y"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Phone assignment
                </p>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  Optional. You can publish without assigning numbers.
                </p>
                {publishPhonesLoading ? (
                  <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading phone numbers…
                  </div>
                ) : publishModalPhones.length === 0 ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No phone numbers configured. Add numbers on the{" "}
                    <Link href="/phone-numbers" className="font-medium text-primary underline underline-offset-4">
                      Phone Numbers
                    </Link>{" "}
                    page.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={pubInboundOn}
                        onCheckedChange={(c) => {
                          const on = !!c
                          setPubInboundOn(on)
                          if (!on) setPubInboundId("")
                        }}
                        id="pub-in"
                      />
                      <Label htmlFor="pub-in">Inbound phone number</Label>
                    </div>
                    {pubInboundOn && (
                      <Select
                        value={pubInboundId || "__none__"}
                        onValueChange={(v) => setPubInboundId((v ?? "") === "__none__" ? "" : (v ?? ""))}
                      >
                        <SelectTrigger className="h-9 border border-black/[0.06] bg-background shadow-none hover:bg-background">
                          <SelectValue placeholder="Select number" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select…</SelectItem>
                          {publishModalPhones.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {formatPhoneNumberLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={pubOutboundOn}
                        onCheckedChange={(c) => {
                          const on = !!c
                          setPubOutboundOn(on)
                          if (!on) setPubOutboundId("")
                        }}
                        id="pub-out"
                      />
                      <Label htmlFor="pub-out">Outbound phone number</Label>
                    </div>
                    {pubOutboundOn && (
                      <Select
                        value={pubOutboundId || "__none__"}
                        onValueChange={(v) => setPubOutboundId((v ?? "") === "__none__" ? "" : (v ?? ""))}
                      >
                        <SelectTrigger className="h-9 border border-black/[0.06] bg-background shadow-none hover:bg-background">
                          <SelectValue placeholder="Select number" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select…</SelectItem>
                          {publishModalPhones.map((p) => (
                            <SelectItem key={`o-${p.id}`} value={p.id}>
                              {formatPhoneNumberLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex shrink-0 gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setPublishOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 basis-0 justify-center font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
              onClick={() => void handlePublish()}
              disabled={publishing || publishPhonesLoading}
            >
              {publishing ? <Loader2 className="animate-spin" size={16} /> : "Publish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="gap-0 overflow-hidden sm:max-w-[440px]">
          <div className="space-y-4 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">Discard draft?</DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                This resets the draft for{" "}
                <span className="font-medium text-foreground">
                  {draft?.display_name?.trim() || decodedName}
                </span>{" "}
                to match the last published live configuration. Unpublished edits will be lost.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-3.5">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                What happens next
              </p>
              <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-foreground/75 marker:text-muted-foreground/60">
                <li>Prompt, voice, tools, and all draft fields revert to the live agent</li>
                <li>Changes you have not published are removed from this draft</li>
                <li className="font-medium text-foreground/90">This cannot be undone</li>
              </ul>
            </div>
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setDiscardOpen(false)}
              disabled={discarding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 basis-0 justify-center font-medium"
              onClick={() => void handleDiscard()}
              disabled={discarding}
            >
              {discarding ? <Loader2 className="animate-spin" size={16} /> : "Discard draft"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={
          pendingDelete?.type === "tool"
            ? "Remove tool?"
            : pendingDelete?.type === "postField"
              ? "Delete field?"
              : "Are you sure?"
        }
        description={
          pendingDelete?.type === "tool" ? (
            <>
              Remove <span className="font-medium text-foreground">{pendingDelete.label}</span> from this agent
              draft?
            </>
          ) : pendingDelete?.type === "postField" ? (
            <>
              Delete post-call field{" "}
              <span className="font-medium text-foreground">{pendingDelete.label}</span>? This only updates your
              draft until you publish.
            </>
          ) : null
        }
        bullets={
          pendingDelete
            ? [
                "The change applies to this draft only until you publish.",
                "You can use Discard draft to revert all unpublished edits at once.",
              ]
            : undefined
        }
        confirmLabel={pendingDelete?.type === "tool" ? "Remove" : "Delete"}
        onConfirm={() => {
          if (!pendingDelete || !draft) return
          if (pendingDelete.type === "tool") {
            setF({ tools: activeDraft.tools.filter((_, j) => j !== pendingDelete.index) })
          } else {
            setF({
              post_call_analyses: {
                ...activeDraft.post_call_analyses,
                fields: activeDraft.post_call_analyses.fields.filter((_, j) => j !== pendingDelete.index),
              },
            })
          }
          setPendingDelete(null)
        }}
      />

      <PostCallFieldEditor
        open={!!editingField}
        field={editingField?.field ?? null}
        readOnly={isReadOnly}
        onCancel={() => setEditingField(null)}
        onSave={(field) => {
          const fields = activeDraft.post_call_analyses.fields
          const next = [...fields]
          if (editingField?.index == null) next.push(field)
          else next[editingField.index] = field
          setF({ post_call_analyses: { ...activeDraft.post_call_analyses, fields: next } })
          setEditingField(null)
        }}
      />
    </div>
  )
}
