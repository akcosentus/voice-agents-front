"use client"

import { useState } from "react"
import { lookupVoice, addVoice } from "@/lib/api"
import type { Voice } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Loader2, Pause, Play, Search } from "lucide-react"
import { useAudioPreview } from "@/hooks/use-audio-preview"

function voiceLabels(v: Voice): string[] {
  return [v.gender, v.accent, v.age, v.category].filter((l): l is string => !!l?.trim())
}

export function AddVoiceModal({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (voice: Voice) => void
}) {
  const [pastedId, setPastedId] = useState("")
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [found, setFound] = useState<Voice | null>(null)
  const [customName, setCustomName] = useState("")
  const [adding, setAdding] = useState(false)
  const { playingId, toggle } = useAudioPreview()

  const reset = () => {
    setPastedId("")
    setLooking(false)
    setLookupError(null)
    setFound(null)
    setCustomName("")
    setAdding(false)
  }

  const handleLookup = async () => {
    const id = pastedId.trim()
    if (!id) return
    setLookupError(null)
    setFound(null)
    setLooking(true)
    try {
      const v = await lookupVoice(id)
      setFound(v)
      setCustomName(v.custom_name || v.name || "")
    } catch (e) {
      setLookupError(
        e instanceof Error && e.message.includes("not found")
          ? "Voice ID not found on ElevenLabs. Check the ID and try again."
          : e instanceof Error ? e.message : "Lookup failed"
      )
    }
    setLooking(false)
  }

  const handleAdd = async () => {
    if (!found) return
    setAdding(true)
    try {
      const added = await addVoice(found.voice_id, customName.trim() || undefined)
      toast.success("Voice added to library")
      onAdded?.(added)
      onOpenChange(false)
      reset()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed"
      if (msg.toLowerCase().includes("already")) {
        toast.info("Voice already in your library")
      } else {
        toast.error(msg)
      }
    }
    setAdding(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="flex max-h-[min(85dvh,600px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pt-6">
          <div className="space-y-5 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">Add voice</DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                Paste an ElevenLabs Voice ID to look it up and add it to your library.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Label>ElevenLabs Voice ID</Label>
              <div className="flex gap-2">
                <Input
                  value={pastedId}
                  onChange={(e) => setPastedId(e.target.value)}
                  placeholder="e.g. pzxut4zZz4GImZNlqQ3H"
                  className="h-9 min-w-0 flex-1 font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void handleLookup()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0"
                  disabled={looking || !pastedId.trim()}
                  onClick={() => void handleLookup()}
                >
                  {looking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Search size={14} className="mr-1.5" />
                      Look Up
                    </>
                  )}
                </Button>
              </div>
              {lookupError && (
                <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {lookupError}
                </p>
              )}
            </div>

            {found && (
              <div className="space-y-4 rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
                <div className="flex items-start gap-3">
                  {found.preview_url && (
                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                        "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
                      )}
                      onClick={() => toggle(found.voice_id, found.preview_url)}
                      aria-label={playingId === found.voice_id ? "Pause preview" : "Play preview"}
                    >
                      {playingId === found.voice_id ? (
                        <Pause size={14} fill="currentColor" />
                      ) : (
                        <Play size={14} fill="currentColor" className="ml-0.5" />
                      )}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{found.name}</p>
                    {voiceLabels(found).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {voiceLabels(found).map((l) => (
                          <span key={l} className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground">
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    {found.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {found.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Custom name</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={found.name}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex shrink-0 gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
          <Button
            type="button"
            variant="outline"
            className="flex-1 basis-0 justify-center"
            onClick={() => { onOpenChange(false); reset() }}
            disabled={adding}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 basis-0 justify-center font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
            onClick={() => void handleAdd()}
            disabled={adding || !found}
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : "Add to Library"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
