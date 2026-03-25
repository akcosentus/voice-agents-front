import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, XCircle } from "lucide-react"

interface AnalysisCardProps {
  analyses: Record<string, unknown>
  compact?: boolean
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function renderValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? (
      <CheckCircle2 size={18} className="text-emerald-600" />
    ) : (
      <XCircle size={18} className="text-red-500" />
    )
  }
  if (typeof value === "string") {
    return <p className="text-sm leading-relaxed">{value}</p>
  }
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  return (
    <pre className="rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function AnalysisContent({ analyses }: { analyses: Record<string, unknown> }) {
  if (!analyses || Object.keys(analyses).length === 0) {
    return <p className="text-sm text-muted-foreground">No analysis available</p>
  }

  return (
    <div className="space-y-4">
      {Object.entries(analyses).map(([key, value]) => (
        <div key={key}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatKey(key)}
          </h4>
          {renderValue(value)}
        </div>
      ))}
    </div>
  )
}

export function AnalysisCard({ analyses, compact }: AnalysisCardProps) {
  if (compact) {
    return (
      <div className="rounded-lg border border-border p-4">
        <AnalysisContent analyses={analyses} />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">AI Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <AnalysisContent analyses={analyses} />
      </CardContent>
    </Card>
  )
}
