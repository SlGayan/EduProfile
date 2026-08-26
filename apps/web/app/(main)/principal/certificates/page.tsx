"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { apiFetch } from "@/lib/apiFetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileDown, FileText, Search, AlertCircle, Calendar } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CertificateStudent {
  fullName: string
  indexNumber: string
}

interface Certificate {
  id: string
  issuedAt: string
  student: CertificateStudent
}

export default function CertificatesListPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const { toast } = useToast()

  const { data: certificates, isLoading, error } = useQuery<Certificate[]>({
    queryKey: ["certificates"],
    queryFn: async () => {
      const res = await apiFetch("/api/certificates")
      if (!res.ok) throw new Error("Failed to load certificates")
      return res.json()
    }
  })

  const filteredCertificates = certificates?.filter((cert) =>
    cert.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cert.student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cert.student.indexNumber.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDownload = async (certId: string) => {
    try {
      const res = await apiFetch(`/api/certificates/${encodeURIComponent(certId)}/pdf`)
      if (!res.ok) throw new Error("Failed to download certificate")
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Character_Certificate_${certId.replace(/\//g, "_")}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: err instanceof Error ? err.message : "An unknown error occurred",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Issued Certificates</h1>
          <p className="text-muted-foreground">View and download previously issued character certificates.</p>
        </div>
        <Link href="/principal/issue-certificate">
          <Button>
            <FileText className="mr-2 h-4 w-4" />
            Issue New Certificate
          </Button>
        </Link>
      </div>

      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          id="certificate-search"
          name="certificateSearch"
          aria-label="Search certificates by reference number, student name, or index"
          placeholder="Search by Ref No, Student Name, or Index..."
          className="max-w-md"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : "Failed to load certificates"}
              </AlertDescription>
            </Alert>
          </div>
        ) : filteredCertificates && filteredCertificates.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference No</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Index</TableHead>
                <TableHead>Issued Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCertificates.map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell className="font-medium">{cert.id}</TableCell>
                  <TableCell>{cert.student.fullName}</TableCell>
                  <TableCell>{cert.student.indexNumber}</TableCell>
                  <TableCell>
                    <div className="flex items-center text-muted-foreground">
                      <Calendar className="mr-2 h-4 w-4" />
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(cert.id)}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">
              {certificates && certificates.length > 0
                ? "No certificates match your search."
                : "No certificates found."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
