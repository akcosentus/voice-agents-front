import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDuration, formatDateTime, formatPhone } from "@/lib/utils"
import type { Call } from "@/lib/types"

interface CallInfoCardProps {
  call: Call
}

export function CallInfoCard({ call }: CallInfoCardProps) {
  const rows = [
    { label: "Status", value: <StatusBadge status={call.status} /> },
    {
      label: "Duration",
      value: <span className="font-mono text-sm">{formatDuration(call.duration_secs)}</span>,
    },
    { label: "Agent", value: call.agent_name },
    { label: "Phone", value: formatPhone(call.target_number) },
    { label: "Direction", value: <StatusBadge status={call.direction} /> },
    { label: "Started", value: formatDateTime(call.started_at) },
    { label: "Ended", value: formatDateTime(call.ended_at) },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Call Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-sm font-medium">{row.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
