"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  getAgents,
  getAgentPrompt,
  getPhoneNumbers,
  uploadBatch,
  updateBatchRows,
  startBatch,
  deleteDraftBatch,
} from "@/lib/api"
import type {
  AgentListItem,
  PhoneNumber,
  UploadResponse,
  UploadedRow,
} from "@/lib/types"
import { cn, formatPhone, formatPhoneNumberLabel } from "@/lib/utils"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileDropzone } from "@/components/file-dropzone"
import { toast } from "sonner"
import {
  ArrowLeft,
  CalendarIcon,
  Clock,
  FileDown,
  Loader2,
  Minus,
  Pencil,
  Phone,
  Plus,
  Trash2,
  XCircle,
  AlertTriangle,
  Check,
} from "lucide-react"

// ─── Row field accessor (handles nested .data, flat row, or missing) ───

function getRowField(row: Record<string, unknown>, column: string): string {
  for (const key of ["data", "case_data"] as const) {
    const nested = row[key]
    if (nested && typeof nested === "object" && !Array.isArray(nested) && column in (nested as Record<string, unknown>)) {
      return String((nested as Record<string, unknown>)[column] ?? "")
    }
  }
  if (column in row) {
    return String(row[column] ?? "")
  }
  return ""
}

// ─── Phone validation helpers ───

function looksLikePhone(val: string): boolean {
  const digits = val.replace(/\D/g, "")
  return digits.length >= 10 && digits.length <= 15
}

function normalizePhone(val: string): string {
  const digits = val.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return val.trim()
}

function validatePhone(val: string): { valid: boolean; normalized: string; error: string | null } {
  if (!val || !val.trim()) return { valid: false, normalized: "", error: "Missing phone number" }
  const n = normalizePhone(val)
  const digits = n.replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 15) {
    return { valid: false, normalized: n, error: "Invalid phone number format" }
  }
  return { valid: true, normalized: n, error: null }
}

// ─── Column-mapping helpers ───

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\s-]/g, "")
}

const PHONE_ALIASES = new Set([
  "phonenumber", "phone", "phoneno", "phonenumbers",
  "telephonenumber", "tel", "mobile", "cell", "cellphone",
  "number", "contactnumber", "recipientphone",
])

function detectPhoneColumn(columns: string[], rows: Record<string, unknown>[]): string | null {
  const byName = columns.find((c) => PHONE_ALIASES.has(normalize(c)))
  if (byName) return byName

  for (const col of columns) {
    const vals = rows.slice(0, 20).map((r) => getRowField(r, col)).filter(Boolean)
    if (vals.length > 0 && vals.filter(looksLikePhone).length / vals.length > 0.6) {
      return col
    }
  }
  return null
}

function autoMatchColumns(
  sourceColumns: string[],
  variables: string[],
  phoneCol: string | null
): Record<string, string> {
  const mapping: Record<string, string> = {}
  const usedVars = new Set<string>()

  if (phoneCol) {
    mapping[phoneCol] = "__phone__"
    usedVars.add("__phone__")
  }

  for (const src of sourceColumns) {
    if (src === phoneCol) continue
    const nSrc = normalize(src)
    const match = variables.find((v) => !usedVars.has(v) && normalize(v) === nSrc)
    if (match) {
      mapping[src] = match
      usedVars.add(match)
    }
  }

  return mapping
}

// ─── Scheduling constants ───

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)", abbrev: "ET" },
  { value: "America/Chicago", label: "Central (CT)", abbrev: "CT" },
  { value: "America/Denver", label: "Mountain (MT)", abbrev: "MT" },
  { value: "America/Los_Angeles", label: "Pacific (PT)", abbrev: "PT" },
  { value: "America/Anchorage", label: "Alaska (AKT)", abbrev: "AKT" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)", abbrev: "HT" },
] as const

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
const DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]

function buildTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0")
      const mm = String(m).padStart(2, "0")
      const suffix = h >= 12 ? "PM" : "AM"
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      slots.push({ value: `${hh}:${mm}`, label: `${h12}:${mm.padStart(2, "0")} ${suffix}` })
    }
  }
  return slots
}

const TIME_SLOTS = buildTimeSlots()

function tzAbbrev(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.abbrev ?? "ET"
}

function formatTimeLabel(val: string): string {
  return TIME_SLOTS.find((s) => s.value === val)?.label ?? val
}

function formatDaysSummary(days: string[]): string {
  const canonical = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const indices = canonical.reduce<number[]>((acc, d, i) => { if (days.includes(d)) acc.push(i); return acc }, [])
  if (indices.length === 7) return "Every day"
  if (indices.length === 0) return "No days"

  const runs: number[][] = []
  for (const idx of indices) {
    const last = runs[runs.length - 1]
    if (last && idx === last[last.length - 1] + 1) last.push(idx)
    else runs.push([idx])
  }

  return runs.map((run) =>
    run.length >= 3
      ? `${canonical[run[0]]}\u2013${canonical[run[run.length - 1]]}`
      : run.map((i) => canonical[i]).join(", ")
  ).join(", ")
}

function currentTimeInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date())
  } catch {
    return ""
  }
}

// ─── Number Stepper ───

function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  className,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  className?: string
}) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <Minus size={14} />
      </button>
      <span className="w-5 text-center text-sm font-medium tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

// ─── Types ───

interface EditableRow extends UploadedRow {
  excluded: boolean
  edited: Set<string>
  phoneValid: boolean
  phoneError: string | null
  phoneNormalized: string
}

export default function NewBatchPage() {
  const router = useRouter()

  // Settings
  const [batchName, setBatchName] = useState("")
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [selectedAgent, setSelectedAgent] = useState("")
  const [phones, setPhones] = useState<PhoneNumber[]>([])
  const [variables, setVariables] = useState<string[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [sourceColumns, setSourceColumns] = useState<string[]>([])

  // Mapping: sourceColumn -> variableName | "__phone__" | "__skip__"
  const [mapping, setMapping] = useState<Record<string, string>>({})

  // Schedule
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [timezone, setTimezone] = useState("America/New_York")
  const [windowStart, setWindowStart] = useState("09:00")
  const [windowEnd, setWindowEnd] = useState("17:00")
  const [callingDays, setCallingDays] = useState<string[]>([...DEFAULT_DAYS])
  const [concurrency, setConcurrency] = useState(5)

  // Schedule modal (temp states so Cancel doesn't save)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [tmpStartDate, setTmpStartDate] = useState<Date | undefined>(undefined)
  const [tmpTimezone, setTmpTimezone] = useState("America/New_York")
  const [tmpWindowStart, setTmpWindowStart] = useState("09:00")
  const [tmpWindowEnd, setTmpWindowEnd] = useState("17:00")
  const [tmpCallingDays, setTmpCallingDays] = useState<string[]>([...DEFAULT_DAYS])

  const openScheduleModal = useCallback(() => {
    setTmpStartDate(startDate ?? new Date())
    setTmpTimezone(timezone)
    setTmpWindowStart(windowStart)
    setTmpWindowEnd(windowEnd)
    setTmpCallingDays([...callingDays])
    setScheduleModalOpen(true)
  }, [startDate, timezone, windowStart, windowEnd, callingDays])

  const saveScheduleModal = useCallback(() => {
    setStartDate(tmpStartDate)
    setTimezone(tmpTimezone)
    setWindowStart(tmpWindowStart)
    setWindowEnd(tmpWindowEnd)
    setCallingDays([...tmpCallingDays])
    setCalendarOpen(false)
    setScheduleModalOpen(false)
  }, [tmpStartDate, tmpTimezone, tmpWindowStart, tmpWindowEnd, tmpCallingDays])

  const handleScheduleModeChange = useCallback((mode: "now" | "scheduled") => {
    setScheduleMode(mode)
    if (mode === "scheduled" && !startDate) {
      setStartDate(new Date())
    }
  }, [startDate])

  // Start
  const [starting, setStarting] = useState(false)
  const batchIdRef = useRef<string | null>(null)
  const batchStartedRef = useRef(false)
  const hasEditsRef = useRef(false)

  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const lastClickedRowRef = useRef<number | null>(null)

  // Inline edit
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)
  const justFinishedEditRef = useRef(false)

  // Pagination
  const [tablePage, setTablePage] = useState(0)
  const TABLE_PAGE_SIZE = 50

  // ─── Load agents + phones on mount ───
  useEffect(() => {
    async function load() {
      setLoadingAgents(true)
      try {
        const [aList, pList] = await Promise.all([getAgents(), getPhoneNumbers()])
        setAgents(aList)
        setPhones(pList.filter((p) => p.is_active !== false))
      } catch {
        toast.error("Failed to load agents or phone numbers")
      }
      setLoadingAgents(false)
    }
    load()
  }, [])

  // ─── Fetch variables when agent changes ───
  useEffect(() => {
    if (!selectedAgent) {
      setVariables([])
      return
    }
    let cancelled = false
    async function fetch() {
      try {
        const data = await getAgentPrompt(selectedAgent)
        if (!cancelled) setVariables(data.prompt_variables ?? [])
      } catch {
        if (!cancelled) setVariables([])
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [selectedAgent])

  // Delete draft batch on unmount if not started
  useEffect(() => {
    return () => {
      if (batchIdRef.current && !batchStartedRef.current) {
        deleteDraftBatch(batchIdRef.current).catch(() => {})
      }
    }
  }, [])

  // Focus edit input
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  // ─── Derived ───
  const phoneCol = Object.entries(mapping).find(([, v]) => v === "__phone__")?.[0] ?? null
  const mappedVars = new Set(Object.values(mapping).filter((v) => v !== "__phone__" && v !== "__skip__"))
  const unmappedVars = variables.filter((v) => !mappedVars.has(v))
  const includedRows = rows.filter((r) => !r.excluded)
  const validRows = includedRows.filter((r) => r.phoneValid)
  const invalidRows = includedRows.filter((r) => !r.phoneValid)

  const outboundPhone = (() => {
    if (!selectedAgent) return null
    const agent = agents.find((a) => a.name === selectedAgent)
    if (!agent) return null
    return phones.find(
      (p) => p.outbound_agent?.name === selectedAgent || p.outbound_agent?.id === agent.id
    ) ?? null
  })()

  const canStart = !!selectedAgent && !!outboundPhone && !!uploadData && !!phoneCol && validRows.length > 0 && !starting

  // ─── Column display order (only mapped columns) ───
  const displayColumns = sourceColumns.filter((c) => {
    const m = mapping[c]
    return m && m !== "__skip__"
  })

  // ─── Pagination ───
  const totalTablePages = Math.ceil(rows.length / TABLE_PAGE_SIZE)
  const pageStart = tablePage * TABLE_PAGE_SIZE
  const visibleRows = rows.slice(pageStart, pageStart + TABLE_PAGE_SIZE)

  // ─── Handlers ───

  const handleFileSelect = async (file: File) => {
    if (!selectedAgent || !outboundPhone) return
    setUploading(true)
    setUploadError(null)

    // Delete previous draft if re-uploading
    if (batchIdRef.current) {
      await deleteDraftBatch(batchIdRef.current).catch(() => {})
      batchIdRef.current = null
    }

    try {
      const data: UploadResponse = await uploadBatch(file, selectedAgent, outboundPhone.number)
      setUploadData(data)
      batchIdRef.current = data.batch_id

      const rawRows = data.rows as unknown as Record<string, unknown>[]

      // Detect columns from response.columns, or from first row's data/case_data keys, or flat row keys
      const firstRow = rawRows[0]
      let cols = data.columns ?? []
      if (cols.length === 0 && firstRow) {
        const nested = firstRow.data ?? firstRow.case_data
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
          cols = Object.keys(nested as Record<string, unknown>)
        } else {
          const skip = new Set(["index", "row_index", "phone_raw", "phone_normalized", "phone_e164", "status", "validation", "error", "data", "case_data"])
          cols = Object.keys(firstRow).filter((k) => !skip.has(k))
        }
      }
      setSourceColumns(cols)

      const phoneDet = detectPhoneColumn(cols, rawRows)
      const autoMap = autoMatchColumns(cols, variables, phoneDet)
      setMapping(autoMap)

      const editableRows: EditableRow[] = rawRows.map((raw, i) => {
        const rowData: Record<string, string> = {}
        for (const c of cols) {
          rowData[c] = getRowField(raw, c)
        }

        const rawPhone = String(raw.phone_e164 ?? raw.phone_raw ?? "")
        const phoneRaw = phoneDet ? (rowData[phoneDet] || rawPhone) : rawPhone
        const pv = validatePhone(phoneRaw)

        const idx = typeof raw.row_index === "number" ? raw.row_index : typeof raw.index === "number" ? raw.index : i
        const rawStatus = String(raw.validation ?? raw.status ?? "valid")
        const status = (rawStatus === "valid" || rawStatus === "fixable" || rawStatus === "invalid") ? rawStatus : "valid"

        return {
          index: idx,
          phone_raw: phoneRaw,
          phone_normalized: String(raw.phone_e164 ?? raw.phone_normalized ?? ""),
          status: status as "valid" | "fixable" | "invalid",
          error: typeof raw.error === "string" ? raw.error : null,
          data: rowData,
          excluded: false,
          edited: new Set<string>(),
          phoneValid: pv.valid,
          phoneError: pv.error,
          phoneNormalized: pv.normalized,
        }
      })
      setRows(editableRows)
      setSelectedRows(new Set())
      lastClickedRowRef.current = null
      setTablePage(0)
      hasEditsRef.current = false
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not parse file. Please upload a valid CSV or Excel file.")
    } finally {
      setUploading(false)
    }
  }

  const handleMappingChange = (srcCol: string, target: string) => {
    setMapping((prev) => {
      const next = { ...prev }
      if (target === "__skip__" || target === "") {
        delete next[srcCol]
      } else {
        // If another source column already maps to this target, unmap it
        if (target !== "__phone__") {
          for (const [k, v] of Object.entries(next)) {
            if (v === target && k !== srcCol) delete next[k]
          }
        }
        if (target === "__phone__") {
          // Clear any previous phone mapping
          for (const [k, v] of Object.entries(next)) {
            if (v === "__phone__" && k !== srcCol) delete next[k]
          }
        }
        next[srcCol] = target
      }

      // Re-validate phone column
      if (target === "__phone__" || prev[srcCol] === "__phone__") {
        const newPhoneCol = target === "__phone__" ? srcCol
          : Object.entries(next).find(([, v]) => v === "__phone__")?.[0] ?? null

        setRows((prevRows) =>
          prevRows.map((r) => {
            const phoneRaw = newPhoneCol ? (r.data[newPhoneCol] || "") : ""
            const pv = validatePhone(phoneRaw)
            return { ...r, phoneValid: pv.valid, phoneError: pv.error, phoneNormalized: pv.normalized }
          })
        )
      }
      return next
    })
  }

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    const { rowIdx, col } = editingCell
    setRows((prev) => {
      const currentValue = prev[rowIdx]?.data[col] ?? ""
      if (editValue === currentValue) return prev

      hasEditsRef.current = true
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.data = { ...row.data, [col]: editValue }
      row.edited = new Set(row.edited).add(col)

      if (mapping[col] === "__phone__") {
        const pv = validatePhone(editValue)
        row.phoneValid = pv.valid
        row.phoneError = pv.error
        row.phoneNormalized = pv.normalized
      }
      next[rowIdx] = row
      return next
    })
    setEditingCell(null)
    justFinishedEditRef.current = true
    requestAnimationFrame(() => { justFinishedEditRef.current = false })
  }, [editingCell, editValue, mapping])

  const toggleRowExclusion = (idx: number) => {
    hasEditsRef.current = true
    setRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], excluded: !next[idx].excluded }
      return next
    })
  }

  const selectAllInvalid = () => {
    hasEditsRef.current = true
    setRows((prev) =>
      prev.map((r) => (!r.phoneValid && !r.excluded ? { ...r, excluded: true } : r))
    )
  }

  const deleteExcluded = () => {
    hasEditsRef.current = true
    setRows((prev) => prev.filter((r) => !r.excluded))
  }

  const handleRowClick = (masterIdx: number, e: React.MouseEvent) => {
    if (editingCell || justFinishedEditRef.current) return
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (e.shiftKey && lastClickedRowRef.current !== null) {
        const from = Math.min(lastClickedRowRef.current, masterIdx)
        const to = Math.max(lastClickedRowRef.current, masterIdx)
        for (let i = from; i <= to; i++) next.add(i)
      } else {
        if (next.has(masterIdx)) next.delete(masterIdx)
        else next.add(masterIdx)
      }
      lastClickedRowRef.current = masterIdx
      return next
    })
  }

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return
    hasEditsRef.current = true
    setRows((prev) => prev.filter((_, i) => !selectedRows.has(i)))
    setSelectedRows(new Set())
    lastClickedRowRef.current = null
  }

  const handleDownloadTemplate = () => {
    const headers = ["phone_number", ...variables]
    const csv = headers.join(",") + "\n"
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedAgent}-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleStart = async () => {
    if (!uploadData || !phoneCol) return
    if (scheduleMode === "scheduled" && callingDays.length === 0) {
      toast.error("At least one calling day is required")
      return
    }
    setStarting(true)
    try {
      // Step 1: Save rows only if the user made edits or exclusions
      if (hasEditsRef.current) {
        const finalRows = includedRows.map((r) => {
          const mappedData: Record<string, string> = {}
          let phone = r.phoneNormalized || ""

          for (const [srcCol, target] of Object.entries(mapping)) {
            if (target === "__skip__") continue
            if (target === "__phone__") {
              phone = r.phoneNormalized || r.data[srcCol] || ""
            } else {
              mappedData[target] = r.data[srcCol] || ""
            }
          }

          return {
            index: r.index ?? 0,
            phone,
            data: mappedData,
            excluded: false,
          }
        })

        console.log("=== ROWS PAYLOAD ===")
        console.log("Number of rows:", finalRows.length)
        console.log("First row:", JSON.stringify(finalRows[0], null, 2))
        console.log("Column mapping:", JSON.stringify(mapping, null, 2))

        await updateBatchRows(uploadData.batch_id, {
          mapping,
          rows: finalRows,
        })
      }

      // Step 2: Start the batch
      try {
        await startBatch(uploadData.batch_id, scheduleMode === "now"
          ? { concurrency, schedule_mode: "now" }
          : {
              concurrency,
              schedule_mode: "scheduled",
              timezone,
              calling_window_start: windowStart + ":00",
              calling_window_end: windowEnd + ":00",
              calling_window_days: callingDays,
              start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
            }
        )
      } catch (startErr) {
        const msg = startErr instanceof Error ? startErr.message : "Failed to start batch"
        if (msg.toLowerCase().includes("already_running") || msg.toLowerCase().includes("already running")) {
          toast.info("Batch is already running")
          batchStartedRef.current = true
          router.push("/batches")
          return
        }
        throw startErr
      }

      // Step 3: Navigate to batches list
      batchStartedRef.current = true
      router.push("/batches")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start batch")
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 px-1 pb-4">
        <Link
          href="/batches"
          className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Batches
        </Link>
        <h1 className="text-lg font-semibold">Create Batch Call</h1>
      </div>

      {/* Two-panel layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)]">
        {/* ── LEFT PANEL ── */}
        <div className="surface-card flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {/* Section 1: Batch Info */}
            <section className="space-y-4">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Batch Info
              </h3>
              <div className="space-y-1.5">
                <Label>Batch Call Name</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Agent <span className="text-red-500">*</span>
                </Label>
                {loadingAgents ? (
                  <Skeleton className="h-9 w-full rounded-lg" />
                ) : (
                  <Select
                    value={selectedAgent}
                    onValueChange={(v) => {
                      setSelectedAgent(v ?? "")
                      setUploadData(null)
                      setRows([])
                      setMapping({})
                      setSourceColumns([])
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedAgent && (
                <div className="space-y-1.5">
                  <Label>Outbound Number</Label>
                  {outboundPhone ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={14} className="shrink-0 text-emerald-600" />
                      <span className="font-mono text-muted-foreground">
                        {formatPhoneNumberLabel(outboundPhone)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                      <p className="text-sm text-amber-800">
                        No outbound number assigned to this agent.{" "}
                        <Link href="/phone-numbers" className="font-medium underline hover:text-amber-900">
                          Assign one
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Section 2: Upload Recipients */}
            {selectedAgent && (
              <section className="mt-6 space-y-4 border-t border-[#e8eaed] pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Upload Recipients
                  </h3>
                  {variables.length > 0 && (
                    <button
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-brand)] hover:underline"
                    >
                      <FileDown size={13} />
                      Download template
                    </button>
                  )}
                </div>
                <FileDropzone
                  onFileSelect={handleFileSelect}
                  disabled={!selectedAgent || !outboundPhone || uploading}
                />
                {uploading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Uploading and validating…
                  </div>
                )}
                {uploadError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {uploadError}
                  </p>
                )}
                {uploadData && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      {validRows.length} ready
                    </span>
                    {invalidRows.length > 0 && (
                      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        {invalidRows.length} invalid
                      </span>
                    )}
                    {rows.filter((r) => r.excluded).length > 0 && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        {rows.filter((r) => r.excluded).length} excluded
                      </span>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Section 3: Column Mapping */}
            {uploadData && sourceColumns.length > 0 && (
              <section className="mt-6 space-y-4 border-t border-[#e8eaed] pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Column Mapping
                  </h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {mappedVars.size} of {variables.length} variables mapped
                  </span>
                </div>

                {!phoneCol && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <XCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
                    <p className="text-sm text-red-700">
                      No phone number column detected. Please map one.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  {sourceColumns.map((col) => {
                    const target = mapping[col] ?? ""
                    const isPhone = target === "__phone__"
                    const isMatched = target && target !== "__skip__"
                    return (
                      <div key={col} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50/60">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {isPhone && <Check size={13} className="shrink-0 text-emerald-600" />}
                          {isMatched && !isPhone && <Check size={13} className="shrink-0 text-emerald-500/50" />}
                          {!isMatched && <div className="w-[13px] shrink-0" />}
                          <span className="min-w-0 truncate text-[13px]">{col}</span>
                        </div>
                        <div className="w-[170px] shrink-0">
                          <Select
                            value={target || "__skip__"}
                            onValueChange={(v) => handleMappingChange(col, v ?? "__skip__")}
                          >
                            <SelectTrigger className="h-8 bg-white text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__">
                                <span className="text-muted-foreground">Skip</span>
                              </SelectItem>
                              <SelectItem value="__phone__">
                                <span className="flex items-center gap-1.5">
                                  <Phone size={12} />
                                  Phone Number
                                </span>
                              </SelectItem>
                              {variables.map((v) => (
                                <SelectItem
                                  key={v}
                                  value={v}
                                  disabled={mappedVars.has(v) && mapping[col] !== v}
                                >
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {unmappedVars.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-[#e8eaed] pt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Unmapped variables
                    </p>
                    {unmappedVars.map((v) => (
                      <div key={v} className="flex items-center gap-2 px-2 py-0.5 text-[13px] text-muted-foreground">
                        <AlertTriangle size={12} className="shrink-0 text-amber-400" />
                        <span>{v}</span>
                        <span className="text-[11px] italic">— will be empty</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Schedule */}
            <section className="mt-6 space-y-3 border-t border-[#e8eaed] pt-6">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Schedule
              </h3>

              {/* Mode toggle */}
              <div className="flex rounded-lg border border-[#e8eaed] bg-white p-1">
                {(["now", "scheduled"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleScheduleModeChange(mode)}
                    className={cn(
                      "flex-1 rounded-md py-2 text-[13px] font-medium transition-all",
                      scheduleMode === mode
                        ? "bg-[var(--color-brand)] text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode === "now" ? "Send Now" : "Schedule"}
                  </button>
                ))}
              </div>

              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {scheduleMode === "now"
                  ? "Calls start immediately with no time restrictions."
                  : "Calls run only during the specified window."}
              </p>

              {scheduleMode === "scheduled" && (
                <button
                  type="button"
                  onClick={openScheduleModal}
                  className="group flex w-full items-center gap-3 rounded-lg border border-[#e8eaed] bg-white px-3.5 py-2.5 text-left transition-colors hover:border-[var(--color-brand)]/30 hover:bg-[var(--color-brand-light)]/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] text-foreground">
                      <CalendarIcon size={12} className="shrink-0 text-muted-foreground" />
                      <span>{startDate ? format(startDate, "MMM d") : "Today"}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <Clock size={12} className="shrink-0 text-muted-foreground" />
                      <span>{formatTimeLabel(windowStart)} – {formatTimeLabel(windowEnd)} {tzAbbrev(timezone)}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{formatDaysSummary(callingDays)}</span>
                    </p>
                  </div>
                  <Pencil size={13} className="shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--color-brand)]" />
                </button>
              )}

              <div className="mt-2 flex items-center justify-between rounded-lg border border-[#e8eaed] bg-white px-3.5 py-2.5">
                <Label className="text-[13px]">Concurrent Calls</Label>
                <NumberStepper value={concurrency} onChange={setConcurrency} />
              </div>
            </section>
          </div>

          {/* Sticky actions */}
          <div className="shrink-0 border-t border-[#e8eaed] bg-[var(--card)] px-5 py-4 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
            {uploadData && (
              <p className="mb-2.5 text-[11px] text-muted-foreground tabular-nums">
                {includedRows.length} recipient{includedRows.length !== 1 ? "s" : ""} · {mappedVars.size}/{variables.length} variables mapped
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="flex-1 bg-white"
                onClick={async () => {
                  if (batchIdRef.current && !batchStartedRef.current) {
                    await deleteDraftBatch(batchIdRef.current).catch(() => {})
                  }
                  router.push("/batches")
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStart}
                disabled={!canStart}
                className="flex-[1.4] bg-[var(--color-brand)] text-white shadow-sm hover:bg-[var(--color-brand-dark)]"
              >
                {starting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Starting…
                  </>
                ) : (
                  "Start Batch"
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="surface-card relative flex min-h-0 flex-col overflow-hidden">
          {!uploadData ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100/80">
                <FileDown size={24} className="text-muted-foreground/40" />
              </div>
              <h3 className="mt-4 text-[15px] font-medium">No data yet</h3>
              <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                Upload a CSV or Excel file to preview recipients
              </p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="min-h-0 flex-1 overflow-auto pt-2">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-[var(--card)]">
                    <tr className="border-b border-[#e8eaed]">
                      <th className="w-12 py-3.5 pl-4 pr-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        #
                      </th>
                      {displayColumns.map((col) => {
                        const target = mapping[col]
                        const isPhone = target === "__phone__"
                        const varName = isPhone ? "Phone Number" : target
                        return (
                          <th key={col} className="min-w-[150px] px-4 py-3.5 text-left">
                            <div className="flex items-center gap-1.5">
                              {isPhone && <Phone size={11} className="shrink-0 text-muted-foreground" />}
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                                {varName}
                              </span>
                            </div>
                            <span className="text-[10px] leading-tight text-muted-foreground/60">from: {col}</span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, localIdx) => {
                      const masterIdx = pageStart + localIdx
                      const isExcluded = row.excluded
                      const isSelected = selectedRows.has(masterIdx)
                      return (
                        <tr
                          key={row.index}
                          onClick={(e) => handleRowClick(masterIdx, e)}
                          className={cn(
                            "cursor-pointer border-b border-[#f0f0f0] transition-colors",
                            isExcluded
                              ? "opacity-35"
                              : isSelected
                                ? "bg-[var(--color-brand-light)]/60"
                                : "hover:bg-[var(--color-brand-light)]/60",
                            !isExcluded && !isSelected && (localIdx % 2 === 0 ? "bg-[#fafafa]" : "bg-[#eff0f1]")
                          )}
                        >
                          <td className="py-5 pl-4 pr-2 text-xs tabular-nums text-muted-foreground">
                            {row.index + 1}
                          </td>
                          {displayColumns.map((col) => {
                            const isPhone = mapping[col] === "__phone__"
                            const value = row.data[col] || ""
                            const isEditing = editingCell?.rowIdx === masterIdx && editingCell?.col === col
                            const wasEdited = row.edited.has(col)
                            const isInvalidPhone = isPhone && !row.phoneValid

                            return (
                              <td
                                key={col}
                                className={cn(
                                  "relative min-w-[150px] px-4 py-5",
                                  wasEdited && "border-l-2 border-l-[var(--color-brand)]",
                                  isInvalidPhone && "bg-red-50/60"
                                )}
                                onClick={() => {
                                  if (isExcluded) return
                                  setEditingCell({ rowIdx: masterIdx, col })
                                  setEditValue(value)
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    ref={editInputRef}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={commitEdit}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitEdit()
                                      if (e.key === "Escape") setEditingCell(null)
                                    }}
                                    className="h-8 w-full rounded-md border border-[var(--color-brand)] bg-white px-2 text-[13px] outline-none"
                                  />
                                ) : (
                                  <span
                                    className={cn(
                                      "block truncate",
                                      isPhone && "font-mono tracking-tight",
                                      isInvalidPhone && "text-red-600",
                                      !value && "text-muted-foreground"
                                    )}
                                    title={isInvalidPhone ? (row.phoneError ?? "Invalid") : undefined}
                                  >
                                    {isPhone && row.phoneValid
                                      ? formatPhone(row.phoneNormalized)
                                      : value || "\u2014"}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalTablePages > 1 && (
                <div className="flex shrink-0 items-center justify-between border-t border-[#e8eaed] px-4 py-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {pageStart + 1}–{Math.min(pageStart + TABLE_PAGE_SIZE, rows.length)} of {rows.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 bg-white px-2.5 text-xs"
                      disabled={tablePage === 0}
                      onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-muted-foreground">
                      {tablePage + 1} / {totalTablePages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 bg-white px-2.5 text-xs"
                      disabled={tablePage >= totalTablePages - 1}
                      onClick={() => setTablePage((p) => Math.min(totalTablePages - 1, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {/* Floating selection bar */}
              {selectedRows.size > 0 && (
                <div className="absolute inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-xl border border-[#e8eaed] bg-white px-4 py-2.5 shadow-lg">
                  <span className="text-[13px] font-medium tabular-nums">
                    {selectedRows.size} row{selectedRows.size !== 1 ? "s" : ""} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => { setSelectedRows(new Set()); lastClickedRowRef.current = null }}
                    >
                      Deselect
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={deleteSelectedRows}
                    >
                      <Trash2 size={13} />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Schedule editing modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={(v) => { setScheduleModalOpen(v); if (!v) setCalendarOpen(false) }}>
        <DialogContent className="gap-0 sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
          </DialogHeader>

          <div className="min-h-[360px] space-y-5 py-4">
            {/* Start Date */}
            <div>
              <Label className="mb-1.5 block text-[13px]">Start Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-10 w-full items-center gap-2 rounded-lg bg-secondary px-3.5 text-left text-sm transition-colors hover:bg-secondary/80",
                        !tmpStartDate && "text-muted-foreground"
                      )}
                    />
                  }
                >
                  <CalendarIcon size={14} className="shrink-0 text-muted-foreground" />
                  {tmpStartDate ? format(tmpStartDate, "MMM d, yyyy") : "Pick a date"}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="z-[100] w-auto p-0"
                >
                  <Calendar
                    mode="single"
                    selected={tmpStartDate}
                    onSelect={(d) => { setTmpStartDate(d); setCalendarOpen(false) }}
                    disabled={{ before: new Date() }}
                    defaultMonth={tmpStartDate ?? new Date()}
                    className="rounded-lg"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Timezone</Label>
              <Select value={tmpTimezone} onValueChange={setTmpTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock size={11} />
                Currently {currentTimeInTz(tmpTimezone)}
              </p>
            </div>

            {/* Calling Hours */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Calling Hours</Label>
              <div className="flex items-center gap-2">
                <Select value={tmpWindowStart} onValueChange={setTmpWindowStart}>
                  <SelectTrigger className="h-10 w-[140px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">to</span>
                <Select value={tmpWindowEnd} onValueChange={setTmpWindowEnd}>
                  <SelectTrigger className="h-10 w-[140px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Calling Days */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Calling Days</Label>
              <div className="flex gap-1">
                {ALL_DAYS.map((day) => {
                  const active = tmpCallingDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        if (active && tmpCallingDays.length === 1) {
                          toast.error("At least one calling day is required")
                          return
                        }
                        setTmpCallingDays((prev) =>
                          active ? prev.filter((d) => d !== day) : [...prev, day]
                        )
                      }}
                      className={cn(
                        "h-8 flex-1 rounded-md text-xs font-medium transition-colors",
                        active
                          ? "bg-[var(--color-brand)] text-white"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="-mx-6 -mb-6 mt-2 flex shrink-0 gap-3 rounded-b-2xl bg-secondary/50 px-6 py-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 basis-0 justify-center"
              onClick={() => setScheduleModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 basis-0 justify-center bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)]"
              onClick={saveScheduleModal}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
