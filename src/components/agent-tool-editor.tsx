"use client"

import type { AgentSchema, AgentTool } from "@/lib/types"
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
import { Plus, Trash2 } from "lucide-react"

export function AgentToolCard({
  tool,
  onChange,
  onRemove,
}: {
  tool: AgentTool
  onChange: (t: AgentTool) => void
  onRemove: () => void
}) {
  const label = tool.type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  const targets = (tool.settings.targets as Record<string, string> | undefined) ?? {}

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 size={16} className="text-destructive" />
        </Button>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Textarea rows={2} value={tool.description} onChange={(e) => onChange({ ...tool, description: e.target.value })} />
      </div>
      {tool.type === "transfer_call" && (
        <TransferTargetsBlock tool={tool} targets={targets} onChange={onChange} />
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
  const entries = Object.entries(targets)
  return (
    <div className="mt-3 space-y-2">
      <Label className="text-xs">Transfer targets</Label>
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">No targets yet.</p>
      )}
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder="Name"
            value={k}
            onChange={(e) => {
              const next = { ...targets }
              delete next[k]
              next[e.target.value] = v
              onChange({ ...tool, settings: { ...tool.settings, targets: next } })
            }}
          />
          <Input
            placeholder="+1..."
            className="font-mono"
            value={v}
            onChange={(e) => {
              onChange({
                ...tool,
                settings: { ...tool.settings, targets: { ...targets, [k]: e.target.value } },
              })
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              const next = { ...targets }
              delete next[k]
              onChange({ ...tool, settings: { ...tool.settings, targets: next } })
            }}
          >
            <Trash2 size={14} />
          </Button>
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
