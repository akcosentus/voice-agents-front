"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import type { Call } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { AudioPlayer } from "@/components/audio-player"
import { TranscriptViewer } from "@/components/transcript-viewer"
import { AnalysisCard } from "@/components/analysis-card"
import { CaseDataCard } from "@/components/case-data-card"
import {
  formatAgentName,
  formatDuration,
  formatPhone,
  formatDateTime,
  relativeTime,
  truncateId,
} from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Phone,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"

const PAGE_SIZE = 20

const CALL_STATUSES = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "no_answer", label: "No Answer" },
]

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("all")
  const [directionFilter, setDirectionFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")
  const [agents, setAgents] = useState<string[]>([])
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from("calls")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") query = query.eq("status", statusFilter)
    if (directionFilter !== "all") query = query.eq("direction", directionFilter)
    if (agentFilter !== "all") query = query.eq("agent_name", agentFilter)

    const from = page * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, count } = await query
    setCalls((data as Call[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, statusFilter, directionFilter, agentFilter])

  useEffect(() => { fetchCalls() }, [fetchCalls])

  useEffect(() => {
    async function fetchAgents() {
      const { data } = await supabase.from("calls").select("agent_name")
      if (data) {
        const unique = [...new Set(data.map((d: { agent_name: string }) => d.agent_name))].filter(Boolean)
        setAgents(unique as string[])
      }
    }
    fetchAgents()
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasFilters = statusFilter !== "all" || directionFilter !== "all" || agentFilter !== "all"

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View all calls across batches
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(0) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALL_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Direction</Label>
          <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v ?? "all"); setPage(0) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Agent</Label>
          <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v ?? "all"); setPage(0) }}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>{formatAgentName(a)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="pb-1.5 text-sm text-muted-foreground">
          {total} call{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <Phone size={40} className="text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No calls found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters ? "Try adjusting your filters." : "No calls yet. Run a batch to get started."}
          </p>
          {!hasFilters && (
            <Link href="/batches" className="mt-2 text-sm font-medium text-[var(--color-brand)] hover:underline">
              Go to Batches
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedCall(call)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {truncateId(call.id).slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatAgentName(call.agent_name)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatPhone(call.target_number)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={call.direction} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={call.status} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatDuration(call.duration_secs)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {relativeTime(call.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft size={16} className="mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
                  Next <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Side Panel */}
      <Sheet open={!!selectedCall} onOpenChange={(open) => { if (!open) setSelectedCall(null) }}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:w-[48%] sm:max-w-none"
        >
          {selectedCall && <CallPanel call={selectedCall} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Side Panel Content ───

function CallPanel({ call }: { call: Call }) {
  const [copiedId, setCopiedId] = useState(false)

  const copyId = () => {
    navigator.clipboard.writeText(call.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  return (
    <>
      {/* Header */}
      <SheetHeader className="space-y-3 pr-8">
        <div className="flex items-center gap-2">
          <StatusBadge status={call.status} />
          <StatusBadge status={call.direction} />
        </div>
        <SheetTitle className="text-lg">
          {formatAgentName(call.agent_name)}
        </SheetTitle>
        <SheetDescription className="flex items-center gap-3 text-sm">
          <span className="font-mono">{formatPhone(call.target_number)}</span>
          <span className="text-border">·</span>
          <span>{formatDuration(call.duration_secs)}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-8">
        {/* Error */}
        {call.error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-xs font-medium text-red-800">Error</p>
              <p className="mt-0.5 text-sm text-red-700">{call.error}</p>
            </div>
          </div>
        )}

        {/* Audio */}
        <section>
          <SectionLabel>Recording</SectionLabel>
          <AudioPlayer recordingPath={call.recording_path} />
        </section>

        {/* AI Analysis */}
        <section>
          <SectionLabel>AI Analysis</SectionLabel>
          <AnalysisCard analyses={call.post_call_analyses ?? {}} compact />
        </section>

        {/* Transcript */}
        <section>
          <SectionLabel>Transcript</SectionLabel>
          <TranscriptViewer transcript={call.transcript ?? []} />
        </section>

        {/* Call Info */}
        <section>
          <SectionLabel>Call Info</SectionLabel>
          <div className="space-y-2.5 rounded-lg border border-border p-4">
            <InfoRow label="Call ID">
              <button onClick={copyId} className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
                <span className="break-all">{call.id}</span>
                {copiedId ? <Check size={12} className="shrink-0 text-emerald-600" /> : <Copy size={12} className="shrink-0" />}
              </button>
            </InfoRow>
            <InfoRow label="Started">{formatDateTime(call.started_at)}</InfoRow>
            <InfoRow label="Ended">{formatDateTime(call.ended_at)}</InfoRow>
            {call.batch_id && (
              <InfoRow label="Batch">
                <Link href={`/batches/${call.batch_id}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-brand)] hover:underline">
                  View Batch <ExternalLink size={12} />
                </Link>
              </InfoRow>
            )}
          </div>
        </section>

        {/* Case Data */}
        <section>
          <CaseDataCard data={call.case_data ?? {}} />
        </section>

        {/* Link to full page */}
        <Link
          href={`/calls/${call.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink size={12} />
          Open full page
        </Link>
      </div>
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  )
}
