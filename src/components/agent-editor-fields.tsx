"use client"

import { ChevronRight, Info } from "lucide-react"
import { FieldDescription } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { AgentSchema } from "@/lib/types"

/** Muted helper under labels (shadcn FieldDescription) */
export function FieldHelper({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <FieldDescription className={cn("mt-1.5 text-xs leading-relaxed", className)}>{children}</FieldDescription>
  )
}

/** Collapsible panel for advanced settings */
export function CollapsibleSettings({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg bg-white/60">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted/50",
          "focus-visible:ring-2 focus-visible:ring-ring/50"
        )}
      >
        <ChevronRight
          className="size-4 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-90"
          aria-hidden
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-5 px-3 py-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SliderRange = { min: number; max: number; step: number }

/**
 * Slider with live value readout to the right of the track.
 */
export function SchemaSlider({
  label,
  helper,
  helperTooltip,
  value,
  onChange,
  range,
  formatValue,
}: {
  label: string
  helper?: string
  helperTooltip?: string
  value: number
  onChange: (v: number) => void
  range: SliderRange
  formatValue?: (v: number) => string
  minLabel?: string
  maxLabel?: string
}) {
  const safe = Number.isFinite(value) ? value : range.min
  const decimals = range.step < 0.01 ? 3 : range.step < 0.1 ? 2 : range.step < 1 ? 1 : 0
  const fmt =
    formatValue ?? ((v: number) => v.toFixed(decimals))

  return (
    <div className="space-y-2.5">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {helper ? (
          <FieldDescription className="mt-1 flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
            {helper}
            {helperTooltip && (
              <Tooltip>
                <TooltipTrigger render={<button type="button" className="inline-flex shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground" />}>
                  <Info size={13} />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] leading-relaxed">
                  {helperTooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </FieldDescription>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Slider
          className="flex-1 py-1"
          value={[safe]}
          min={range.min}
          max={range.max}
          step={range.step}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0]! : v)}
        />
        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-foreground">{fmt(safe)}</span>
      </div>
    </div>
  )
}

function requireFieldRange(fr: AgentSchema["field_ranges"], key: string): SliderRange {
  const r = fr[key]
  if (!r || typeof r.min !== "number" || typeof r.max !== "number" || typeof r.step !== "number") {
    throw new Error(`agent-schema: missing or invalid field_ranges.${key}`)
  }
  return { min: r.min, max: r.max, step: r.step }
}

export function llmMaxTokensRange(fieldRanges: AgentSchema["field_ranges"]): SliderRange {
  return requireFieldRange(fieldRanges, "max_tokens")
}

export function temperatureRange(fieldRanges: AgentSchema["field_ranges"]): SliderRange {
  return requireFieldRange(fieldRanges, "temperature")
}

export function ttsSpeedRange(fieldRanges: AgentSchema["field_ranges"]): SliderRange {
  return requireFieldRange(fieldRanges, "tts_speed")
}

export function voiceTemperatureRange(fieldRanges: AgentSchema["field_ranges"]): SliderRange {
  return requireFieldRange(fieldRanges, "tts_stability")
}

export function expressivenessRange(fieldRanges: AgentSchema["field_ranges"]): SliderRange {
  return requireFieldRange(fieldRanges, "tts_style")
}

export function promptCardClassName() {
  return ""
}
