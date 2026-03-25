"use client"

import type { TranscriptTurn } from "@/lib/types"
import { cn, formatTime } from "@/lib/utils"

interface TranscriptViewerProps {
  transcript: TranscriptTurn[]
}

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No transcript available</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4"
      style={{ maxHeight: "500px" }}
    >
      {transcript.map((turn, i) => (
        <div
          key={i}
          className={cn(
            "flex",
            turn.role === "assistant" ? "justify-end" : "justify-start"
          )}
        >
          <div
            className={cn(
              "max-w-[80%] rounded-xl px-4 py-2.5",
              turn.role === "assistant"
                ? "bg-[var(--color-brand)] text-white rounded-br-sm"
                : "bg-white border border-border text-foreground rounded-bl-sm"
            )}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.content}</p>
            {turn.timestamp && (
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  turn.role === "assistant"
                    ? "text-white/70"
                    : "text-muted-foreground"
                )}
              >
                {formatTime(turn.timestamp)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
