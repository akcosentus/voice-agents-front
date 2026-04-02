import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type CallStatus = "pending" | "in_progress" | "completed" | "failed" | "no_answer"
type BatchStatus = "draft" | "validating" | "ready" | "running" | "completed" | "failed"
type RowStatus = "valid" | "fixable" | "invalid"

const statusConfig: Record<string, { className: string; label: string }> = {
  pending: { className: "bg-gray-100 text-gray-600 border-gray-200", label: "Pending" },
  in_progress: { className: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse-subtle", label: "In Progress" },
  completed: { className: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Completed" },
  failed: { className: "bg-red-50 text-red-700 border-red-200", label: "Failed" },
  no_answer: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "No Answer" },
  draft: { className: "bg-amber-50 text-amber-900 border-amber-200", label: "Draft" },
  validating: { className: "bg-gray-100 text-gray-600 border-gray-200", label: "Validating" },
  ready: { className: "bg-gray-100 text-gray-600 border-gray-200", label: "Ready" },
  running: { className: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse-subtle", label: "Running" },
  valid: { className: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Valid" },
  fixable: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "Fixable" },
  invalid: { className: "bg-red-50 text-red-700 border-red-200", label: "Invalid" },
  outbound: { className: "bg-blue-50 text-blue-700 border-blue-200", label: "Outbound" },
  inbound: { className: "bg-violet-50 text-violet-700 border-violet-200", label: "Inbound" },
}

export function StatusBadge({
  status,
  className,
}: {
  status: CallStatus | BatchStatus | RowStatus | string
  className?: string
}) {
  const config = statusConfig[status] ?? {
    className: "bg-gray-100 text-gray-600 border-gray-200",
    label: status,
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium capitalize border",
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  )
}
