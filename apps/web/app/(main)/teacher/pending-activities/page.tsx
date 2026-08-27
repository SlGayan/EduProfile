"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, FileCheck, Check, X, MessageSquareWarning, Loader2, Paperclip } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { formatDateRange, fetchPendingActivities, type Activity } from "@/lib/activities"
import { toDateInputValue, fetchPendingStudentCertificates, type StudentCertificate } from "@/lib/studentCertificates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

/**
 * Activities and self-added certificates are the same review workflow
 * wearing two data shapes (PENDING/APPROVED/NEEDS_CORRECTION/REJECTED, a
 * teacher-authored note, one endpoint per kind) — this page normalizes both
 * into one shape so a teacher reviews everything submitted by their students
 * in a single list, rather than two separate screens for the same action.
 */
interface PendingItem {
  kind: "ACTIVITY" | "CERTIFICATE"
  id: string
  studentName?: string
  admissionNumber?: string | null
  title: string
  subtitle: string
  date: string
  dateRange?: string
  description?: string | null
  evidenceUrl?: string | null
  hasFile: boolean
}

function normalizeActivity(activity: Activity): PendingItem {
  return {
    kind: "ACTIVITY",
    id: activity.id,
    studentName: activity.studentName,
    admissionNumber: activity.admissionNumber,
    title: activity.activityName,
    subtitle: activity.activityType,
    date: activity.startDate,
    dateRange: formatDateRange(activity.startDate, activity.endDate),
    description: activity.description,
    evidenceUrl: activity.evidenceUrl,
    hasFile: false,
  }
}

function normalizeCertificate(certificate: StudentCertificate): PendingItem {
  return {
    kind: "CERTIFICATE",
    id: certificate.id,
    studentName: certificate.studentName,
    admissionNumber: certificate.admissionNumber,
    title: certificate.title,
    subtitle: certificate.category ?? certificate.issuingOrganization,
    date: certificate.issueDate,
    description: certificate.description,
    evidenceUrl: certificate.evidenceUrl,
    hasFile: Boolean(certificate.fileUrl),
  }
}

async function downloadCertificateFile(item: PendingItem) {
  let res: Response
  try {
    res = await apiFetch(`/api/student-certificates/${item.id}/file`)
  } catch {
    toast.error("Failed to download file")
    return
  }
  if (!res.ok) {
    toast.error("Failed to download file")
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = item.title
  link.click()
  URL.revokeObjectURL(url)
}

function ReviewActionDialog({ item, open, onOpenChange, actionType, onSuccess }: {
  item: PendingItem | null,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  actionType: "APPROVE" | "REJECT" | "NEEDS_CORRECTION",
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      if (!item) return

      const payload = {
        status: actionType === "APPROVE" ? "APPROVED" : actionType,
        teacherNote: note || undefined
      }

      const endpoint = item.kind === "ACTIVITY"
        ? `/api/activities/${item.id}/status`
        : `/api/student-certificates/${item.id}/status`

      const response = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to ${actionType.toLowerCase()} submission`)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-activities"] })
      queryClient.invalidateQueries({ queryKey: ["pending-student-certificates"] })
      toast.success(`${item?.kind === "ACTIVITY" ? "Activity" : "Certificate"} ${actionType.toLowerCase()}d successfully`)
      onSuccess()
      setNote("")
    },
    onError: (error) => {
      toast.error(error.message || `Failed to ${actionType.toLowerCase()} submission`)
    },
  })

  if (!item) return null

  const noun = item.kind === "ACTIVITY" ? "Activity" : "Certificate"

  const titles = {
    APPROVE: `Approve ${noun}`,
    REJECT: `Reject ${noun}`,
    NEEDS_CORRECTION: "Request Correction",
  }

  const descriptions = {
    APPROVE: `Are you sure you want to approve this ${noun.toLowerCase()} for ${item.studentName}?`,
    REJECT: `Are you sure you want to reject this ${noun.toLowerCase()}? It will not be shown on the student's profile.`,
    NEEDS_CORRECTION: `What needs to be corrected by the student?`,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[actionType]}</DialogTitle>
          <DialogDescription>{descriptions[actionType]}</DialogDescription>
        </DialogHeader>

        {actionType !== "APPROVE" && (
          <div className="grid gap-2 py-4">
            <Label htmlFor="note">Teacher Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the reason..."
              required={actionType === "NEEDS_CORRECTION"}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={actionType === "APPROVE" ? "default" : "destructive"}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (actionType === "NEEDS_CORRECTION" && !note.trim())}
          >
            {mutation.isPending ? "Saving..." : titles[actionType].split(" ")[0]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PendingActivitiesPage() {
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null)
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | "NEEDS_CORRECTION">("APPROVE")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const activitiesQuery = useQuery({
    queryKey: ["pending-activities"],
    queryFn: fetchPendingActivities,
    retry: false,
  })
  const certificatesQuery = useQuery({
    queryKey: ["pending-student-certificates"],
    queryFn: fetchPendingStudentCertificates,
    retry: false,
  })

  const isLoading = activitiesQuery.isLoading || certificatesQuery.isLoading
  const error = activitiesQuery.error || certificatesQuery.error

  const items: PendingItem[] = [
    ...(activitiesQuery.data ?? []).map(normalizeActivity),
    ...(certificatesQuery.data ?? []).map(normalizeCertificate),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const openDialog = (item: PendingItem, action: "APPROVE" | "REJECT" | "NEEDS_CORRECTION") => {
    setSelectedItem(item)
    setActionType(action)
    setDialogOpen(true)
  }

  async function handleDownload(item: PendingItem) {
    if (downloadingId) return
    setDownloadingId(item.id)
    try {
      await downloadCertificateFile(item)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Pending Approvals</h1>

      <Card>
        <CardHeader>
          <CardTitle>Needs Review</CardTitle>
          <CardDescription>Activities and certificates submitted by students in your classes</CardDescription>
        </CardHeader>
        <CardContent>
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
                {error instanceof Error ? error.message : "Failed to load pending submissions."}
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileCheck className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">
                There are no pending activities or certificates to review at this time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`${item.kind}-${item.id}`}>
                      <TableCell className="font-medium">
                        {item.studentName}
                        <div className="text-xs text-muted-foreground">{item.admissionNumber}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.kind === "ACTIVITY" ? "Activity" : "Certificate"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.title}</div>
                        {item.description && <div className="text-sm text-muted-foreground line-clamp-1">{item.description}</div>}
                      </TableCell>
                      <TableCell>{item.subtitle}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.dateRange ?? toDateInputValue(item.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {item.evidenceUrl && (
                            <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              Link
                            </a>
                          )}
                          {item.hasFile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-primary hover:underline"
                              disabled={downloadingId === item.id}
                              onClick={() => handleDownload(item)}
                            >
                              {downloadingId === item.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Paperclip className="mr-1 h-3 w-3" />
                              )}
                              File
                            </Button>
                          )}
                          {!item.evidenceUrl && !item.hasFile && "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openDialog(item, "APPROVE")} title="Approve">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => openDialog(item, "NEEDS_CORRECTION")} title="Request Correction">
                            <MessageSquareWarning className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => openDialog(item, "REJECT")} title="Reject">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReviewActionDialog
        item={selectedItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        actionType={actionType}
        onSuccess={() => setDialogOpen(false)}
      />
    </div>
  )
}
