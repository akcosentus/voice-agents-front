"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getPhoneNumbers,
  getAgents,
  updatePhoneNumber,
  syncTwilioNumbers,
  searchAvailableNumbers,
  purchaseNumber,
  releaseNumber,
} from "@/lib/api"
import type { AgentListItem, PhoneNumber } from "@/lib/types"
import { cn, formatPhone, formatPhoneNumberLabel } from "@/lib/utils"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Search, Phone, RefreshCw, Loader2, ShoppingCart, Unplug, Pencil } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

/** Lighter than `bg-secondary` controls — subtle row hover on this page only */
const PHONE_TABLE_ROW_HOVER = "group-hover/row:bg-black/[0.02]"

export default function PhoneNumbersPage() {
  const [phones, setPhones] = useState<PhoneNumber[]>([])
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const [buyOpen, setBuyOpen] = useState(false)
  const [buyCountry, setBuyCountry] = useState("US")
  const [buyQuery, setBuyQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<
    { number: string; city?: string; region?: string; price?: string }[]
  >([])
  const [selectedNumber, setSelectedNumber] = useState<string>("")
  const [purchaseFriendly, setPurchaseFriendly] = useState("")
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const [releaseTarget, setReleaseTarget] = useState<PhoneNumber | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)

  const phonesRef = useRef<PhoneNumber[]>([])
  const editsRef = useRef<Record<string, RowEdit>>({})
  const nameInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    phonesRef.current = phones
  }, [phones])

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  const updateEdit = (id: string, patch: Partial<RowEdit>) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  const persistPhone = useCallback(async (id: string, e: RowEdit) => {
    const p = phonesRef.current.find((x) => x.id === id)
    if (!p) return
    const orig = rowToEdit(p)
    if (
      e.friendly_name === orig.friendly_name &&
      e.inbound_agent_id === orig.inbound_agent_id &&
      e.outbound_agent_id === orig.outbound_agent_id
    ) {
      return
    }
    setSavingId(id)
    try {
      await updatePhoneNumber(id, {
        friendly_name: e.friendly_name,
        inbound_agent_id: e.inbound_agent_id || null,
        outbound_agent_id: e.outbound_agent_id || null,
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSavingId(null)
    }
  }, [load])

  /** Persist name only after blur (no save per keystroke). */
  const flushFriendlyNamePersist = useCallback(
    (id: string) => {
      const e = editsRef.current[id]
      if (e) void persistPhone(id, e)
    },
    [persistPhone]
  )

  useEffect(() => {
    if (editingNameId && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingNameId])

  const handleSyncTwilio = async () => {
    setSyncing(true)
    try {
      const data = await syncTwilioNumbers()
      const total = typeof data.total === "number" ? data.total : 0
      toast.success(`Synced ${total} numbers from Twilio`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed")
    }
    setSyncing(false)
  }

  const runSearch = async () => {
    setSearchError(null)
    setPurchaseError(null)
    setSearching(true)
    try {
      const q = buyQuery.trim()
      const params: { country?: string; area_code?: string; contains?: string; limit?: number } = {
        country: buyCountry,
        limit: 30,
      }
      if (/^\d{3}$/.test(q)) params.area_code = q
      else if (q) params.contains = q

      const data = await searchAvailableNumbers(params)
      const rawList = (data?.available_numbers ?? data?.numbers ?? data?.results ?? data) as unknown
      const list = Array.isArray(rawList) ? rawList : []

      const normalized = list
        .map((item) => {
          const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
          const number = String(o.number ?? o.phone_number ?? o.e164 ?? "").trim()
          if (!number) return null
          const city = typeof o.city === "string" ? o.city : typeof o.locality === "string" ? o.locality : undefined
          const region = typeof o.region === "string" ? o.region : typeof o.state === "string" ? o.state : undefined
          const priceRaw = o.price ?? o.monthly_price ?? o.monthly_cost ?? o.cost
          const price =
            typeof priceRaw === "number"
              ? `$${priceRaw.toFixed(2)}/mo`
              : typeof priceRaw === "string"
                ? priceRaw
                : undefined
          return { number, city, region, price }
        })
        .filter(Boolean) as { number: string; city?: string; region?: string; price?: string }[]

      setSearchResults(normalized)
      if (!normalized.some((r) => r.number === selectedNumber)) {
        setSelectedNumber("")
      }
    } catch (e) {
      setSearchResults([])
      setSelectedNumber("")
      setSearchError(e instanceof Error ? e.message : "Search failed")
    }
    setSearching(false)
  }

  const handlePurchase = async () => {
    setPurchaseError(null)
    if (!selectedNumber) {
      setPurchaseError("Select a number to purchase.")
      return
    }
    setPurchasing(true)
    try {
      const friendly = purchaseFriendly.trim() || selectedNumber
      await purchaseNumber({ number: selectedNumber, friendly_name: friendly })
      toast.success(`Purchased ${formatPhone(selectedNumber)}`)
      setBuyOpen(false)
      setBuyQuery("")
      setSearchResults([])
      setSelectedNumber("")
      setPurchaseFriendly("")
      await load()
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : "Purchase failed")
    }
    setPurchasing(false)
  }

  const handleRelease = async () => {
    if (!releaseTarget) return
    setReleaseError(null)
    setReleasing(true)
    try {
      await releaseNumber(releaseTarget.id)
      toast.success(`Released ${formatPhoneNumberLabel(releaseTarget)}`)
      setReleaseTarget(null)
      await load()
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : "Release failed")
    }
    setReleasing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Phone Numbers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Route inbound and outbound calls to agents
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSyncTwilio()}
            disabled={syncing}
            title="Import numbers you already own on your Twilio account"
          >
            {syncing ? (
              <Loader2 size={16} className="mr-1.5 animate-spin" />
            ) : (
              <RefreshCw size={16} className="mr-1.5" />
            )}
            Sync from Twilio
          </Button>
          <Button
            type="button"
            onClick={() => setBuyOpen(true)}
            className="bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
          >
            <ShoppingCart size={16} className="mr-1.5" />
            Buy Number
          </Button>
        </div>
      </div>

      <div className="pt-2">
      {loading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="min-w-[160px]">Inbound agent</TableHead>
              <TableHead className="min-w-[160px]">Outbound agent</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell className={PHONE_TABLE_ROW_HOVER}><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell className={PHONE_TABLE_ROW_HOVER}>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="size-7 rounded-md" />
                  </div>
                </TableCell>
                <TableCell className={PHONE_TABLE_ROW_HOVER}><Skeleton className="h-9 w-36 rounded-lg" /></TableCell>
                <TableCell className={PHONE_TABLE_ROW_HOVER}><Skeleton className="h-9 w-36 rounded-lg" /></TableCell>
                <TableCell className={PHONE_TABLE_ROW_HOVER}>
                  <div className="flex items-center justify-end gap-1">
                    <Skeleton className="size-9 rounded-lg" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : phones.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center py-16">
          <Phone size={40} className="text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No phone numbers</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Sync numbers you already own from Twilio, or buy a new number to assign agents.
          </p>
        </div>
      ) : (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="min-w-[160px]">Inbound agent</TableHead>
                <TableHead className="min-w-[160px]">Outbound agent</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {phones.map((p) => {
                const e = edits[p.id] ?? rowToEdit(p)
                const saving = savingId === p.id
                return (
                  <TableRow key={p.id}>
                    <TableCell className={cn(PHONE_TABLE_ROW_HOVER, "font-mono text-sm")}>
                      {formatPhone(p.number)}
                    </TableCell>
                    <TableCell className={cn(PHONE_TABLE_ROW_HOVER, "max-w-[240px]")}>
                      {editingNameId === p.id ? (
                        <Input
                          ref={nameInputRef}
                          value={e.friendly_name}
                          disabled={saving}
                          onChange={(ev) => {
                            updateEdit(p.id, { friendly_name: ev.target.value })
                          }}
                          onBlur={() => {
                            setEditingNameId(null)
                            flushFriendlyNamePersist(p.id)
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") {
                              ev.preventDefault()
                              ev.currentTarget.blur()
                            }
                            if (ev.key === "Escape") {
                              ev.preventDefault()
                              ev.currentTarget.blur()
                            }
                          }}
                          className="h-9 w-full max-w-[220px] rounded-full border-0 bg-white px-3.5 text-sm shadow-none ring-1 ring-black/[0.08] focus-visible:ring-2 focus-visible:ring-ring/50"
                          aria-label="Name"
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`min-w-0 truncate text-sm ${e.friendly_name.trim() ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {e.friendly_name.trim() || "—"}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={saving}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            title="Edit name"
                            aria-label="Edit name"
                            onClick={() => setEditingNameId(p.id)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={PHONE_TABLE_ROW_HOVER}>
                      <Select
                        disabled={saving}
                        value={e.inbound_agent_id || "__none__"}
                        onValueChange={(v) => {
                          const inbound = (v ?? "") === "__none__" ? "" : (v ?? "")
                          const base = editsRef.current[p.id] ?? rowToEdit(p)
                          const next = { ...base, inbound_agent_id: inbound }
                          setEdits((prev) => ({ ...prev, [p.id]: next }))
                          void persistPhone(p.id, next)
                        }}
                      >
                        <SelectTrigger className="h-9 min-w-[180px] max-w-[260px]">
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
                    <TableCell className={PHONE_TABLE_ROW_HOVER}>
                      <Select
                        disabled={saving}
                        value={e.outbound_agent_id || "__none__"}
                        onValueChange={(v) => {
                          const outbound = (v ?? "") === "__none__" ? "" : (v ?? "")
                          const base = editsRef.current[p.id] ?? rowToEdit(p)
                          const next = { ...base, outbound_agent_id: outbound }
                          setEdits((prev) => ({ ...prev, [p.id]: next }))
                          void persistPhone(p.id, next)
                        }}
                      >
                        <SelectTrigger className="h-9 min-w-[180px] max-w-[260px]">
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
                    <TableCell className={PHONE_TABLE_ROW_HOVER}>
                      <div className="flex items-center justify-end gap-1">
                        {saving && (
                          <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden />
                        )}
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                disabled={saving}
                                className="size-9"
                                onClick={() => {
                                  setReleaseError(null)
                                  setReleaseTarget(p)
                                }}
                                aria-label="Release number from Twilio"
                              />
                            }
                          >
                            <Unplug size={16} />
                          </TooltipTrigger>
                          <TooltipContent side="top">Release number</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      </div>

      <Dialog
        open={buyOpen}
        onOpenChange={(o) => {
          setBuyOpen(o)
          if (!o) {
            setSearchError(null)
            setPurchaseError(null)
          }
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,920px)] flex-col gap-0 overflow-hidden sm:max-w-2xl">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
            <div className="space-y-5 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">Buy phone number</DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                Search Twilio inventory, choose a number, and add it to your workspace. Billed by
                Twilio at ~$1.15/mo for local or ~$2.15/mo for toll-free.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Search inventory
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Select value={buyCountry} onValueChange={(v) => setBuyCountry(v ?? "US")}>
                    <SelectTrigger className="h-9 w-full max-w-md border border-black/[0.06] bg-background shadow-none hover:bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">United States</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Area code or digits</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <Input
                      value={buyQuery}
                      onChange={(e) => setBuyQuery(e.target.value)}
                      placeholder="e.g. 415 or partial number"
                      className="h-9 min-w-0 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void runSearch()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() => void runSearch()}
                      disabled={searching}
                      className="h-9 shrink-0 sm:w-[7.5rem]"
                    >
                      {searching ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          <Search size={16} className="mr-1.5" />
                          Search
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {searchError && (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {searchError}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Available numbers
              </p>
              <div
                className={cn(
                  "rounded-lg border border-black/[0.06] bg-background p-1.5",
                  searchResults.length > 0 &&
                    "max-h-[min(280px,38dvh)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
                )}
              >
                {searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Run a search to see numbers you can buy.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {searchResults.map((r) => {
                      const selected = r.number === selectedNumber
                      const location = [r.city, r.region].filter(Boolean).join(", ")
                      return (
                        <button
                          key={r.number}
                          type="button"
                          onClick={() => {
                            setSelectedNumber(r.number)
                            setPurchaseError(null)
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            selected
                              ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] ring-1 ring-[var(--color-brand)]/20"
                              : "border-border/50 bg-background/80 hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-foreground">{formatPhone(r.number)}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {location || "—"}
                            </div>
                          </div>
                          <div className="shrink-0 tabular-nums text-xs text-muted-foreground">
                            {r.price ?? "~$1.15/mo"}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Purchase details
              </p>
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/[0.06] pb-3">
                  <span className="text-sm text-muted-foreground">Selected number</span>
                  <span className="font-mono text-sm font-medium text-foreground">
                    {selectedNumber ? formatPhone(selectedNumber) : "—"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label>Friendly name</Label>
                  <Input
                    value={purchaseFriendly}
                    onChange={(e) => setPurchaseFriendly(e.target.value)}
                    placeholder="e.g. Main outbound line"
                    className="h-9"
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Estimated <span className="font-medium text-foreground/80">~$1.15/month</span> for local,{" "}
                  <span className="font-medium text-foreground/80">~$2.15/month</span> for toll-free (billed by Twilio).
                </p>
                {purchaseError && (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {purchaseError}
                  </p>
                )}
              </div>
            </div>
            </div>
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex shrink-0 gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setBuyOpen(false)}
              disabled={purchasing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handlePurchase()}
              disabled={purchasing || !selectedNumber}
              className="flex-1 basis-0 justify-center font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
            >
              {purchasing ? <Loader2 size={16} className="animate-spin" /> : "Purchase number"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!releaseTarget} onOpenChange={(o) => !o && setReleaseTarget(null)}>
        <DialogContent className="gap-0 overflow-hidden sm:max-w-[440px]">
          <div className="space-y-4 pb-2">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Release phone number
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85">
                {releaseTarget && (
                  <>
                    This permanently releases{" "}
                    <span className="font-mono text-foreground">{formatPhoneNumberLabel(releaseTarget)}</span>{" "}
                    from your Twilio account.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-black/[0.06] bg-secondary/50 px-4 py-3.5">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                What happens next
              </p>
              <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-foreground/75 marker:text-muted-foreground/60">
                <li>Monthly Twilio billing (~$1.15/mo local) for this number stops</li>
                <li>The number may be purchased by someone else</li>
                <li>Inbound and outbound agent assignments are cleared</li>
                <li className="font-medium text-foreground/90">This cannot be undone</li>
              </ul>
            </div>

            {releaseError && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {releaseError}
              </p>
            )}
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex gap-3 rounded-b-2xl bg-secondary/20 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setReleaseTarget(null)}
              disabled={releasing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 basis-0 justify-center font-medium"
              onClick={() => void handleRelease()}
              disabled={releasing}
            >
              {releasing ? <Loader2 size={16} className="animate-spin" /> : "Release number"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
