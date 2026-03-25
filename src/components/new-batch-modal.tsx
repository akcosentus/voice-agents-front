"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import { FileDropzone } from "@/components/file-dropzone"
import { uploadBatch, startBatch, getBatchStatus, downloadResults, getAgents } from "@/lib/api"
import type { UploadResponse, BatchStatusResponse } from "@/lib/types"
import { Plus, Download, ChevronDown, ChevronUp, Loader2, CheckCircle2 } from "lucide-react"
import { formatPhone } from "@/lib/utils"

type Step = "upload" | "validation" | "running" | "complete"

export function NewBatchModal({ onBatchCreated }: { onBatchCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("upload")
  const [agents, setAgents] = useState<string[]>([])
  const [selectedAgent, setSelectedAgent] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [concurrency, setConcurrency] = useState(1)
  const [starting, setStarting] = useState(false)
  const [batchStatus, setBatchStatus] = useState<BatchStatusResponse | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (open) {
      getAgents()
        .then(setAgents)
        .catch(() => setAgents([]))
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const resetModal = useCallback(() => {
    setStep("upload")
    setSelectedAgent("")
    setUploading(false)
    setUploadData(null)
    setShowAdvanced(false)
    setConcurrency(1)
    setStarting(false)
    setBatchStatus(null)
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const handleFileSelect = async (file: File) => {
    if (!selectedAgent) return
    setUploading(true)
    try {
      const data = await uploadBatch(file, selectedAgent)
      setUploadData(data)
      setStep("validation")
    } catch {
      // TODO: show error toast
    } finally {
      setUploading(false)
    }
  }

  const handleStart = async () => {
    if (!uploadData) return
    setStarting(true)
    try {
      await startBatch(uploadData.batch_id, concurrency)
      setStep("running")
      setBatchStatus({
        batch_id: uploadData.batch_id,
        status: "running",
        total: uploadData.summary.total,
        completed: 0,
        failed: 0,
      })

      pollRef.current = setInterval(async () => {
        try {
          const status = await getBatchStatus(uploadData.batch_id)
          setBatchStatus(status)
          if (status.status === "completed" || status.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current)
            setStep("complete")
            onBatchCreated?.()
          }
        } catch {
          // polling error, keep trying
        }
      }, 5000)
    } catch {
      // TODO: show error toast
    } finally {
      setStarting(false)
    }
  }

  const handleDownload = async () => {
    if (!uploadData) return
    const blob = await downloadResults(uploadData.batch_id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `batch-${uploadData.batch_id}-results.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const progressPercent = batchStatus
    ? Math.round(((batchStatus.completed + batchStatus.failed) / batchStatus.total) * 100)
    : 0

  const hasInvalid = uploadData?.summary.invalid ? uploadData.summary.invalid > 0 : false

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val)
        if (!val) resetModal()
      }}
    >
      <DialogTrigger
        render={<Button className="bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white" />}
      >
        <Plus size={16} className="mr-2" />
        New Batch
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Create New Batch"}
            {step === "validation" && "Validation Results"}
            {step === "running" && "Batch Running"}
            {step === "complete" && "Batch Complete"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={selectedAgent} onValueChange={(val) => setSelectedAgent(val ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Upload File</Label>
              <FileDropzone
                onFileSelect={handleFileSelect}
                disabled={!selectedAgent || uploading}
              />
              {uploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Uploading and validating…
                </div>
              )}
            </div>
          </div>
        )}

        {step === "validation" && uploadData && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                {uploadData.summary.valid} ready
              </span>
              {uploadData.summary.fixable > 0 && (
                <span className="rounded-md bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                  {uploadData.summary.fixable} need fixes
                </span>
              )}
              {uploadData.summary.invalid > 0 && (
                <span className="rounded-md bg-red-50 px-2.5 py-1 font-medium text-red-700">
                  {uploadData.summary.invalid} invalid
                </span>
              )}
            </div>

            <div className="max-h-[300px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Normalized</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadData.rows.map((row) => (
                    <TableRow key={row.index}>
                      <TableCell className="text-muted-foreground">{row.index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{row.phone_raw}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatPhone(row.phone_normalized)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-xs text-red-600">
                        {row.error || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Advanced
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-2">
                  <Label className="text-xs">Concurrency</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    className="w-24"
                  />
                </div>
              )}
            </div>

            <Button
              onClick={handleStart}
              disabled={hasInvalid || starting}
              className="w-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white"
            >
              {starting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Starting…
                </>
              ) : (
                `Start Batch (${uploadData.summary.total} calls)`
              )}
            </Button>
          </div>
        )}

        {step === "running" && batchStatus && (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {batchStatus.completed + batchStatus.failed} / {batchStatus.total}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2.5" />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span>
                <span className="font-medium text-emerald-600">{batchStatus.completed}</span>{" "}
                completed
              </span>
              {batchStatus.failed > 0 && (
                <span>
                  <span className="font-medium text-red-600">{batchStatus.failed}</span> failed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Calls in progress… Polling every 5 seconds.
            </div>
          </div>
        )}

        {step === "complete" && batchStatus && (
          <div className="space-y-5 pt-2 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
            <div>
              <p className="text-lg font-semibold">Batch Complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {batchStatus.completed} completed, {batchStatus.failed} failed out of{" "}
                {batchStatus.total} total calls.
              </p>
            </div>
            <Button onClick={handleDownload} variant="outline" className="gap-2">
              <Download size={16} />
              Download Results
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
