import { Card, CardContent } from "@/components/ui/card"
import { Bot } from "lucide-react"

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your voice agents
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Bot size={48} className="text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-medium">Coming Soon</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            View and configure your voice agents. Agents are currently managed
            via YAML configuration files.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
