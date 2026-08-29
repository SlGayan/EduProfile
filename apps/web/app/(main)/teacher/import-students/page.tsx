"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Loader2, Upload } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"

const TEMPLATE_COLUMNS = [
  "email",
  "fullName",
  "indexNumber",
  "dateOfBirth",
  "address",
  "nicNumber",
  "gender",
  "olYear",
  "alYear",
]

interface ImportedStudent {
  indexNumber: string
  fullName: string
  email: string
  status: "created" | "updated"
}

interface ImportSuccess {
  message: string
  created: number
  updated: number
  students: ImportedStudent[]
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
  link.download = "student-import-template.csv"
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

  if (Array.isArray(data.rowErrors)) {
    return {
      title: "Some rows failed validation",
      details: (data.rowErrors as { row: number; errors: string[] }[]).map(
        (r) => `Row ${r.row}: ${r.errors.join("; ")}`
      ),
    }
  }

  if (Array.isArray(data.missingColumns) || Array.isArray(data.unexpectedColumns)) {
    const details: string[] = []
    const missing = (data.missingColumns as string[]) || []
    const unexpected = (data.unexpectedColumns as string[]) || []
    if (missing.length > 0) details.push(`Missing columns: ${missing.join(", ")}`)
    if (unexpected.length > 0) details.push(`Unexpected columns: ${unexpected.join(", ")}`)
    return { title: "CSV header does not match the expected columns", details }
  }

  if (Array.isArray(data.duplicateIndexNumbers)) {
    return {
      title: "CSV contains duplicate index numbers",
      details: [(data.duplicateIndexNumbers as string[]).join(", ")],
    }
  }

  return {
    title: (data.error as string) || "Import failed",
    details: [],
  }
}

export default function ImportStudentsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<ImportErrorInfo | null>(null)
  const [lastResult, setLastResult] = useState<ImportSuccess | null>(null)

  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportSuccess> => {
      if (!file) throw new Error("No file selected")

      const user = getCurrentUser()
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        body: formData,
      })

      if (!res.ok) {
        const errorInfo = await buildImportError(res)
        throw errorInfo
      }

      return res.json()
    },
    onMutate: () => {
      setImportError(null)
      setLastResult(null)
    },
    onSuccess: (data) => {
      setLastResult(data)
      toast.success(`Import completed: ${data.created} created, ${data.updated} updated`)
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
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Import Student Data</h1>
        <p className="text-muted-foreground">Bulk import student information using a CSV file.</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Student Data</CardTitle>
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
              <p className="font-medium">Fill in the student data</p>
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
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
            <div className="space-y-3">
              <Alert>
                <AlertTitle>{lastResult.message}</AlertTitle>
                <AlertDescription>
                  Created {lastResult.created}, updated {lastResult.updated}.
                </AlertDescription>
              </Alert>

              {lastResult.students.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Index Number</TableHead>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lastResult.students.map((s) => (
                        <TableRow key={s.indexNumber}>
                          <TableCell className="font-medium">{s.indexNumber}</TableCell>
                          <TableCell>{s.fullName}</TableCell>
                          <TableCell>{s.email}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={s.status === "created" ? "default" : "secondary"}>{s.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
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
            Start Import
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
