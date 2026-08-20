"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, Download, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/apiFetch"
import type { StudyMaterial } from "@/lib/materials"

async function fetchMyMaterials(): Promise<StudyMaterial[]> {
  const response = await apiFetch("/api/students/me/materials")
  if (!response.ok) {
    let message = "Failed to load materials"
    try {
      const data = await response.json()
      if (typeof data?.error === "string") message = data.error
    } catch {
      // no JSON body
    }
    throw new Error(message)
  }
  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response from server")
  }
  return data as StudyMaterial[]
}

// fileUrl always carries the real extension (e.g. /uploads/study-materials/<uuid>.pdf) —
// the server's Content-Disposition filename isn't visible to the browser once the
// response is consumed as a blob, so the extension has to be re-derived here too.
function extensionFromFileUrl(fileUrl: string): string {
  const match = /\.[^./\\]+$/.exec(fileUrl)
  return match ? match[0] : ""
}

async function downloadMaterial(material: StudyMaterial) {
  let res: Response
  try {
    res = await apiFetch(`/api/materials/${material.id}/download`)
  } catch {
    toast.error("Failed to download material")
    return
  }
  if (!res.ok) {
    toast.error("Failed to download material")
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${material.title}${extensionFromFileUrl(material.fileUrl)}`
  link.click()
  URL.revokeObjectURL(url)
}

// No role guard here by design: middleware.ts already redirects any non-student
// away from /student/*, matching the sibling student/activities and
// student/marks pages — a second in-page check would diverge from that.
export default function StudentMaterialsPage() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const {
    data: materials,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-materials"],
    queryFn: fetchMyMaterials,
    retry: false,
  })

  async function handleDownload(material: StudyMaterial) {
    if (downloadingId) return
    setDownloadingId(material.id)
    try {
      await downloadMaterial(material)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight">My Study Materials</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load materials. Please try again later."}
          </AlertDescription>
        </Alert>
      ) : !materials || materials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">No materials available yet</p>
          <p className="text-sm text-muted-foreground">
            Your teachers haven&apos;t uploaded any study materials for your classes or subjects.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="font-medium">{material.title}</TableCell>
                  <TableCell>{material.fileType}</TableCell>
                  <TableCell>{new Date(material.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingId === material.id}
                      onClick={() => handleDownload(material)}
                    >
                      {downloadingId === material.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
