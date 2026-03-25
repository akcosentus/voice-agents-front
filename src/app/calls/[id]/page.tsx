"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import type { Call } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { TranscriptViewer } from "@/components/transcript-viewer"
import { AudioPlayer } from "@/components/audio-player"
import { CallInfoCard } from "@/components/call-info-card"
import { AnalysisCard } from "@/components/analysis-card"
import { CaseDataCard } from "@/components/case-data-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, AlertTriangle } from "lucide-react"

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [call, setCall] = useState<Call | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCall() {
      setLoading(true)
      const { data } = await supabase.from("calls").select("*").eq("id", id).single()
      setCall(data as Call | null)
      setLoading(false)
    }
    fetchCall()
  }, [id])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-60 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!call) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Call not found.</p>
        <Button variant="link" className="mt-2" render={<Link href="/calls" />}>
          Back to Calls
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href={call.batch_id ? `/batches/${call.batch_id}` : "/calls"} />}>
          <ArrowLeft size={16} className="mr-1" />
          {call.batch_id ? "Batch" : "Calls"}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Call Detail</h1>
        <StatusBadge status={call.status} />
      </div>

      {call.error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="mt-0.5 text-sm text-red-700">{call.error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-lg font-medium">Transcript</h2>
            <TranscriptViewer transcript={call.transcript ?? []} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-medium">Recording</h2>
            <AudioPlayer recordingPath={call.recording_path} />
          </div>
        </div>

        <div className="space-y-4">
          <CallInfoCard call={call} />
          <AnalysisCard analyses={call.post_call_analyses ?? {}} />
          <CaseDataCard data={call.case_data ?? {}} />
        </div>
      </div>
    </div>
  )
}
