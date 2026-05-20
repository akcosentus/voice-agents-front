"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Phone, PhoneForwarded } from "lucide-react"
import { cn } from "@/lib/utils"

export type TestCallPanelProps = {
  agentName?: string
  displayName?: string
  isDraft?: boolean
  promptVariables?: string[]
  validateBeforeStart?: () => boolean
  immediateStart?: boolean
  autoCloseEndedMs?: number
  onRequestClose?: () => void
  className?: string
}

/**
 * Browser-based test calls are deferred to a post-launch phase. Until then,
 * the recommended workflow is to assign a phone number to the agent and dial
 * it from a real device. See `chore/defer-browser-test-calls`.
 */
export function TestCallPanel({ isDraft, className }: TestCallPanelProps) {
  const titleSuffix = isDraft ? " (Draft)" : ""

  return (
    <Card className={cn("flex h-full min-h-[320px] flex-col surface-card", className)}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Phone className="size-4 text-[var(--color-brand)]" aria-hidden />
          Test call
          {titleSuffix}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Test this agent on a real phone call.
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full border border-black/[0.06] bg-white text-muted-foreground">
            <PhoneForwarded className="size-8" aria-hidden />
          </div>
          <div className="space-y-1 px-2">
            <p className="text-sm font-medium text-foreground">
              Browser test calls coming soon
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              For now, assign a phone number to this agent and dial it from your
              phone to test the conversation end-to-end.
            </p>
          </div>
          <Button
            asChild
            className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
          >
            <Link href="/phone-numbers">
              <Phone className="mr-2 size-4" aria-hidden />
              Go to Phone Numbers
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
