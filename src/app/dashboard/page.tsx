import { Card, CardContent } from "@/components/ui/card"
import { LayoutDashboard } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview and analytics
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <LayoutDashboard size={48} className="text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-medium">Coming Soon</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Analytics and insights about your call performance, success rates,
            and agent activity will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
