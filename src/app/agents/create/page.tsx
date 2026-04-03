"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createAgent, getAgentSchema } from "@/lib/api"
import { supabase } from "@/lib/supabase"
import type { Agent, AgentSchema } from "@/lib/types"
import { agentDefaultsFromSchema, suggestAgentName } from "@/lib/agent-form-defaults"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, Trash2, X } from "lucide-react"
import { AgentToolCard, AddToolMenu } from "@/components/agent-tool-editor"
import { apiResponseToDraftRow, extractPromptVariables } from "@/lib/agent-draft"

type FormState = Omit<Agent, "id" | "name" | "created_at" | "updated_at">

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

function SliderField({
  label,
  value,
  onChange,
  range,
  formatDisplay,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  range?: { min: number; max: number; step: number }
  formatDisplay?: (v: number) => string
}) {
  const min = range?.min ?? 0
  const max = range?.max ?? 100
  const step = range?.step ?? 1
  const show = formatDisplay ? formatDisplay(value) : (step < 1 ? value.toFixed(1) : String(Math.round(value)))
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">{show}</span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0]! : v)} min={min} max={max} step={step} />
    </div>
  )
}

export default function CreateAgentPage() {
  const router = useRouter()
  const [schema, setSchema] = useState<AgentSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [topErrors, setTopErrors] = useState<string[]>([])
  const [manualName, setManualName] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [kwInput, setKwInput] = useState("")

  useEffect(() => {
    getAgentSchema()
      .then((s) => {
        setSchema(s)
        setForm(agentDefaultsFromSchema(s) as FormState)
      })
      .catch(() => toast.error("Failed to load schema"))
      .finally(() => setLoading(false))
  }, [])

  const suggestedName = useMemo(() => suggestAgentName(form?.display_name ?? ""), [form?.display_name])
  const effectiveName = (nameTouched ? manualName : suggestedName).trim()

  const setF = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: val } : prev))
  }

  const promptVars = useMemo(
    () => extractPromptVariables(form?.system_prompt ?? ""),
    [form?.system_prompt]
  )

  const handleCreate = async () => {
    if (!form || !schema) return
    setTopErrors([])
    if (!form.display_name.trim()) {
      setTopErrors(["Display name is required"])
      return
    }
    if (!effectiveName) {
      setTopErrors(["Agent name is required (check display name or enter name manually)"])
      return
    }

    setSubmitting(true)
    try {
      const ttsModels = schema.tts_models[form.tts_provider] ?? []
      const payload: Record<string, unknown> = {
        ...form,
        name: effectiveName,
        tts_model: form.tts_model || ttsModels[0] || "",
      }
      const created = await createAgent(payload)

      const draftRow = apiResponseToDraftRow(created, {
        agent_id: created.id,
        has_unpublished_changes: false,
      })
      const { error: insErr } = await supabase.from("agent_drafts").insert(draftRow)
      if (insErr) {
        toast.error(`Agent created but draft row failed: ${insErr.message}`)
      } else {
        toast.success("Agent created")
      }
      router.push(`/agents/${encodeURIComponent(created.name)}`)
    } catch (e) {
      setTopErrors([e instanceof Error ? e.message : String(e)])
    }
    setSubmitting(false)
  }

  if (loading || !form || !schema) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  const fr = schema.field_ranges

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} />
          Agents
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure a new voice agent. Defaults come from the schema.</p>
      </div>

      {topErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ul className="list-inside list-disc">
            {topErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Display name *</Label>
            <Input value={form.display_name} onChange={(e) => setF("display_name", e.target.value)} placeholder="Chris — Claim Status" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setF("description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Agent name *</Label>
            <p className="text-xs text-muted-foreground">
              Suggested: <button type="button" className="font-mono text-foreground underline" onClick={() => { setManualName(suggestedName); setNameTouched(true) }}>{suggestedName || "—"}</button>
            </p>
            <Input
              value={nameTouched ? manualName : suggestedName}
              onChange={(e) => { setNameTouched(true); setManualName(e.target.value) }}
              onFocus={() => { if (!nameTouched) setManualName(suggestedName); setNameTouched(true) }}
              className="font-mono text-sm"
              placeholder="category/agent_name"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Language model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Model</Label>
              <Select value={form.llm_model} onValueChange={(v) => setF("llm_model", v ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {schema.llm_models.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.enable_prompt_caching} onCheckedChange={(v) => setF("enable_prompt_caching", !!v)} />
              <Label>Prompt caching</Label>
            </div>
          </div>
          {fr.temperature && (
            <SliderField label="Temperature" value={form.temperature} onChange={(v) => setF("temperature", v)} range={fr.temperature} />
          )}
          {fr.max_tokens && (
            <SliderField label="Max tokens" value={form.max_tokens} onChange={(v) => setF("max_tokens", Math.round(v))} range={fr.max_tokens} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Text-to-speech</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Readonly label="Provider" value={form.tts_provider} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Voice ID</Label>
              <Input className="font-mono text-xs" value={form.tts_voice_id} onChange={(e) => setF("tts_voice_id", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Model</Label>
              <Select value={form.tts_model} onValueChange={(v) => setF("tts_model", v ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(schema.tts_models[form.tts_provider] ?? []).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {fr.tts_stability && <SliderField label="Stability" value={form.tts_stability} onChange={(v) => setF("tts_stability", v)} range={fr.tts_stability} />}
            {fr.tts_similarity_boost && <SliderField label="Similarity boost" value={form.tts_similarity_boost} onChange={(v) => setF("tts_similarity_boost", v)} range={fr.tts_similarity_boost} />}
            {fr.tts_style && <SliderField label="Style" value={form.tts_style} onChange={(v) => setF("tts_style", v)} range={fr.tts_style} />}
            {fr.tts_speed && <SliderField label="Speed" value={form.tts_speed} onChange={(v) => setF("tts_speed", v)} range={fr.tts_speed} />}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.tts_use_speaker_boost} onCheckedChange={(v) => setF("tts_use_speaker_boost", !!v)} />
            <Label>Speaker boost</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Speech-to-text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Readonly label="Provider" value={form.stt_provider} />
          <div className="space-y-1">
            <Label>Language</Label>
            <Select value={form.stt_language} onValueChange={(v) => setF("stt_language", v ?? "")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {schema.stt_languages.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Keywords</Label>
            <div className="flex flex-wrap gap-1.5">
              {form.stt_keywords.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1 pr-1">
                  {k}
                  <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => setF("stt_keywords", form.stt_keywords.filter((x) => x !== k))}>
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder="Type keyword, press Enter"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const t = kwInput.trim()
                  if (t && !form.stt_keywords.includes(t)) setF("stt_keywords", [...form.stt_keywords, t])
                  setKwInput("")
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.tools.map((tool, idx) => (
            <AgentToolCard
              key={idx}
              tool={tool}
              onChange={(t) => {
                const next = [...form.tools]
                next[idx] = t
                setF("tools", next)
              }}
              onRemove={() => setF("tools", form.tools.filter((_, i) => i !== idx))}
            />
          ))}
          <AddToolMenu
            schema={schema}
            existing={form.tools.map((t) => t.type)}
            onAdd={(type) => {
              const desc = (schema.tool_settings_schema as Record<string, { description?: string }>)?.[type]?.description ?? ""
              setF("tools", [...form.tools, { type, description: typeof desc === "string" ? desc : "", settings: {} }])
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {promptVars.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {promptVars.map((v) => (
                <Badge key={v} variant="outline" className="font-mono text-xs">{`{{${v}}}`}</Badge>
              ))}
            </div>
          )}
          <Textarea className="min-h-[280px] font-mono text-xs" value={form.system_prompt} onChange={(e) => setF("system_prompt", e.target.value)} />
          <div className="space-y-1">
            <Label>First message</Label>
            <Textarea value={form.first_message} onChange={(e) => setF("first_message", e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fr.idle_timeout_secs && (
            <SliderField
              label="Idle timeout"
              value={form.idle_timeout_secs}
              onChange={(v) => setF("idle_timeout_secs", Math.round(v))}
              range={fr.idle_timeout_secs}
              formatDisplay={(v) => `${v} seconds`}
            />
          )}
          <div className="space-y-1">
            <Label>Idle message</Label>
            <Input value={form.idle_message} onChange={(e) => setF("idle_message", e.target.value)} />
          </div>
          {fr.max_call_duration_secs && (
            <SliderField
              label="Max call duration"
              value={form.max_call_duration_secs}
              onChange={(v) => setF("max_call_duration_secs", Math.round(v))}
              range={fr.max_call_duration_secs}
              formatDisplay={(v) => `${Math.round(v / 60)} minutes`}
            />
          )}
          <div className="space-y-1">
            <Label>Voicemail</Label>
            <Select value={form.voicemail_action} onValueChange={(v) => setF("voicemail_action", v ?? "")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {schema.voicemail_actions.map((a) => (
                  <SelectItem key={a} value={a}>{formatVoicemailLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.voicemail_action === "leave_message" && (
            <div className="space-y-1">
              <Label>Voicemail message</Label>
              <Textarea value={form.voicemail_message} onChange={(e) => setF("voicemail_message", e.target.value)} rows={3} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Post-call analyses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {form.post_call_analyses.map((row, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="min-w-[120px] flex-1 space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={row.name} onChange={(e) => {
                    const n = [...form.post_call_analyses]
                    n[i] = { ...n[i]!, name: e.target.value }
                    setF("post_call_analyses", n)
                  }} />
                </div>
                <div className="min-w-[140px] flex-1 space-y-1">
                  <Label className="text-xs">Model</Label>
                  <Select value={row.model} onValueChange={(v) => {
                    const n = [...form.post_call_analyses]
                    n[i] = { ...n[i]!, model: v ?? "" }
                    setF("post_call_analyses", n)
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {schema.llm_models.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[100px] flex-1 space-y-1">
                  <Label className="text-xs">Output type</Label>
                  <Input value={row.output_type} onChange={(e) => {
                    const n = [...form.post_call_analyses]
                    n[i] = { ...n[i]!, output_type: e.target.value }
                    setF("post_call_analyses", n)
                  }} />
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setF("post_call_analyses", form.post_call_analyses.filter((_, j) => j !== i))}>
                  <Trash2 size={16} className="text-destructive" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setF("post_call_analyses", [...form.post_call_analyses, { name: "new_analysis", model: schema.llm_models[0] ?? "", output_type: "text" }])}>
              <Plus size={14} className="mr-1" /> Add analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recording</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch checked={form.recording_enabled} onCheckedChange={(v) => setF("recording_enabled", !!v)} />
            <Label>Enabled</Label>
          </div>
          <Readonly label="Channels" value={String(form.recording_channels)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fr.default_concurrency && (
            <SliderField label="Default concurrency" value={form.default_concurrency} onChange={(v) => setF("default_concurrency", Math.round(v))} range={fr.default_concurrency} />
          )}
          {fr.max_retries && (
            <SliderField label="Max retries" value={form.max_retries} onChange={(v) => setF("max_retries", Math.round(v))} range={fr.max_retries} />
          )}
          {fr.retry_delay_secs && (
            <SliderField
              label="Retry delay"
              value={form.retry_delay_secs}
              onChange={(v) => setF("retry_delay_secs", Math.round(v))}
              range={fr.retry_delay_secs}
              formatDisplay={(v) => `${Math.round(v / 60)} minutes`}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Calling window start</Label>
              <Input type="time" value={form.calling_window_start} onChange={(e) => setF("calling_window_start", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Calling window end</Label>
              <Input type="time" value={form.calling_window_end} onChange={(e) => setF("calling_window_end", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Calling days</Label>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d) => (
                <label key={d.v} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.calling_window_days.includes(d.v)}
                    onCheckedChange={(c) => {
                      if (c) setF("calling_window_days", [...form.calling_window_days, d.v])
                      else setF("calling_window_days", form.calling_window_days.filter((x) => x !== d.v))
                    }}
                  />
                  {d.l}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end gap-2">
        <Link
          href="/agents"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </Link>
        <Button
          disabled={submitting}
          onClick={handleCreate}
          className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
        >
          {submitting ? <Loader2 className="animate-spin" size={16} /> : "Create Agent"}
        </Button>
      </div>
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
