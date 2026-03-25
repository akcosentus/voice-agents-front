"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronDown, ChevronUp } from "lucide-react"

interface CaseDataCardProps {
  data: Record<string, string>
}

export function CaseDataCard({ data }: CaseDataCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (!data || Object.keys(data).length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Case Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No case data available</p>
        </CardContent>
      </Card>
    )
  }

  const entries = Object.entries(data)
  const preview = entries.slice(0, 4)
  const hasMore = entries.length > 4
  const display = expanded ? entries : preview

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Case Data</CardTitle>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp size={14} />
                </>
              ) : (
                <>
                  Show all ({entries.length}) <ChevronDown size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {display.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {key}
            </span>
            <span className="text-right text-sm">{value || "—"}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
