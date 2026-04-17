"use client"

import { useCallback, useRef } from "react"
import { cn } from "@/lib/utils"

const VAR_SPLIT = /(\{\{\s*[^}]+?\s*\}\})/g

function isVar(s: string) {
  return s.startsWith("{{") && s.endsWith("}}")
}

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** When true, prompt is not editable but still scrollable (e.g. version preview). */
  readOnly?: boolean
}

export function PromptEditor({ value, onChange, placeholder, className, readOnly }: PromptEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  const syncScroll = useCallback(() => {
    if (taRef.current && bgRef.current) {
      bgRef.current.scrollTop = taRef.current.scrollTop
    }
  }, [])

  const font = "whitespace-pre-wrap break-words font-[JetBrains_Mono,monospace] text-sm leading-relaxed"

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-white", className)}>
      {/* Backdrop — renders styled text behind the transparent textarea */}
      <div
        ref={bgRef}
        aria-hidden
        className={cn(font, "pointer-events-none absolute inset-0 overflow-hidden px-3 py-3 text-foreground/90")}
      >
        {value.split(VAR_SPLIT).map((part, i) =>
          isVar(part) ? (
            <span
              key={i}
              className="text-foreground"
              style={{
                background: "#eceef1",
                borderRadius: "4px",
                boxShadow: "0 0 0 1.5px #eceef1",
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
              }}
            >
              {part}
            </span>
          ) : (
            part
          )
        )}
        {"\n"}
      </div>

      {/* Textarea — invisible text, visible caret */}
      <textarea
        ref={taRef}
        readOnly={readOnly}
        className={cn(
          font,
          "relative h-full w-full resize-none overflow-y-auto bg-transparent px-3 py-3 text-transparent outline-none placeholder:text-muted-foreground",
          readOnly ? "cursor-default caret-transparent" : "caret-foreground"
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  )
}
