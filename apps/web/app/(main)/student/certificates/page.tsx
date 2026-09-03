"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Download, Loader2, ScrollText } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/apiFetch"
import { encodeCertificateId } from "@/lib/certificates"

interface Certificate {
  id: string
  issuedAt: string
  characterGrade: "GOOD" | "VERY_GOOD" | "EXCELLENT" | null
}

async function fetchMyCertificates(): Promise<Certificate[]> {
  const response = await apiFetch("/api/students/me/certificates")
  if (!response.ok) {
    let message = "Failed to load certificates"
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
  return data as Certificate[]
}

async function downloadCertificate(certificate: Certificate) {
  let res: Response
  try {
    res = await apiFetch(`/api/students/me/certificates/${encodeCertificateId(certificate.id)}/pdf`)
  } catch {
    toast.error("Failed to download certificate")
    return
  }
  if (!res.ok) {
    toast.error("Failed to download certificate")
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `Character_Certificate_${certificate.id.replace(/\//g, "_")}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}

function GradeBadge({ grade }: { grade?: Certificate["characterGrade"] }) {
  if (!grade) return <span className="text-muted-foreground">—</span>

  switch (grade) {
    case "EXCELLENT":
      return <Badge className="bg-green-600 hover:bg-green-700">Excellent</Badge>
    case "VERY_GOOD":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-200">Very Good</Badge>
    case "GOOD":
      return <Badge variant="secondary">Good</Badge>
    default:
      return <Badge variant="secondary">{grade}</Badge>
  }
}

export default function StudentCertificatesPage() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const {
    data: certificates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-certificates"],
    queryFn: fetchMyCertificates,
    retry: false,
  })

  async function handleDownload(certificate: Certificate) {
    if (downloadingId) return
    setDownloadingId(certificate.id)
    try {
      await downloadCertificate(certificate)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Character Certificates</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Character Certificates</CardTitle>
          <CardDescription>Certificates issued to you by the principal&apos;s office</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : "Failed to load certificates. Please try again later."}
              </AlertDescription>
            </Alert>
          ) : !certificates || certificates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ScrollText className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No certificates issued yet</p>
              <p className="text-sm text-muted-foreground">
                Your principal&apos;s office hasn&apos;t issued any character certificates for you yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference No.</TableHead>
                    <TableHead>Issued On</TableHead>
                    <TableHead>Character Grade</TableHead>
                    <TableHead className="w-[140px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((certificate) => (
                    <TableRow key={certificate.id}>
                      <TableCell className="font-medium">{certificate.id}</TableCell>
                      <TableCell>{new Date(certificate.issuedAt).toLocaleDateString()}</TableCell>
                      <TableCell><GradeBadge grade={certificate.characterGrade} /></TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === certificate.id}
                          onClick={() => handleDownload(certificate)}
                        >
                          {downloadingId === certificate.id ? (
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
        </CardContent>
      </Card>
    </div>
  )
}
