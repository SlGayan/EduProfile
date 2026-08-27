"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Trophy, Plus, Loader2, Paperclip } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { formatDateRange, toDateInputValue, type Activity } from "@/lib/activities"
import { fetchMyStudentCertificates, extensionFromFileUrl, type StudentCertificate } from "@/lib/studentCertificates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { getCurrentUser } from "@/lib/auth"

async function fetchMyActivities(): Promise<Activity[]> {
  const response = await apiFetch("/api/students/me/activities")
  if (!response.ok) {
    let message = "Failed to load activities"
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
  return data as Activity[]
}

const COMMON_ACTIVITIES = [
  "Debate Club",
  "Science Society",
  "Drama Club",
  "Basketball Team",
  "Cricket Team",
  "Other"
];

function SubmitActivityDialog() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const [isOtherActivity, setIsOtherActivity] = useState(false)

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      let activityName = formData.get("activityName") as string
      if (activityName === "Other") {
        activityName = formData.get("customActivityName") as string
      }

      const payload = {
        activityName,
        activityType: formData.get("activityType"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate") || undefined,
        description: formData.get("description") || undefined,
        achievements: formData.get("achievements") || undefined,
        evidenceUrl: formData.get("evidenceUrl") || undefined,
      }

      const response = await apiFetch("/api/students/me/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to submit activity")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-activities"] })
      toast.success("Activity submitted for approval")
      setOpen(false)
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit activity")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    mutation.mutate(new FormData(e.currentTarget))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Submit Activity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Submit New Activity</DialogTitle>
            <DialogDescription>
              Submit an extracurricular activity or achievement for approval by your class teacher.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="activityName">Activity Name</Label>
              <Select name="activityName" onValueChange={(val) => setIsOtherActivity(val === "Other")} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select an activity" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_ACTIVITIES.map((act) => (
                    <SelectItem key={act} value={act}>{act}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isOtherActivity && (
              <div className="grid gap-2">
                <Label htmlFor="customActivityName">Custom Activity Name</Label>
                <Input id="customActivityName" name="customActivityName" required />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="activityType">Activity Type</Label>
                <Input id="activityType" name="activityType" placeholder="e.g. Sports, Club" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endDate">End Date (Optional)</Label>
                <Input id="endDate" name="endDate" type="date" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea id="description" name="description" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="achievements">Achievements (Optional)</Label>
              <Textarea id="achievements" name="achievements" placeholder="e.g. Won 1st place" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evidenceUrl">Evidence Link (Optional)</Label>
              <Input id="evidenceUrl" name="evidenceUrl" type="url" placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditActivityDialog({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const initialIsCustom = !COMMON_ACTIVITIES.includes(activity.activityName)
  const [isCustomActivity, setIsCustomActivity] = useState(initialIsCustom)

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      let activityName = formData.get("activityName") as string
      if (activityName === "Other") {
        activityName = formData.get("customActivityName") as string
      }

      const payload = {
        activityName,
        activityType: formData.get("activityType"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate") || undefined,
        description: formData.get("description") || undefined,
        achievements: formData.get("achievements") || undefined,
        evidenceUrl: formData.get("evidenceUrl") || undefined,
      }

      const response = await apiFetch(`/api/students/me/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to update activity")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-activities"] })
      toast.success("Activity corrected and resubmitted")
      setOpen(false)
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update activity")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    mutation.mutate(new FormData(e.currentTarget))
  }

  const startDateInput = activity.startDate ? activity.startDate.slice(0, 10) : ""
  const endDateInput = activity.endDate ? activity.endDate.slice(0, 10) : ""

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Correct</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Correct Activity</DialogTitle>
            <DialogDescription>
              Update your activity details and resubmit for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="activityName">Activity Name</Label>
              <Select
                name="activityName"
                defaultValue={initialIsCustom ? "Other" : activity.activityName}
                onValueChange={(val) => setIsCustomActivity(val === "Other")}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an activity" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_ACTIVITIES.map((act) => (
                    <SelectItem key={act} value={act}>{act}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isCustomActivity && (
              <div className="grid gap-2">
                <Label htmlFor="customActivityName">Custom Activity Name</Label>
                <Input id="customActivityName" name="customActivityName" defaultValue={initialIsCustom ? activity.activityName : ""} required />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="activityType">Activity Type</Label>
                <Input id="activityType" name="activityType" defaultValue={activity.activityType} placeholder="e.g. Sports, Club" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" name="startDate" type="date" defaultValue={startDateInput} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endDate">End Date (Optional)</Label>
                <Input id="endDate" name="endDate" type="date" defaultValue={endDateInput} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea id="description" name="description" defaultValue={activity.description || ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="achievements">Achievements (Optional)</Label>
              <Textarea id="achievements" name="achievements" defaultValue={activity.achievements || ""} placeholder="e.g. Won 1st place" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evidenceUrl">Evidence Link (Optional)</Label>
              <Input id="evidenceUrl" name="evidenceUrl" type="url" defaultValue={activity.evidenceUrl || ""} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Resubmit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * XHR rather than fetch/apiFetch: the request is multipart/form-data with an
 * optional file, and apiFetch always sets a JSON Content-Type header which
 * would strip the multipart boundary. Mirrors uploadMaterial in
 * teacher/materials/page.tsx, the established pattern in this codebase for
 * file-carrying form submissions.
 */
function submitCertificateForm(
  url: string,
  method: "POST" | "PATCH",
  formData: FormData,
  token: string | undefined
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    xhr.onload = () => {
      let body: any = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // no JSON body
      }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = () => reject(new Error("Network error"))
    xhr.send(formData)
  })
}

function buildCertificateFormData(formEl: HTMLFormElement): FormData {
  const formData = new FormData(formEl)
  // Drop an empty file input entirely — an empty File would otherwise arrive
  // server-side as a zero-byte "file", tripping the multer file filter.
  const file = formData.get("file")
  if (file instanceof File && file.size === 0) {
    formData.delete("file")
  }
  return formData
}

function SubmitCertificateDialog() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (formEl: HTMLFormElement) => {
      const formData = buildCertificateFormData(formEl)
      const evidenceUrl = (formData.get("evidenceUrl") as string) || ""
      const file = formData.get("file")
      if (!evidenceUrl && !(file instanceof File)) {
        throw new Error("Provide at least one form of evidence: an evidence link or an uploaded file")
      }

      const token = getCurrentUser()?.token
      const { status, body } = await submitCertificateForm(
        "/api/students/me/student-certificates",
        "POST",
        formData,
        token
      )
      if (status < 200 || status >= 300) {
        throw new Error(body?.error || "Failed to submit certificate")
      }
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-student-certificates"] })
      toast.success("Certificate submitted for review")
      setOpen(false)
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to submit certificate")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(e.currentTarget)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add Certificate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Certificate</DialogTitle>
            <DialogDescription>
              Submit an external course, competition, or achievement certificate for review by your class teacher.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Certificate Title</Label>
              <Input id="title" name="title" placeholder="e.g. Introduction to Python" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issuingOrganization">Issuing Organization</Label>
              <Input id="issuingOrganization" name="issuingOrganization" placeholder="e.g. Coursera" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" name="category" placeholder="e.g. Academic, Sports, Leadership" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issueDate">Issue Date</Label>
              <Input id="issueDate" name="issueDate" type="date" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea id="description" name="description" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evidenceUrl">Evidence Link (Optional)</Label>
              <Input id="evidenceUrl" name="evidenceUrl" type="url" placeholder="https://..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="file">Upload File (Optional)</Label>
              <Input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" />
              <p className="text-xs text-muted-foreground">PDF or image, up to 10MB. Provide a link, a file, or both.</p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditCertificateDialog({ certificate }: { certificate: StudentCertificate }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (formEl: HTMLFormElement) => {
      const formData = buildCertificateFormData(formEl)
      const evidenceUrl = (formData.get("evidenceUrl") as string) || ""
      const file = formData.get("file")
      if (!evidenceUrl && !(file instanceof File) && !certificate.fileUrl) {
        throw new Error("Provide at least one form of evidence: an evidence link or an uploaded file")
      }

      const token = getCurrentUser()?.token
      const { status, body } = await submitCertificateForm(
        `/api/students/me/student-certificates/${certificate.id}`,
        "PATCH",
        formData,
        token
      )
      if (status < 200 || status >= 300) {
        throw new Error(body?.error || "Failed to update certificate")
      }
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-student-certificates"] })
      toast.success("Certificate corrected and resubmitted")
      setOpen(false)
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to update certificate")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(e.currentTarget)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Correct</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Correct Certificate</DialogTitle>
            <DialogDescription>Update your certificate details and resubmit for review.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Certificate Title</Label>
              <Input id="edit-title" name="title" defaultValue={certificate.title} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-issuingOrganization">Issuing Organization</Label>
              <Input id="edit-issuingOrganization" name="issuingOrganization" defaultValue={certificate.issuingOrganization} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-category">Category</Label>
              <Input id="edit-category" name="category" defaultValue={certificate.category ?? ""} placeholder="e.g. Academic, Sports, Leadership" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-issueDate">Issue Date</Label>
              <Input id="edit-issueDate" name="issueDate" type="date" defaultValue={toDateInputValue(certificate.issueDate)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description (Optional)</Label>
              <Textarea id="edit-description" name="description" defaultValue={certificate.description || ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-evidenceUrl">Evidence Link (Optional)</Label>
              <Input id="edit-evidenceUrl" name="evidenceUrl" type="url" defaultValue={certificate.evidenceUrl || ""} placeholder="https://..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-file">Replace Uploaded File (Optional)</Label>
              <Input id="edit-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" />
              {certificate.fileUrl && (
                <p className="text-xs text-muted-foreground">A file is already attached. Choose a new one only to replace it.</p>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Resubmit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

async function downloadStudentCertificateFile(certificate: StudentCertificate) {
  let res: Response
  try {
    res = await apiFetch(`/api/students/me/student-certificates/${certificate.id}/file`)
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
  link.download = `${certificate.title}${certificate.fileUrl ? extensionFromFileUrl(certificate.fileUrl) : ""}`
  link.click()
  URL.revokeObjectURL(url)
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="secondary">UNKNOWN</Badge>

  switch (status) {
    case 'APPROVED':
      return <Badge className="bg-green-600 hover:bg-green-700">Approved</Badge>
    case 'PENDING':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Pending</Badge>
    case 'NEEDS_CORRECTION':
      return <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600">Needs Correction</Badge>
    case 'REJECTED':
      return <Badge variant="destructive">Rejected</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

/**
 * Activities and self-added certificates are the same submit-for-approval
 * workflow wearing two data shapes, so they're normalized into one shape and
 * shown in a single list instead of two separate pages for the same flow.
 */
interface MyItem {
  kind: "ACTIVITY" | "CERTIFICATE"
  id: string
  title: string
  subtitle: string
  dateDisplay: string
  status?: "PENDING" | "APPROVED" | "NEEDS_CORRECTION" | "REJECTED"
  teacherNote?: string | null
  reviewedByName?: string | null
  reviewedAt?: string | null
  achievements?: string | null
  evidenceUrl?: string | null
  hasFile: boolean
  sortDate: string
  activity?: Activity
  certificate?: StudentCertificate
}

function normalizeActivity(activity: Activity): MyItem {
  return {
    kind: "ACTIVITY",
    id: activity.id,
    title: activity.activityName,
    subtitle: activity.activityType,
    dateDisplay: formatDateRange(activity.startDate, activity.endDate),
    status: activity.status,
    teacherNote: activity.teacherNote,
    reviewedByName: activity.reviewedByName,
    reviewedAt: activity.reviewedAt,
    achievements: activity.achievements,
    evidenceUrl: activity.evidenceUrl,
    hasFile: false,
    sortDate: activity.startDate,
    activity,
  }
}

function normalizeCertificate(certificate: StudentCertificate): MyItem {
  return {
    kind: "CERTIFICATE",
    id: certificate.id,
    title: certificate.title,
    subtitle: certificate.category ?? certificate.issuingOrganization,
    dateDisplay: toDateInputValue(certificate.issueDate),
    status: certificate.status,
    teacherNote: certificate.teacherNote,
    reviewedByName: certificate.reviewedByName,
    reviewedAt: certificate.reviewedAt,
    achievements: null,
    evidenceUrl: certificate.evidenceUrl,
    hasFile: Boolean(certificate.fileUrl),
    sortDate: certificate.issueDate,
    certificate,
  }
}

export default function StudentActivitiesPage() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const activitiesQuery = useQuery({
    queryKey: ["my-activities"],
    queryFn: fetchMyActivities,
    retry: false,
  })
  const certificatesQuery = useQuery({
    queryKey: ["my-student-certificates"],
    queryFn: fetchMyStudentCertificates,
    retry: false,
  })

  const isLoading = activitiesQuery.isLoading || certificatesQuery.isLoading
  const error = activitiesQuery.error || certificatesQuery.error

  const items: MyItem[] = [
    ...(activitiesQuery.data ?? []).map(normalizeActivity),
    ...(certificatesQuery.data ?? []).map(normalizeCertificate),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())

  async function handleDownload(item: MyItem) {
    if (downloadingId || !item.certificate) return
    setDownloadingId(item.id)
    try {
      await downloadStudentCertificateFile(item.certificate)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Activities</h1>
        <div className="flex flex-wrap gap-2">
          <SubmitActivityDialog />
          <SubmitCertificateDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activities & Certificates</CardTitle>
          <CardDescription>Your recorded participation in clubs, sports and societies, plus self-added course and competition certificates</CardDescription>
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
                {error instanceof Error ? error.message : "Failed to load your activities. Please try again later."}
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Trophy className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">Nothing recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Submit an activity or add a certificate, or your teachers haven&apos;t added any to your record yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`${item.kind}-${item.id}`}>
                      <TableCell>
                        <Badge variant="secondary">{item.kind === "ACTIVITY" ? "Activity" : "Certificate"}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{item.title}</div>
                        {item.achievements && <div className="text-sm text-muted-foreground">{item.achievements}</div>}
                        {item.teacherNote && (item.status === "NEEDS_CORRECTION" || item.status === "REJECTED") && (
                          <div className="text-sm text-destructive mt-1">Note: {item.teacherNote}</div>
                        )}
                      </TableCell>
                      <TableCell>{item.subtitle}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.dateDisplay}</TableCell>
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
                      <TableCell>
                        <StatusBadge status={item.status} />
                        {item.reviewedByName && item.reviewedAt && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            by {item.reviewedByName} on {toDateInputValue(item.reviewedAt)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === "NEEDS_CORRECTION" && item.activity && (
                          <EditActivityDialog activity={item.activity} />
                        )}
                        {item.status === "NEEDS_CORRECTION" && item.certificate && (
                          <EditCertificateDialog certificate={item.certificate} />
                        )}
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
