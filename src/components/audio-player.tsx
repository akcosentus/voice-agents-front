"use client"

import { useEffect, useState } from "react"
import { Volume2, AlertCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface AudioPlayerProps {
  recordingPath: string | null
}

export function AudioPlayer({ recordingPath }: AudioPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!recordingPath) return

    async function getUrl() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase.storage
        .from("recordings")
        .createSignedUrl(recordingPath!, 3600)

      if (err || !data?.signedUrl) {
        setError("Could not load recording")
      } else {
        setSignedUrl(data.signedUrl)
      }
      setLoading(false)
    }

    getUrl()
  }, [recordingPath])

  if (!recordingPath) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4">
        <Volume2 size={18} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No recording available</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4">
        <Volume2 size={18} className="text-muted-foreground animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading recording…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
        <AlertCircle size={18} className="text-red-600" />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <Volume2 size={18} className="text-[var(--color-brand)]" />
        <span className="text-sm font-medium">Call Recording</span>
      </div>
      {signedUrl && (
        <audio controls className="w-full" preload="metadata">
          <source src={signedUrl} type="audio/wav" />
          Your browser does not support the audio element.
        </audio>
      )}
    </div>
  )
}
