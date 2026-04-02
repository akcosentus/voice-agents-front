"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getPhoneNumbers,
  getAgents,
  updatePhoneNumber,
  createPhoneNumber,
  deletePhoneNumber,
} from "@/lib/api"
import type { AgentListItem, PhoneNumber } from "@/lib/types"
import { formatPhone } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Phone, Plus, Trash2, Loader2 } from "lucide-react"

const E164 = /^\+[1-9]\d{6,14}$/

type RowEdit = {
  friendly_name: string
  inbound_agent_id: string
  outbound_agent_id: string
}

function rowToEdit(p: PhoneNumber): RowEdit {
  return {
    friendly_name: p.friendly_name ?? "",
    inbound_agent_id: p.inbound_agent?.id ?? "",
    outbound_agent_id: p.outbound_agent?.id ?? "",
  }
}

export default function PhoneNumbersPage() {
  const [phones, setPhones] = useState<PhoneNumber[]>([])
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newNumber, setNewNumber] = useState("")
  const [newFriendly, setNewFriendly] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PhoneNumber | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pList, aList] = await Promise.all([getPhoneNumbers(), getAgents()])
      setPhones(pList.filter((p) => p.is_active !== false))
      setAgents(aList)
      const next: Record<string, RowEdit> = {}
      for (const p of pList) {
        if (p.is_active === false) continue
        next[p.id] = rowToEdit(p)
      }
      setEdits(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load")
      setPhones([])
      setAgents([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const updateEdit = (id: string, patch: Partial<RowEdit>) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  const handleSave = async (p: PhoneNumber) => {
    const e = edits[p.id]
    if (!e) return
    setSavingId(p.id)
    try {
      await updatePhoneNumber(p.id, {
        friendly_name: e.friendly_name,
        inbound_agent_id: e.inbound_agent_id || null,
        outbound_agent_id: e.outbound_agent_id || null,
      })
      toast.success("Phone number updated")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    }
    setSavingId(null)
  }

  const handleCreate = async () => {
    const n = newNumber.trim()
    if (!E164.test(n)) {
      toast.error("Use E.164 format (e.g. +19494360836)")
      return
    }
    setCreating(true)
    try {
      await createPhoneNumber({ number: n, friendly_name: newFriendly.trim() || n })
      toast.success("Phone number added")
      setAddOpen(false)
      setNewNumber("")
      setNewFriendly("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed")
    }
    setCreating(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePhoneNumber(deleteTarget.id)
      toast.success("Phone number removed")
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Phone Numbers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Route inbound and outbound calls to agents
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
        >
          <Plus size={16} className="mr-1.5" />
          Add Phone Number
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : phones.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <Phone size={40} className="text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No phone numbers</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add a number to assign agents.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Friendly name</TableHead>
                <TableHead className="min-w-[160px]">Inbound agent</TableHead>
                <TableHead className="min-w-[160px]">Outbound agent</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {phones.map((p) => {
                const e = edits[p.id] ?? rowToEdit(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{formatPhone(p.number)}</TableCell>
                    <TableCell>
                      <Input
                        value={e.friendly_name}
                        onChange={(ev) => updateEdit(p.id, { friendly_name: ev.target.value })}
                        className="h-8 max-w-[200px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={e.inbound_agent_id || "__none__"}
                        onValueChange={(v) =>
                          updateEdit(p.id, { inbound_agent_id: (v ?? "") === "__none__" ? "" : (v ?? "") })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {agents.map((a) => (
                            <SelectItem key={a.name} value={a.id ?? a.name}>
                              {a.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={e.outbound_agent_id || "__none__"}
                        onValueChange={(v) =>
                          updateEdit(p.id, { outbound_agent_id: (v ?? "") === "__none__" ? "" : (v ?? "") })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {agents.map((a) => (
                            <SelectItem key={`o-${a.name}`} value={a.id ?? a.name}>
                              {a.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingId === p.id}
                          onClick={() => handleSave(p)}
                        >
                          {savingId === p.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add phone number</DialogTitle>
            <DialogDescription>E.164 format required (country code + number).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Number</Label>
              <Input
                value={newNumber}
                onChange={(ev) => setNewNumber(ev.target.value)}
                placeholder="+19494360836"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>Friendly name</Label>
              <Input value={newFriendly} onChange={(ev) => setNewFriendly(ev.target.value)} placeholder="Billing line" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove phone number?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  This will remove <span className="font-mono">{formatPhone(deleteTarget.number)}</span> from
                  routing.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
