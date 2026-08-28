"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, FileCheck, Check, X, MessageSquareWarning, UserCog, Loader2, Paperclip, Award } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { formatDateRange, fetchPendingActivities, type Activity } from "@/lib/activities"
import { toDateInputValue, fetchPendingStudentCertificates, type StudentCertificate } from "@/lib/studentCertificates"
import { TablePagination, TABLE_PAGE_SIZE } from "@/components/table-pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Activities tab — moved verbatim from the old pending-activities/page.tsx.
// ---------------------------------------------------------------------------

function ReviewActionDialog({ activity, open, onOpenChange, actionType, onSuccess }: {
  activity: Activity | null,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  actionType: "APPROVE" | "REJECT" | "NEEDS_CORRECTION",
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activity) return

      const payload = {
        status: actionType === "APPROVE" ? "APPROVED" : actionType,
        teacherNote: note || undefined
      }

      const response = await apiFetch(`/api/activities/${activity.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to ${actionType.toLowerCase()} activity`)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-activities"] })
      toast.success(`Activity ${actionType.toLowerCase()}d successfully`)
      onSuccess()
      setNote("")
    },
    onError: (error) => {
      toast.error(error.message || `Failed to ${actionType.toLowerCase()} activity`)
    },
  })

  if (!activity) return null

  const titles = {
    APPROVE: "Approve Activity",
    REJECT: "Reject Activity",
    NEEDS_CORRECTION: "Request Correction",
  }

  const descriptions = {
    APPROVE: `Are you sure you want to approve this activity for ${activity.studentName}?`,
    REJECT: `Are you sure you want to reject this activity? It will not be shown on the student's profile.`,
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

function ActivitiesTab() {
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | "NEEDS_CORRECTION">("APPROVE")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [page, setPage] = useState(1)

  const {
    data: activities,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["pending-activities"],
    queryFn: fetchPendingActivities,
    retry: false,
  })

  const openDialog = (activity: Activity, action: "APPROVE" | "REJECT" | "NEEDS_CORRECTION") => {
    setSelectedActivity(activity)
    setActionType(action)
    setDialogOpen(true)
  }

  const pageCount = Math.max(1, Math.ceil((activities?.length ?? 0) / TABLE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedActivities = (activities ?? []).slice(
    (currentPage - 1) * TABLE_PAGE_SIZE,
    currentPage * TABLE_PAGE_SIZE
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Needs Review</CardTitle>
          <CardDescription>Activities submitted by students in your classes</CardDescription>
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
                {error instanceof Error ? error.message : "Failed to load pending activities."}
              </AlertDescription>
            </Alert>
          ) : !activities || activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileCheck className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">
                There are no pending activities to review at this time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedActivities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">
                        {activity.studentName}
                        <div className="text-xs text-muted-foreground">{activity.admissionNumber}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{activity.activityName}</div>
                        {activity.description && <div className="text-sm text-muted-foreground line-clamp-1">{activity.description}</div>}
                      </TableCell>
                      <TableCell>{activity.activityType}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateRange(activity.startDate, activity.endDate)}
                      </TableCell>
                      <TableCell>
                        {activity.evidenceUrl ? (
                          <a href={activity.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            View Link
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openDialog(activity, "APPROVE")} title="Approve">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => openDialog(activity, "NEEDS_CORRECTION")} title="Request Correction">
                            <MessageSquareWarning className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => openDialog(activity, "REJECT")} title="Reject">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>

      <ReviewActionDialog
        activity={selectedActivity}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        actionType={actionType}
        onSuccess={() => setDialogOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Certificates tab — self-added student certificates (course/competition
// certificates), carried over from the old pending-activities/page.tsx's
// unified list and split into its own tab so it keeps the Activities tab's
// contract (and this page's existing test coverage) unchanged.
// ---------------------------------------------------------------------------

async function downloadCertificateFile(certificate: StudentCertificate) {
  let res: Response
  try {
    res = await apiFetch(`/api/student-certificates/${certificate.id}/file`)
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
  link.download = certificate.title
  link.click()
  URL.revokeObjectURL(url)
}

function ReviewCertificateDialog({ certificate, open, onOpenChange, actionType, onSuccess }: {
  certificate: StudentCertificate | null,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  actionType: "APPROVE" | "REJECT" | "NEEDS_CORRECTION",
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      if (!certificate) return

      const payload = {
        status: actionType === "APPROVE" ? "APPROVED" : actionType,
        teacherNote: note || undefined
      }

      const response = await apiFetch(`/api/student-certificates/${certificate.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to ${actionType.toLowerCase()} certificate`)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-student-certificates"] })
      toast.success(`Certificate ${actionType.toLowerCase()}d successfully`)
      onSuccess()
      setNote("")
    },
    onError: (error) => {
      toast.error(error.message || `Failed to ${actionType.toLowerCase()} certificate`)
    },
  })

  if (!certificate) return null

  const titles = {
    APPROVE: "Approve Certificate",
    REJECT: "Reject Certificate",
    NEEDS_CORRECTION: "Request Correction",
  }

  const descriptions = {
    APPROVE: `Are you sure you want to approve this certificate for ${certificate.studentName}?`,
    REJECT: `Are you sure you want to reject this certificate? It will not be shown on the student's profile.`,
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
            <Label htmlFor="certNote">Teacher Note</Label>
            <Textarea
              id="certNote"
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

function CertificatesTab() {
  const [selectedCertificate, setSelectedCertificate] = useState<StudentCertificate | null>(null)
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | "NEEDS_CORRECTION">("APPROVE")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const {
    data: certificates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["pending-student-certificates"],
    queryFn: fetchPendingStudentCertificates,
    retry: false,
  })

  const openDialog = (certificate: StudentCertificate, action: "APPROVE" | "REJECT" | "NEEDS_CORRECTION") => {
    setSelectedCertificate(certificate)
    setActionType(action)
    setDialogOpen(true)
  }

  async function handleDownload(certificate: StudentCertificate) {
    if (downloadingId) return
    setDownloadingId(certificate.id)
    try {
      await downloadCertificateFile(certificate)
    } finally {
      setDownloadingId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil((certificates?.length ?? 0) / TABLE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedCertificates = (certificates ?? []).slice(
    (currentPage - 1) * TABLE_PAGE_SIZE,
    currentPage * TABLE_PAGE_SIZE
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Needs Review</CardTitle>
          <CardDescription>Self-added certificates submitted by students in your classes</CardDescription>
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
                {error instanceof Error ? error.message : "Failed to load pending certificates."}
              </AlertDescription>
            </Alert>
          ) : !certificates || certificates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileCheck className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">
                There are no pending certificates to review at this time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCertificates.map((certificate) => (
                    <TableRow key={certificate.id}>
                      <TableCell className="font-medium">
                        {certificate.studentName}
                        <div className="text-xs text-muted-foreground">{certificate.admissionNumber}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{certificate.title}</div>
                        {certificate.description && <div className="text-sm text-muted-foreground line-clamp-1">{certificate.description}</div>}
                      </TableCell>
                      <TableCell>{certificate.category ?? certificate.issuingOrganization}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {toDateInputValue(certificate.issueDate)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {certificate.evidenceUrl && (
                            <a href={certificate.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              Link
                            </a>
                          )}
                          {certificate.fileUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-primary hover:underline"
                              disabled={downloadingId === certificate.id}
                              onClick={() => handleDownload(certificate)}
                            >
                              {downloadingId === certificate.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Paperclip className="mr-1 h-3 w-3" />
                              )}
                              File
                            </Button>
                          )}
                          {!certificate.evidenceUrl && !certificate.fileUrl && "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openDialog(certificate, "APPROVE")} title="Approve">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => openDialog(certificate, "NEEDS_CORRECTION")} title="Request Correction">
                            <MessageSquareWarning className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => openDialog(certificate, "REJECT")} title="Reject">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>

      <ReviewCertificateDialog
        certificate={selectedCertificate}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        actionType={actionType}
        onSuccess={() => setDialogOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Profile Updates tab — Story 12.2.
// ---------------------------------------------------------------------------

interface ProfileEditRequest {
  id: string
  studentId: string
  requestedPhoneNumber: string | null
  requestedAddress: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  teacherNote: string | null
  createdAt: string
  studentName: string
  admissionNumber: string | null
}

async function fetchPendingProfileRequests(): Promise<ProfileEditRequest[]> {
  const response = await apiFetch("/api/teachers/me/profile-requests")
  if (!response.ok) {
    throw new Error("Failed to load pending profile requests")
  }
  return response.json()
}

function ReviewProfileRequestDialog({
  profileRequest,
  open,
  onOpenChange,
  actionType,
  onSuccess,
}: {
  profileRequest: ProfileEditRequest | null
  open: boolean
  onOpenChange: (open: boolean) => void
  actionType: "APPROVE" | "REJECT"
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profileRequest) return

      const payload = {
        status: actionType === "APPROVE" ? "APPROVED" : "REJECTED",
        teacherNote: note || undefined,
      }

      const response = await apiFetch(`/api/teachers/profile-requests/${profileRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to ${actionType.toLowerCase()} request`)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-profile-requests"] })
      toast.success(`Request ${actionType === "APPROVE" ? "approved" : "rejected"} successfully`)
      onSuccess()
      setNote("")
    },
    onError: (error) => {
      toast.error(error.message || `Failed to ${actionType.toLowerCase()} request`)
    },
  })

  if (!profileRequest) return null

  const isApprove = actionType === "APPROVE"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isApprove ? "Approve Profile Update" : "Reject Profile Update"}</DialogTitle>
          <DialogDescription>
            {isApprove
              ? `Apply ${profileRequest.studentName}'s requested changes to their student record?`
              : `Reject this request? ${profileRequest.studentName}'s record will remain unchanged.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-md border p-3 text-sm">
          {profileRequest.requestedPhoneNumber && (
            <div>
              <span className="text-muted-foreground">Phone:</span> {profileRequest.requestedPhoneNumber}
            </div>
          )}
          {profileRequest.requestedAddress && (
            <div>
              <span className="text-muted-foreground">Address:</span> {profileRequest.requestedAddress}
            </div>
          )}
        </div>

        {!isApprove && (
          <div className="grid gap-2 py-2">
            <Label htmlFor="profileRequestNote">Teacher Note</Label>
            <Textarea
              id="profileRequestNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this request is being rejected..."
              required
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={isApprove ? "default" : "destructive"}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (!isApprove && !note.trim())}
          >
            {mutation.isPending ? "Saving..." : isApprove ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfileUpdatesTab() {
  const [selectedRequest, setSelectedRequest] = useState<ProfileEditRequest | null>(null)
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT">("APPROVE")
  const [dialogOpen, setDialogOpen] = useState(false)

  const {
    data: requests,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["pending-profile-requests"],
    queryFn: fetchPendingProfileRequests,
    retry: false,
  })

  const openDialog = (profileRequest: ProfileEditRequest, action: "APPROVE" | "REJECT") => {
    setSelectedRequest(profileRequest)
    setActionType(action)
    setDialogOpen(true)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Needs Review</CardTitle>
          <CardDescription>Phone number and address changes requested by students in your classes</CardDescription>
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
                {error instanceof Error ? error.message : "Failed to load pending profile requests."}
              </AlertDescription>
            </Alert>
          ) : !requests || requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileCheck className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">
                There are no pending profile update requests at this time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Requested Phone</TableHead>
                    <TableHead>Requested Address</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((profileRequest) => (
                    <TableRow key={profileRequest.id}>
                      <TableCell className="font-medium">
                        {profileRequest.studentName}
                        <div className="text-xs text-muted-foreground">{profileRequest.admissionNumber}</div>
                      </TableCell>
                      <TableCell>{profileRequest.requestedPhoneNumber ?? "—"}</TableCell>
                      <TableCell>{profileRequest.requestedAddress ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(profileRequest.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => openDialog(profileRequest, "APPROVE")}
                            title="Approve"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => openDialog(profileRequest, "REJECT")}
                            title="Reject"
                          >
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

      <ReviewProfileRequestDialog
        profileRequest={selectedRequest}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        actionType={actionType}
        onSuccess={() => setDialogOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Page — tabbed hub.
// ---------------------------------------------------------------------------

export default function PendingRequestsPage() {
  const { data: activities } = useQuery({
    queryKey: ["pending-activities"],
    queryFn: fetchPendingActivities,
    retry: false,
  })
  const { data: certificates } = useQuery({
    queryKey: ["pending-student-certificates"],
    queryFn: fetchPendingStudentCertificates,
    retry: false,
  })
  const { data: profileRequests } = useQuery({
    queryKey: ["pending-profile-requests"],
    queryFn: fetchPendingProfileRequests,
    retry: false,
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Pending Requests</h1>

      <Tabs defaultValue="activities">
        <TabsList>
          <TabsTrigger value="activities" className="gap-2">
            <FileCheck className="h-4 w-4" />
            Activities{activities ? ` (${activities.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="certificates" className="gap-2">
            <Award className="h-4 w-4" />
            Certificates{certificates ? ` (${certificates.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="profile-updates" className="gap-2">
            <UserCog className="h-4 w-4" />
            Profile Updates{profileRequests ? ` (${profileRequests.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="activities" className="space-y-6">
          <ActivitiesTab />
        </TabsContent>
        <TabsContent value="certificates" className="space-y-6">
          <CertificatesTab />
        </TabsContent>
        <TabsContent value="profile-updates" className="space-y-6">
          <ProfileUpdatesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
