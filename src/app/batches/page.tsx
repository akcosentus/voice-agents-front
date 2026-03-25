"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import type { Batch } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { NewBatchModal } from "@/components/new-batch-modal"
import { formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Eye, Layers } from "lucide-react"

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("batches")
      .select("*")
      .order("created_at", { ascending: false })

    setBatches((data as Batch[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Batches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload and manage batch call jobs
          </p>
        </div>
        <NewBatchModal onBatchCreated={fetchBatches} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <Layers size={40} className="text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No batches yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your first batch to get started.
          </p>
          <div className="mt-4">
            <NewBatchModal onBatchCreated={fetchBatches} />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">{batch.name || "Untitled"}</TableCell>
                  <TableCell className="text-muted-foreground">{batch.agent_name}</TableCell>
                  <TableCell>
                    <StatusBadge status={batch.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {batch.total_rows ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">
                    {batch.completed_rows ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    {batch.failed_rows ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(batch.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" render={<Link href={`/batches/${batch.id}`} />}>
                      <Eye size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
