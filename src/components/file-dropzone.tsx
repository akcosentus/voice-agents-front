"use client"

import { useCallback, useState } from "react"
import { Upload, FileSpreadsheet, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  accept?: string
  disabled?: boolean
}

export function FileDropzone({ onFileSelect, accept = ".xlsx,.csv", disabled }: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) {
        setSelectedFile(file)
        onFileSelect(file)
      }
    },
    [onFileSelect, disabled]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        setSelectedFile(file)
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const handleClear = useCallback(() => {
    setSelectedFile(null)
  }, [])

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <FileSpreadsheet size={24} className="shrink-0 text-[var(--color-brand)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors",
        dragOver
          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
          : "border-border hover:border-[var(--color-brand)] hover:bg-muted/50",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <Upload size={32} className="text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">
          Drop your file here, or{" "}
          <span className="text-[var(--color-brand)]">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Supports .xlsx and .csv files
        </p>
      </div>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
    </label>
  )
}
