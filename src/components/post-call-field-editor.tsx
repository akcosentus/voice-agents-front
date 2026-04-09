"use client"

import * as React from "react"

import type { PostCallField } from "@/lib/types"
import { DeleteIconButton } from "@/components/delete-icon-button"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface PostCallFieldEditorProps {
  open: boolean
  field: PostCallField | null
  readOnly?: boolean
  onSave: (field: PostCallField) => void
  onCancel: () => void
}

function cleanList(values: string[]) {
  return values.map((v) => v.trim()).filter(Boolean)
}

export function PostCallFieldEditor({ open, field, readOnly, onSave, onCancel }: PostCallFieldEditorProps) {
  const [draft, setDraft] = React.useState<PostCallField | null>(field)
  const nameRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    setDraft(field)
  }, [field])

  React.useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => nameRef.current?.focus(), 20)
    return () => window.clearTimeout(t)
  }, [open])

  const typeLabel = draft?.type === "selector" ? "Selector" : "Text"
  const listLabel = draft?.type === "selector" ? "Choices" : "Format examples"

  const listValues = React.useMemo(() => {
    if (!draft) return []
    return draft.type === "selector" ? draft.choices ?? [] : draft.format_examples ?? []
  }, [draft])

  function setListValues(next: string[]) {
    setDraft((d) => {
      if (!d) return d
      if (d.type === "selector") return { ...d, choices: next }
      return { ...d, format_examples: next }
    })
  }

  function validateAndSave() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return

    if (draft.type === "selector") {
      const choices = cleanList(draft.choices ?? [])
      if (choices.length === 0) return
      onSave({
        ...draft,
        name,
        description: draft.description.trim(),
        choices,
      })
      return
    }

    onSave({
      ...draft,
      name,
      description: draft.description.trim(),
      format_examples: cleanList(draft.format_examples ?? []),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="flex max-h-[min(90dvh,640px)] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          <div className="space-y-5 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {typeLabel} field
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                {draft?.type === "selector"
                  ? "Extract a value by choosing one of the options you define. Callers’ speech is matched to the closest choice."
                  : "Extract free-form text from the call. Add optional examples to steer format and tone."}
              </DialogDescription>
            </DialogHeader>

            {!draft ? null : (
              <div className={readOnly ? "pointer-events-none" : undefined}>
                <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Field details
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="postcall-field-name">Name</Label>
                      <Input
                        id="postcall-field-name"
                        ref={nameRef}
                        value={draft.name}
                        onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                        placeholder="call_summary"
                        className="h-9 border border-black/[0.06] bg-background shadow-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="postcall-field-desc">Description</Label>
                      <Textarea
                        id="postcall-field-desc"
                        value={draft.description}
                        onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                        placeholder="What should the AI extract?"
                        className="min-h-[90px] resize-y border border-black/[0.06] bg-background shadow-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {listLabel}
                    </p>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setListValues([...(listValues ?? []), ""])}
                      >
                        + Add
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {(listValues ?? []).length === 0 ? (
                      <div className="text-sm leading-relaxed text-muted-foreground">
                        {draft.type === "selector"
                          ? "Add at least one choice."
                          : "Optional — examples help guide the output format."}
                      </div>
                    ) : null}

                    {(listValues ?? []).map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={v}
                          onChange={(e) => {
                            const next = [...listValues]
                            next[i] = e.target.value
                            setListValues(next)
                          }}
                          placeholder={draft.type === "selector" ? "choice" : "Example output"}
                          className={cn(
                            "h-9 border border-black/[0.06] bg-background shadow-none",
                            draft.type === "selector" ? "font-mono" : ""
                          )}
                        />
                        {!readOnly && (
                          <DeleteIconButton
                            className="shrink-0"
                            title="Remove row"
                            onClick={() => {
                              const next = [...listValues]
                              next.splice(i, 1)
                              setListValues(next)
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="-mx-6 -mb-6 mt-2 flex shrink-0 gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
          {readOnly ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={onCancel}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="flex-1 basis-0 justify-center"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 basis-0 justify-center font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
                onClick={validateAndSave}
              >
                Save field
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
