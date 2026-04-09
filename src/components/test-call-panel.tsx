"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ChevronRight, Info, Mic, Phone, Wrench } from "lucide-react"
import { cn, formatTime } from "@/lib/utils"
import type {
  BotLLMTextData,
  LLMFunctionCallInProgressData,
  LLMFunctionCallStoppedData,
  Participant,
  PipecatClient,
  RTVIMessage,
  TranscriptData,
} from "@pipecat-ai/client-js"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

const MERGE_WINDOW_MS = 1500

function buildCaseData(values: Record<string, string>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = values[k]?.trim()
    if (v) out[k] = v
  }
  return out
}

/** Agent under test — left, muted */
const BOT_BUBBLE = "border border-border bg-muted text-foreground rounded-bl-sm"
/** Local user — right, Cosentus brand */
const USER_BUBBLE = "bg-[var(--color-brand)] text-white rounded-br-sm"

type CallPhase =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "connected"
  | "ready"
  | "disconnected"
  | "error"

type AssistantSource = "llm" | "tts"

type TranscriptMessage =
  | { kind: "user"; id: string; text: string; at: string }
  | { kind: "assistant"; id: string; text: string; at: string; source: AssistantSource }
  | {
      kind: "tool"
      id: string
      toolCallId: string
      name: string
      phase: "running" | "done"
      result?: string
      at: string
    }

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function micPermissionMessage(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && (err as DOMException).name === "NotAllowedError") {
    return "Microphone access is required to test the agent. Please allow microphone access in your browser settings."
  }
  if (err instanceof Error) return err.message
  return "Could not access the microphone."
}

function errorTextFromRtvimessage(msg: RTVIMessage): string {
  const data = msg?.data as { message?: string; error?: string } | undefined
  return data?.message ?? data?.error ?? "Connection error"
}

function toolResultPreview(result: unknown): string {
  if (result === undefined || result === null) return ""
  if (typeof result === "string") return result.slice(0, 120)
  try {
    return JSON.stringify(result).slice(0, 120)
  } catch {
    return String(result).slice(0, 120)
  }
}

export type TestCallPanelProps = {
  agentName: string
  displayName: string
  isDraft: boolean
  /** `{{variable}}` names from the draft system prompt (same order as detection). */
  promptVariables?: string[]
  /** Return `true` to allow the call, or `false` to block it (caller shows toasts). */
  validateBeforeStart?: () => boolean
  /** Modal: start as soon as mounted. Embedded: false until user clicks Test. */
  immediateStart: boolean
  autoCloseEndedMs?: number
  onRequestClose?: () => void
  className?: string
}

export function TestCallPanel({
  agentName,
  displayName,
  isDraft,
  promptVariables = [],
  validateBeforeStart,
  immediateStart,
  autoCloseEndedMs = 0,
  onRequestClose,
  className,
}: TestCallPanelProps) {
  const [sessionKey, setSessionKey] = useState(() => (immediateStart ? 1 : 0))
  const [phase, setPhase] = useState<CallPhase>(() => (immediateStart ? "requesting_mic" : "idle"))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [elapsedSec, setElapsedSec] = useState(0)
  const [endedDurationSec, setEndedDurationSec] = useState(0)

  const clientRef = useRef<PipecatClient | null>(null)
  const botAudioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<CallPhase>("idle")
  const elapsedSecRef = useRef(0)
  const transcriptScrollRef = useRef<HTMLDivElement>(null)
  /** After user final utterance, bot reply may use LLM text until TTS transcript arrives. */
  const botTurnHasTtsRef = useRef(false)

  const [testVarValues, setTestVarValues] = useState<Record<string, string>>({})
  const testVarValuesRef = useRef(testVarValues)
  testVarValuesRef.current = testVarValues
  const promptVariablesRef = useRef(promptVariables)
  promptVariablesRef.current = promptVariables

  const filledCount = promptVariables.filter((k) => testVarValues[k]?.trim()).length

  const clearAllTestVariables = useCallback(() => {
    setTestVarValues(Object.fromEntries(promptVariables.map((k) => [k, ""])))
  }, [promptVariables])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    elapsedSecRef.current = elapsedSec
  }, [elapsedSec])

  useEffect(() => {
    const el = transcriptScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearAutoClose = useCallback(() => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current)
      autoCloseRef.current = null
    }
  }, [])

  const clearBotAudio = useCallback(() => {
    const el = botAudioRef.current
    if (!el) return
    el.pause()
    el.srcObject = null
  }, [])

  const disconnectClient = useCallback(async () => {
    clearTimer()
    clearBotAudio()
    const c = clientRef.current
    clientRef.current = null
    if (c) {
      try {
        await c.disconnect()
      } catch (e) {
        if (e instanceof DOMException && e.name === "InvalidStateError") return
      }
    }
  }, [clearBotAudio, clearTimer])

  const resetToIdle = useCallback(async () => {
    clearAutoClose()
    await disconnectClient()
    setSessionKey(0)
    setPhase("idle")
    setErrorMessage(null)
    setMessages([])
    setElapsedSec(0)
    setEndedDurationSec(0)
    botTurnHasTtsRef.current = false
  }, [clearAutoClose, disconnectClient])

  const endSession = useCallback(() => {
    clearAutoClose()
    const p = phaseRef.current
    const active =
      p === "requesting_mic" || p === "connecting" || p === "connected" || p === "ready"

    if (active) {
      void (async () => {
        const dur = elapsedSecRef.current
        await disconnectClient()
        setEndedDurationSec(dur)
        setPhase("disconnected")
        if (autoCloseEndedMs > 0) {
          autoCloseRef.current = setTimeout(() => {
            onRequestClose?.()
          }, autoCloseEndedMs)
        }
      })()
      return
    }

    if (p === "disconnected" || p === "error") {
      void resetToIdle()
      onRequestClose?.()
    }
  }, [autoCloseEndedMs, clearAutoClose, disconnectClient, onRequestClose, resetToIdle])

  const startTest = useCallback(() => {
    if (validateBeforeStart && !validateBeforeStart()) return
    clearAutoClose()
    setErrorMessage(null)
    setMessages([])
    setElapsedSec(0)
    setEndedDurationSec(0)
    botTurnHasTtsRef.current = false
    setPhase("requesting_mic")
    setSessionKey((k) => k + 1)
  }, [clearAutoClose, validateBeforeStart])

  useEffect(() => {
    if (sessionKey === 0) return

    let cancelled = false

    const run = async () => {
      setPhase("requesting_mic")
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) return
        stream.getTracks().forEach((t) => t.stop())
      } catch (e) {
        if (cancelled) return
        setErrorMessage(micPermissionMessage(e))
        setPhase("error")
        return
      }

      if (cancelled) return
      setPhase("connecting")

      try {
        const { PipecatClient, RTVIEvent } = await import("@pipecat-ai/client-js")
        const { SmallWebRTCTransport } = await import("@pipecat-ai/small-webrtc-transport")

        if (cancelled) return

        const client = new PipecatClient({
          transport: new SmallWebRTCTransport(),
          enableMic: true,
          enableCam: false,
          callbacks: {
            onConnected: () => {
              if (cancelled) return
              setPhase("connected")
              clearTimer()
              const start = Date.now()
              timerRef.current = setInterval(() => {
                setElapsedSec(Math.floor((Date.now() - start) / 1000))
              }, 1000)
            },
            onDisconnected: () => {
              clearTimer()
              setPhase((prev) =>
                prev === "error" || prev === "idle" || prev === "disconnected" ? prev : "disconnected"
              )
            },
            onBotReady: () => {
              if (!cancelled) setPhase("ready")
            },
            onError: (msg) => {
              if (cancelled) return
              setErrorMessage(errorTextFromRtvimessage(msg))
              setPhase("error")
            },
          },
        })

        const attachRemoteBotAudio = (track: MediaStreamTrack) => {
          if (cancelled) return
          const el = botAudioRef.current
          if (!el) return
          el.srcObject = new MediaStream([track])
          void el.play().catch(() => {
            /* autoplay may block until user gesture; mic permission path usually satisfies this */
          })
        }

        client.on(RTVIEvent.TrackStarted, (track: MediaStreamTrack, participant?: Participant) => {
          if (track.kind !== "audio" || participant?.local) return
          attachRemoteBotAudio(track)
        })

        client.on(RTVIEvent.TrackStopped, (track: MediaStreamTrack, participant?: Participant) => {
          if (track.kind !== "audio" || participant?.local) return
          const el = botAudioRef.current
          if (!el?.srcObject) return
          const stream = el.srcObject as MediaStream
          if (stream.getAudioTracks().some((t) => t.id === track.id)) {
            el.pause()
            el.srcObject = null
          }
        })

        client.on(RTVIEvent.UserTranscript, (data: TranscriptData) => {
          if (!data.final) return
          const text = data.text?.trim()
          if (!text) return
          botTurnHasTtsRef.current = false
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            const now = new Date()

            if (
              last &&
              last.kind === "user" &&
              last.at &&
              now.getTime() - new Date(last.at).getTime() < MERGE_WINDOW_MS
            ) {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...last,
                text: (last.text + " " + text).trim(),
                at: now.toISOString(),
              }
              return updated
            }

            return [...prev, { kind: "user", id: crypto.randomUUID(), text, at: now.toISOString() }]
          })
        })

        client.on(RTVIEvent.BotTranscript, (data: BotLLMTextData) => {
          const text = data.text?.trim()
          if (!text) return
          botTurnHasTtsRef.current = true
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            const now = new Date()

            if (last?.kind === "assistant" && last.source === "llm") {
              return [
                ...prev.slice(0, -1),
                { ...last, text, source: "tts" as const, at: now.toISOString() },
              ]
            }
            if (last?.kind === "assistant" && last.source === "tts") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: `${last.text} ${text}`.trim(), at: now.toISOString() },
              ]
            }
            if (
              last &&
              last.kind === "assistant" &&
              last.at &&
              now.getTime() - new Date(last.at).getTime() < MERGE_WINDOW_MS
            ) {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...last,
                text: (last.text + " " + text).trim(),
                at: now.toISOString(),
              }
              return updated
            }
            return [
              ...prev,
              {
                kind: "assistant",
                id: crypto.randomUUID(),
                text,
                at: now.toISOString(),
                source: "tts",
              },
            ]
          })
        })

        client.on(RTVIEvent.BotLlmText, (data: BotLLMTextData) => {
          if (botTurnHasTtsRef.current) return
          const text = data.text?.trim()
          if (!text) return
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.kind === "assistant" && last.source === "llm") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + text, at: new Date().toISOString() },
              ]
            }
            return [
              ...prev,
              {
                kind: "assistant",
                id: crypto.randomUUID(),
                text,
                at: new Date().toISOString(),
                source: "llm",
              },
            ]
          })
        })

        client.on(RTVIEvent.LLMFunctionCallInProgress, (data: LLMFunctionCallInProgressData) => {
          const toolCallId = data.tool_call_id
          if (!toolCallId) return
          const name = data.function_name?.replace(/_/g, " ") ?? "Tool"
          setMessages((prev) => {
            if (prev.some((m) => m.kind === "tool" && m.toolCallId === toolCallId)) return prev
            return [
              ...prev,
              {
                kind: "tool",
                id: toolCallId,
                toolCallId,
                name,
                phase: "running",
                at: new Date().toISOString(),
              },
            ]
          })
        })

        client.on(RTVIEvent.LLMFunctionCallStopped, (data: LLMFunctionCallStoppedData) => {
          const toolCallId = data.tool_call_id
          if (!toolCallId) return
          const preview = toolResultPreview(data.result)
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === "tool" && m.toolCallId === toolCallId
                ? {
                    ...m,
                    phase: "done" as const,
                    result: data.cancelled ? "Cancelled" : preview || "Done",
                  }
                : m
            )
          )
        })

        clientRef.current = client

        const caseData = buildCaseData(testVarValuesRef.current, promptVariablesRef.current)
        const requestData: Record<string, string | boolean | Record<string, string>> = {
          agent_name: agentName,
          use_draft: true,
        }
        if (Object.keys(caseData).length > 0) {
          requestData.case_data = caseData
        }

        await client.startBotAndConnect({
          endpoint: `${API_BASE.replace(/\/$/, "")}/api/test-call/connect`,
          requestData,
        })
      } catch (e) {
        if (cancelled) return
        let msg = "Could not connect. Is the backend running?"
        if (e instanceof Error) msg = e.message
        setErrorMessage(msg)
        setPhase("error")
        await disconnectClient()
      }
    }

    void run()

    return () => {
      cancelled = true
      void disconnectClient()
    }
  }, [agentName, clearTimer, disconnectClient, sessionKey])

  const titleSuffix = isDraft ? " (Draft)" : ""
  const showPulse = phase === "connected" || phase === "ready"
  const showGreen = showPulse
  const statusLine =
    phase === "requesting_mic"
      ? "Requesting microphone access..."
      : phase === "connecting"
        ? "Connecting..."
        : phase === "connected"
          ? "Connected"
          : phase === "ready"
            ? `Speaking with ${displayName}...`
            : phase === "disconnected"
              ? "Call ended"
              : phase === "error"
                ? "Something went wrong"
                : ""

  const showIdleChrome = sessionKey === 0 && phase === "idle"
  const showTranscriptChrome = !showIdleChrome
  const transcriptActive =
    phase === "requesting_mic" ||
    phase === "connecting" ||
    phase === "connected" ||
    phase === "ready" ||
    phase === "disconnected" ||
    phase === "error"

  return (
    <Card className={cn("flex h-full min-h-[320px] flex-col surface-card", className)}>
      <audio ref={botAudioRef} className="sr-only" playsInline aria-hidden />
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Phone className="size-4 text-[var(--color-brand)]" aria-hidden />
          Test call
          {titleSuffix}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Use your microphone to talk to this agent using draft settings.</p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
        {showIdleChrome && (
          <div className="flex flex-1 flex-col gap-3 py-2">
            {promptVariables.length > 0 && (
              <Collapsible
                defaultOpen={false}
                className="w-full rounded-lg bg-white text-left"
              >
                <CollapsibleTrigger
                  className={cn(
                    "group flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium outline-none transition-colors hover:bg-[var(--color-brand-light)]/60",
                    "focus-visible:ring-2 focus-visible:ring-ring/50"
                  )}
                >
                  <ChevronRight
                    className="size-4 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-90"
                    aria-hidden
                  />
                  <span>Test Variables</span>
                  <span className="ml-auto shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                    {filledCount > 0
                      ? `${filledCount} of ${promptVariables.length} filled`
                      : `${promptVariables.length} variable${promptVariables.length === 1 ? "" : "s"} available`}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-1">
                    <div className="-mx-1 max-h-[min(280px,40vh)] space-y-2.5 overflow-y-auto px-1">
                      {promptVariables.map((key, i) => (
                        <div key={key} className="space-y-1">
                          <Label
                            htmlFor={`test-call-var-${i}`}
                            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                          >
                            {key}
                          </Label>
                          <Input
                            id={`test-call-var-${i}`}
                            value={testVarValues[key] ?? ""}
                            onChange={(e) =>
                              setTestVarValues((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            placeholder="Enter value"
                            className="h-9 border border-black/[0.06] bg-background shadow-none"
                          />
                        </div>
                      ))}
                    </div>
                    {filledCount > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                          onClick={clearAllTestVariables}
                        >
                          Clear All
                        </button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mic className="size-8" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">Test your agent</p>
              <Button
                type="button"
                className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
                onClick={startTest}
              >
                <Mic className="mr-2 size-4" aria-hidden />
                Test
              </Button>
            </div>
          </div>
        )}

        {showTranscriptChrome && (
          <>
            {phase === "error" && errorMessage && (
              <p className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorMessage}
              </p>
            )}

            {phase === "disconnected" && (
              <p className="shrink-0 text-center text-sm text-muted-foreground">
                Call ended — duration {formatDuration(endedDurationSec)}.
              </p>
            )}

            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white",
                transcriptActive && "min-h-[200px]"
              )}
            >
              <p className="shrink-0 border-b border-border/60 bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                Test call transcript. Phone call quality may vary slightly due to audio differences.
              </p>
              <div
                ref={transcriptScrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {phase === "requesting_mic" || phase === "connecting"
                      ? "Connecting… transcript will appear here."
                      : "Waiting for conversation…"}
                  </p>
                )}
                {messages.map((m) => {
                  if (m.kind === "tool") {
                    const isTransfer = m.name === "transfer_call"
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div
                          className={cn(
                            "flex max-w-[95%] items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-sm",
                            isTransfer
                              ? "border-sky-200 bg-sky-50 text-sky-950"
                              : m.phase === "running"
                                ? "border-amber-200 bg-amber-50 text-amber-950"
                                : "border-border bg-card text-foreground"
                          )}
                        >
                          <Wrench className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
                          <div>
                            <p className="font-medium">
                              {isTransfer
                                ? "transfer_call"
                                : m.phase === "running" ? `Calling ${m.name}…` : `${m.name}`}
                            </p>
                            {isTransfer && (
                              <p className="mt-1 text-[11px] text-sky-700">Transfer only works on live phone calls</p>
                            )}
                            {!isTransfer && m.phase === "done" && m.result && (
                              <p className="mt-1 text-[11px] text-muted-foreground">{m.result}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }
                  const isUser = m.kind === "user"
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", isUser ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] rounded-xl px-3 py-2",
                          isUser ? USER_BUBBLE : BOT_BUBBLE
                        )}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px] tabular-nums",
                            isUser ? "text-white/75" : "text-muted-foreground"
                          )}
                        >
                          {formatTime(m.at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {(phase === "requesting_mic" || phase === "connecting" || showPulse) && (
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mic className="size-3.5 shrink-0" aria-hidden />
                  <span>{statusLine}</span>
                </div>
                <div
                  className={cn(
                    "flex h-16 w-full items-center justify-center rounded-lg border bg-muted/30",
                    showGreen && "border-emerald-500/40 bg-emerald-500/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)]",
                      showPulse && "animate-test-call-pulse"
                    )}
                    aria-hidden
                  >
                    <Mic className="size-5" />
                  </div>
                </div>
              </div>
            )}

            {phase === "ready" && (
              <div className="flex shrink-0 items-center justify-center gap-2 text-xs font-medium text-emerald-700">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </div>
            )}

            {(phase === "connected" || phase === "ready") && (
              <p className="shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                Duration: {formatDuration(elapsedSec)}
              </p>
            )}

            <div className="mt-auto flex shrink-0 flex-col gap-2 pt-1">
              {phase !== "disconnected" && phase !== "error" && (
                <Button type="button" variant="destructive" className="w-full" onClick={endSession}>
                  End Call
                </Button>
              )}
              {phase === "error" && (
                <Button
                  type="button"
                  className="w-full bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
                  onClick={() => {
                    void (async () => {
                      await resetToIdle()
                      startTest()
                    })()
                  }}
                >
                  Try again
                </Button>
              )}
              {phase === "disconnected" && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white"
                  onClick={() => {
                    void (async () => {
                      await resetToIdle()
                      onRequestClose?.()
                    })()
                  }}
                >
                  Done
                </Button>
              )}
            </div>

            {phase !== "disconnected" && phase !== "error" && (
              <p className="flex shrink-0 gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--color-brand)]" aria-hidden />
                <span>Testing draft config. Changes are not published.</span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
