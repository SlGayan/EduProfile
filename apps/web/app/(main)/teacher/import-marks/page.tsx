"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Download, Loader2, Upload } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"

const TEMPLATE_COLUMNS = ["studentIndexNumber", "subjectName", "term", "year", "marks"]

interface ImportSuccess {
  message: string
}

interface ImportErrorInfo {
  title: string
  details: string[]
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_COLUMNS.join(",") + "\n"], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "marks-import-template.csv"
  link.click()
  URL.revokeObjectURL(url)
}

async function buildImportError(res: Response): Promise<ImportErrorInfo> {
  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    // no JSON body
  }

  if (data.error === "CSV Validation failed" && Array.isArray(data.details)) {
    const rows = data.details as unknown[]
    const validRows = rows.filter(
      (d): d is { row: number; issues: { message: string }[] } =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as { row?: unknown }).row === "number" &&
        Array.isArray((d as { issues?: unknown }).issues) &&
        (d as { issues: unknown[] }).issues.every(
          (i) => typeof i === "object" && i !== null && typeof (i as { message?: unknown }).message === "string"
        )
    )

    if (validRows.length > 0) {
      return {
        title: "Some rows failed validation",
        details: validRows.map((d) => `Row ${d.row}: ${d.issues.map((i) => i.message).join("; ")}`),
      }
    }
  }

  if (typeof data.error === "string" && typeof data.details === "string") {
    return { title: data.error, details: [data.details] }
  }

  return {
    title: typeof data.error === "string" ? data.error : "Import failed",
    details: [],
  }
}

export default function ImportMarksPage() {
  const [file, setFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<ImportErrorInfo | null>(null)
  const [lastResult, setLastResult] = useState<ImportSuccess | null>(null)

  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportSuccess> => {
      if (!file) throw new Error("No file selected")

      const user = getCurrentUser()
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/marks/import", {
        method: "POST",
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        body: formData,
      })

      if (!res.ok) {
        const errorInfo = await buildImportError(res)
        throw errorInfo
      }

      try {
        return await res.json()
      } catch {
        throw { title: "Import failed", details: [] } satisfies ImportErrorInfo
      }
    },
    onMutate: () => {
      setImportError(null)
      setLastResult(null)
    },
    onSuccess: (data) => {
      setLastResult(data)
      toast.success(data.message)
      setFile(null)
    },
    onError: (err: ImportErrorInfo | Error) => {
      const info: ImportErrorInfo =
        "title" in err ? err : { title: err.message || "Import failed", details: [] }
      setImportError(info)
      toast.error(info.title)
    },
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Import Marks</h1>
        <p className="text-muted-foreground">Bulk import term test marks for your class using a CSV file.</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Class Marks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                1
              </span>
              <div className="space-y-2">
                <p className="font-medium">Download the template</p>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full sm:w-auto">
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV Template
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                2
              </span>
              <p className="font-medium">Fill in the marks data</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                3
              </span>
              <div className="flex-1 space-y-2">
                <p className="font-medium">Upload the file below</p>
                <div className="space-y-2">
                  <Label htmlFor="file-upload">CSV File</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".csv"
                      className="cursor-pointer w-full"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null)
                        setImportError(null)
                        setLastResult(null)
                      }}
                    />
                  </div>
                  {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
                </div>
              </div>
            </div>
          </div>

          {importError && (
            <Alert variant="destructive">
              <AlertTitle>{importError.title}</AlertTitle>
              {importError.details.length > 0 && (
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {importError.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}

          {lastResult && !importError && (
            <Alert>
              <AlertTitle>{lastResult.message}</AlertTitle>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            disabled={!file || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import Marks
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
