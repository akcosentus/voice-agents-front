"use client"

import { useEffect, useId, useState } from "react"

import type { AgentSchema, AgentTool } from "@/lib/types"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { DeleteIconButton } from "@/components/delete-icon-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pencil, Plus, Trash2 } from "lucide-react"

export function formatAgentToolTypeLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function AgentToolCard({
  tool,
  readOnly,
  onChange,
  onRemove,
}: {
  tool: AgentTool
  readOnly?: boolean
  onChange: (t: AgentTool) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AgentTool>(tool)
  const descFieldId = useId()

  useEffect(() => {
    if (!editing) setDraft(tool)
  }, [tool, editing])

  const label = formatAgentToolTypeLabel(tool.type)
  const viewTargets = (tool.settings.targets as Record<string, string> | undefined) ?? {}
  const draftTargets = (draft.settings.targets as Record<string, string> | undefined) ?? {}

  const startEdit = () => {
    setDraft(tool)
    setEditing(true)
  }

  const saveEdit = () => {
    onChange(draft)
    setEditing(false)
  }

  const cancelEdit = () => {
    setDraft(tool)
    setEditing(false)
  }

  return (
    <div className="rounded-lg border border-black/[0.08] bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            readOnly ? (
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={cancelEdit}>
                Close
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-[var(--color-brand)] px-3 text-white hover:bg-[var(--color-brand-dark)]"
                  onClick={saveEdit}
                >
                  Save
                </Button>
              </>
            )
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={readOnly ? "View tool" : "Edit tool"}
                title={readOnly ? "View" : "Edit"}
                onClick={startEdit}
              >
                <Pencil size={14} aria-hidden />
              </Button>
              {!readOnly && (
                <DeleteIconButton title="Remove tool" onClick={onRemove}>
                  <Trash2 size={16} className="shrink-0" />
                </DeleteIconButton>
              )}
            </>
          )}
        </div>
      </div>

      {!editing ? (
        <>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <div
              className="min-h-[2.75rem] rounded-lg border border-black/[0.06] bg-muted/25 px-3 py-2.5 text-sm leading-relaxed text-foreground"
              aria-readonly
            >
              {tool.description.trim() ? (
                tool.description
              ) : (
                <span className="italic text-muted-foreground">No description — click Edit to add one.</span>
              )}
            </div>
          </div>
          {tool.type === "transfer_call" && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Transfer targets
              </p>
              {Object.keys(viewTargets).length === 0 ? (
                <p className="text-sm italic text-muted-foreground">None — click Edit to add destinations.</p>
              ) : (
                <ul className="space-y-1.5 rounded-lg border border-black/[0.06] bg-muted/20 px-3 py-2">
                  {Object.entries(viewTargets).map(([k, v]) => (
                    <li key={k} className="text-sm">
                      <span className="font-medium text-foreground">{k}</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-mono text-xs text-foreground/90">{v || "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className={readOnly ? "pointer-events-none" : undefined}>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor={descFieldId}>
              Description
            </Label>
            <Textarea
              id={descFieldId}
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What this tool does and when the agent should use it"
              className="min-h-[4.5rem] resize-y border border-black/[0.06] bg-muted/25 px-3 py-2.5 shadow-none ring-0 ring-offset-0 focus-visible:border-black/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          {draft.type === "transfer_call" && (
            <TransferTargetsBlock tool={draft} targets={draftTargets} onChange={setDraft} />
          )}
        </div>
      )}
    </div>
  )
}

function TransferTargetsBlock({
  tool,
  targets,
  onChange,
}: {
  tool: AgentTool
  targets: Record<string, string>
  onChange: (t: AgentTool) => void
}) {
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null)
  const entries = Object.entries(targets)
  return (
    <div className="mt-3 space-y-2">
      <Label className="text-xs">Transfer targets</Label>
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">No targets yet.</p>
      )}
      {entries.map(([k, v], i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-black/[0.08] bg-white/80 p-2">
          <div className="flex items-center justify-between gap-2">
            <Input
              placeholder="Name"
              value={k}
              className="h-8 text-sm"
              onChange={(e) => {
                const next = { ...targets }
                delete next[k]
                next[e.target.value] = v
                onChange({ ...tool, settings: { ...tool.settings, targets: next } })
              }}
            />
            <DeleteIconButton title="Remove target" className="shrink-0" onClick={() => setPendingRemoveKey(k)} />
          </div>
          <Input
            placeholder="+1..."
            className="h-8 font-mono text-sm"
            value={v}
            onChange={(e) => {
              onChange({
                ...tool,
                settings: { ...tool.settings, targets: { ...targets, [k]: e.target.value } },
              })
            }}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({
            ...tool,
            settings: {
              ...tool.settings,
              targets: { ...targets, [`target_${entries.length + 1}`]: "" },
            },
          })
        }
      >
        <Plus size={14} className="mr-1" /> Add target
      </Button>

      <ConfirmDeleteDialog
        open={pendingRemoveKey !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRemoveKey(null)
        }}
        title="Remove transfer target?"
        description={
          pendingRemoveKey ? (
            <>
              Remove <span className="font-medium text-foreground">{pendingRemoveKey}</span> from this tool’s
              transfer list?
            </>
          ) : (
            ""
          )
        }
        bullets={[
          "The destination is removed from this draft only.",
          "Publish your draft to update the live agent.",
        ]}
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemoveKey == null) return
          const key = pendingRemoveKey
          const next = { ...targets }
          delete next[key]
          onChange({ ...tool, settings: { ...tool.settings, targets: next } })
          setPendingRemoveKey(null)
        }}
      />
    </div>
  )
}

export function AddToolMenu({
  schema,
  existing,
  onAdd,
}: {
  schema: AgentSchema
  existing: string[]
  onAdd: (type: string) => void
}) {
  const available = schema.tool_types.filter((t) => !existing.includes(t))
  if (available.length === 0) return null
  return (
    <Select
      value=""
      onValueChange={(v) => {
        if (v) onAdd(v)
      }}
    >
      <SelectTrigger className="max-w-xs">
        <Plus size={14} className="mr-1" />
        <SelectValue placeholder="Add tool" />
      </SelectTrigger>
      <SelectContent>
        {available.map((t) => (
          <SelectItem key={t} value={t}>
            {t.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
