"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import type { Batch, Call } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { formatDate, formatDuration, formatPhone, truncate } from "@/lib/utils"
import { downloadResults } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Download, Eye, FileSpreadsheet, MoreHorizontal, ChevronDown, Copy } from "lucide-react"

export default function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [batchRes, callsRes] = await Promise.all([
        supabase.from("batches").select("*").eq("id", id).single(),
        supabase
          .from("calls")
          .select("*")
          .eq("batch_id", id)
          .order("batch_row_index", { ascending: true }),
      ])
      setBatch(batchRes.data as Batch | null)
      setCalls((callsRes.data as Call[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [id])

  const handleDownloadResults = async () => {
    const blob = await downloadResults(id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `batch-${id}-results.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadOriginal = async () => {
    if (!batch?.input_file_path) return
    const { data } = await supabase.storage
      .from("batch-files")
      .createSignedUrl(batch.input_file_path, 3600)
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank")
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Batch not found.</p>
        <Button variant="link" className="mt-2" render={<Link href="/batches" />}>
          Back to Batches
        </Button>
      </div>
    )
  }

  const completedPct =
    batch.total_rows > 0
      ? Math.round(((batch.completed_rows ?? 0) / batch.total_rows) * 100)
      : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/batches" />}>
          <ArrowLeft size={16} className="mr-1" />
          Batches
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {batch.name || "Untitled Batch"}
            </h1>
            <StatusBadge status={batch.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent: {batch.agent_name} · Created {formatDate(batch.created_at)}
            {batch.from_number && ` · From ${formatPhone(batch.from_number)}`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download size={14} />
              Downloads
              <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDownloadOriginal}>
              <FileSpreadsheet size={14} />
              Original File
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadResults}>
              <Download size={14} />
              Results File
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total Calls</p>
            <p className="text-2xl font-semibold">{batch.total_rows ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-semibold text-emerald-600">
              {batch.completed_rows ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Failed</p>
            <p className="text-2xl font-semibold text-red-600">
              {batch.failed_rows ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="text-2xl font-semibold">{completedPct}%</p>
          </CardContent>
        </Card>
      </div>

      {calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
          <p className="text-sm text-muted-foreground">No calls in this batch yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Row #</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="min-w-[200px]">Call Notes</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => {
                const notes =
                  typeof call.post_call_analyses?.call_notes === "string"
                    ? call.post_call_analyses.call_notes
                    : ""
                return (
                  <TableRow key={call.id}>
                    <TableCell className="text-muted-foreground">
                      {call.batch_row_index != null ? call.batch_row_index + 1 : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatPhone(call.target_number)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={call.status} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatDuration(call.duration_secs)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {truncate(notes, 100)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/calls/${call.id}`}>
                              <Eye size={14} />
                              View Call
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(call.id)}
                          >
                            <Copy size={14} />
                            Copy Call ID
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
