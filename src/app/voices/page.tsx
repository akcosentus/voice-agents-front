"use client"

import { useCallback, useEffect, useState } from "react"
import { getVoices, refreshVoice, removeVoice, getVoiceAgents } from "@/lib/api"
import type { AgentListItem, Voice } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  AudioLines,
  Copy,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { useAudioPreview } from "@/hooks/use-audio-preview"
import { AddVoiceModal } from "@/components/add-voice-modal"

function voiceLabels(v: Voice): string[] {
  return [v.gender, v.accent, v.age, v.category].filter((l): l is string => !!l?.trim())
}

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Voice | null>(null)
  const [removeAgents, setRemoveAgents] = useState<AgentListItem[] | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const { playingId, toggle } = useAudioPreview()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getVoices()
      setVoices(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load voices")
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openRemoveDialog = async (v: Voice) => {
    setRemoveTarget(v)
    setRemoveAgents(null)
    setRemoveLoading(true)
    try {
      const agents = await getVoiceAgents(v.voice_id)
      setRemoveAgents(agents)
    } catch {
      setRemoveAgents([])
    }
    setRemoveLoading(false)
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await removeVoice(removeTarget.voice_id)
      toast.success(`Removed "${removeTarget.custom_name || removeTarget.name}" from library`)
      setRemoveTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed")
    }
    setRemoving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Voice Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage voices available to all agents.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
        >
          <Plus size={16} className="mr-1.5" />
          Add Voice
        </Button>
      </div>

      <div className="pt-2">
      <div className="surface-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[#e8eaed]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-60" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : voices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <AudioLines size={40} className="text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No voices in your library</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Add a voice by pasting an ElevenLabs Voice ID.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#e8eaed]">
            {voices.map((v) => {
              const displayName = v.custom_name || v.name
              const labels = voiceLabels(v)
              const isPlaying = playingId === v.voice_id
              return (
                <div
                  key={v.voice_id}
                  className="group/row flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-black/[0.015]"
                >
                  <button
                    type="button"
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                      v.preview_url
                        ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)] hover:bg-[var(--color-brand)]/20"
                        : "cursor-default bg-secondary text-muted-foreground"
                    )}
                    disabled={!v.preview_url}
                    onClick={() => toggle(v.voice_id, v.preview_url)}
                    aria-label={isPlaying ? "Pause preview" : "Play preview"}
                  >
                    {isPlaying ? (
                      <Pause size={14} fill="currentColor" />
                    ) : (
                      <Play size={14} fill="currentColor" className="ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {displayName}
                      </span>
                      {labels.length > 0 && (
                        <div className="hidden items-center gap-1 sm:flex">
                          {labels.map((l, i) => (
                            <span key={i}>
                              {i > 0 && <span className="mr-1 text-muted-foreground/40">·</span>}
                              <span className="text-[11px] text-muted-foreground">{l}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {v.description && (
                      <p
                        className="mt-0.5 max-w-md truncate text-xs text-muted-foreground"
                        title={v.description}
                      >
                        {v.description}
                      </p>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 data-[state=open]:opacity-100"
                        aria-label="Voice actions"
                      >
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={refreshingId === v.voice_id}
                        onClick={async () => {
                          setRefreshingId(v.voice_id)
                          try {
                            const updated = await refreshVoice(v.voice_id)
                            setVoices((prev) => prev.map((x) => x.voice_id === v.voice_id ? { ...x, ...updated } : x))
                            toast.success("Voice updated from ElevenLabs")
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Refresh failed")
                          }
                          setRefreshingId(null)
                        }}
                      >
                        <RefreshCw size={14} className={refreshingId === v.voice_id ? "animate-spin" : ""} />
                        Refresh from ElevenLabs
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(v.voice_id)
                          toast.success("Voice ID copied")
                        }}
                      >
                        <Copy size={14} />
                        Copy Voice ID
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => void openRemoveDialog(v)}
                      >
                        <Trash2 size={14} />
                        Remove from Library
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>

      <AddVoiceModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void load()}
      />

      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent className="gap-0 overflow-hidden sm:max-w-[440px]">
          <div className="space-y-4 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Remove voice?
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                Remove{" "}
                <span className="font-medium text-foreground">
                  {removeTarget?.custom_name || removeTarget?.name}
                </span>{" "}
                from your voice library.
              </DialogDescription>
            </DialogHeader>

            {removeLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                Checking agent usage…
              </div>
            ) : removeAgents && removeAgents.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                <p className="mb-2 text-sm font-medium text-amber-900">
                  This voice is used by {removeAgents.length} agent{removeAgents.length !== 1 ? "s" : ""}:
                </p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-amber-800">
                  {removeAgents.map((a) => (
                    <li key={a.name}>{a.display_name}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-700">
                  Those agents will keep working but the voice won&apos;t appear in the picker.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-3.5">
                <p className="text-sm text-muted-foreground">
                  This voice is not used by any agents. Safe to remove.
                </p>
              </div>
            )}
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 basis-0 justify-center font-medium"
              onClick={() => void handleRemove()}
              disabled={removing || removeLoading}
            >
              {removing ? <Loader2 size={16} className="animate-spin" /> : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
