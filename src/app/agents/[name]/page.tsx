import { use } from "react"
import AgentDetailClient from "./agent-detail-client"

export default function AgentDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  return <AgentDetailClient encodedName={name} />
}
