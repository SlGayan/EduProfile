"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertCircle,
  Asterisk,
  Award,
  Calendar,
  Camera,
  Eye,
  EyeOff,
  GraduationCap,
  History,
  Info,
  KeySquare,
  Pencil,
  Phone,
  Plus,
  School,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/apiFetch"
import { getCurrentUser } from "@/lib/auth"

interface StudentProfile {
  id: number
  fullName: string
  indexNumber: string
  dateOfBirth: string
  nicNumber: string | null
  address: string
  olYear: number | null
  alYear: number | null
  assignedClass: string | null
  academicYear: number | null
  email: string
  status: "ACTIVE" | "INACTIVE"
  photoUrl: string | null
  admissionDate: string | null
  updatedAt: string
  guardian: {
    guardianName: string
    primaryPhone: string
    emergencyContactPhone: string | null
  } | null
  classTeacher: {
    fullName: string | null
    phone: string | null
    email: string
  } | null
}

class ProfileFetchError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function fetchStudentProfile(): Promise<StudentProfile> {
  const response = await apiFetch("/api/students/me")
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Failed to fetch profile"
    throw new ProfileFetchError(message, response.status)
  }
  return response.json()
}

function maskNic(nic: string): string {
  if (nic.length <= 5) return nic
  return `${nic.slice(0, 4)}${"*".repeat(nic.length - 5)}${nic.slice(-1)}`
}

function formatDate(value: string | null): string {
  if (!value) return "N/A"
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function AvatarUpload({ profile }: { profile: StudentProfile }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const queryClient = useQueryClient()

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setUploading(true)
    const user = getCurrentUser()
    const formData = new FormData()
    formData.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/students/me/photo")
    if (user?.token) xhr.setRequestHeader("Authorization", `Bearer ${user.token}`)
    xhr.onload = () => {
      setUploading(false)
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success("Profile photo updated")
        queryClient.invalidateQueries({ queryKey: ["student-profile"] })
      } else {
        let message = "Failed to upload photo"
        try {
          const body = JSON.parse(xhr.responseText)
          if (typeof body?.error === "string") message = body.error
        } catch {
          // no JSON body
        }
        toast.error(message)
      }
    }
    xhr.onerror = () => {
      setUploading(false)
      toast.error("Network error while uploading photo")
    }
    xhr.send(formData)
  }

  return (
    <div className="relative shrink-0">
      <Avatar className="size-24 border">
        <AvatarImage src={profile.photoUrl ?? undefined} alt={profile.fullName} />
        <AvatarFallback className="text-2xl">{initials(profile.fullName)}</AvatarFallback>
      </Avatar>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent disabled:opacity-50"
        aria-label="Change profile photo"
      >
        <Camera className="size-4" />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  )
}

function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const newPassword = formData.get("newPassword") as string
      const confirmPassword = formData.get("confirmPassword") as string

      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match")
      }

      const response = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to change password")
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success("Password updated successfully")
      setOpen(false)
      setError(null)
    },
    onError: (err) => {
      setError(err.message || "Failed to change password")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    mutation.mutate(new FormData(e.currentTarget))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeySquare className="mr-2 h-4 w-4" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Choose a new password with at least one letter and one number.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" name="newPassword" type="password" minLength={6} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" minLength={6} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditPersonalInfoDialog({ profile }: { profile: StudentProfile }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const payload = {
        address: formData.get("address") as string,
        nicNumber: (formData.get("nicNumber") as string) || undefined,
        email: formData.get("email") as string,
      }

      const response = await apiFetch("/api/students/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to update profile")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-profile"] })
      toast.success("Personal information updated")
      setOpen(false)
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update profile")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    mutation.mutate(new FormData(e.currentTarget))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Edit personal information">
          <Pencil className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Personal Information</DialogTitle>
            <DialogDescription>
              Only contact details can be self-updated. Contact your administrator to change your name, index
              number, or academic record.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="address">Residential Address</Label>
              <Input id="address" name="address" defaultValue={profile.address} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nicNumber">NIC Number</Label>
              <Input id="nicNumber" name="nicNumber" defaultValue={profile.nicNumber ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" name="email" type="email" defaultValue={profile.email} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditGuardianDialog({ guardian }: { guardian: StudentProfile["guardian"] }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const payload = {
        guardianName: formData.get("guardianName") as string,
        primaryPhone: formData.get("primaryPhone") as string,
        emergencyContactPhone: (formData.get("emergencyContactPhone") as string) || undefined,
      }

      const response = await apiFetch("/api/students/me/guardian", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to update guardian details")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-profile"] })
      toast.success("Guardian details updated")
      setOpen(false)
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update guardian details")
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    mutation.mutate(new FormData(e.currentTarget))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Edit guardian details">
          <Pencil className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Guardian Details</DialogTitle>
            <DialogDescription>Keep your parent/guardian contact information up to date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="guardianName">Parent/Guardian Name</Label>
              <Input id="guardianName" name="guardianName" defaultValue={guardian?.guardianName ?? ""} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="primaryPhone">Primary Phone Number</Label>
              <Input id="primaryPhone" name="primaryPhone" defaultValue={guardian?.primaryPhone ?? ""} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emergencyContactPhone">Emergency Contact</Label>
              <Input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                defaultValue={guardian?.emergencyContactPhone ?? ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NicField({ nic }: { nic: string | null }) {
  const [revealed, setRevealed] = useState(false)

  if (!nic) {
    return <dd className="text-base font-medium">N/A</dd>
  }

  return (
    <dd className="flex items-center gap-2 text-base font-medium">
      <span className="font-mono tracking-tight">{revealed ? nic : maskNic(nic)}</span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="text-muted-foreground hover:text-foreground"
        aria-label={revealed ? "Hide NIC number" : "Reveal NIC number"}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </dd>
  )
}

export default function StudentProfilePage() {
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["student-profile"],
    queryFn: fetchStudentProfile,
  })

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !profile) {
    const isNoProfileError = error instanceof ProfileFetchError && error.status === 404

    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>
        <Alert variant="destructive">
          {isNoProfileError ? <Info className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>
            {isNoProfileError
              ? "Your student profile has not been set up yet. Please contact your administrator to complete your registration."
              : "Failed to load profile information. Please try again later."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <AvatarUpload profile={profile} />
          <div className="space-y-2">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{profile.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {profile.assignedClass && (
                <Badge variant="secondary" className="gap-1">
                  <GraduationCap className="size-3" />
                  {profile.assignedClass}
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <Award className="size-3" />
                {profile.indexNumber}
              </Badge>
            </div>
            {profile.academicYear && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="size-4" />
                Academic Year: {profile.academicYear}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/student/activities">
              <Plus className="mr-2 h-4 w-4" />
              Submit Activity
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/student/activities">
              <Pencil className="mr-2 h-4 w-4" />
              Request Correction
            </Link>
          </Button>
          <ChangePasswordDialog />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Your official student profile details.</CardDescription>
            <CardAction>
              <EditPersonalInfoDialog profile={profile} />
            </CardAction>
          </CardHeader>
          <CardContent className="pt-6">
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">Full Name</dt>
                <dd className="text-base font-medium">{profile.fullName}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">Index Number</dt>
                <dd className="text-base font-medium">{profile.indexNumber}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">Date of Birth</dt>
                <dd className="text-base font-medium">{formatDate(profile.dateOfBirth)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">NIC Number</dt>
                <NicField nic={profile.nicNumber} />
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">Email Address</dt>
                <dd className="text-base font-medium">{profile.email}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">O/L Year</dt>
                <dd className="text-base font-medium">{profile.olYear ?? "N/A"}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">A/L Year</dt>
                <dd className="text-base font-medium">{profile.alYear ?? "N/A"}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-muted-foreground">Assigned Class</dt>
                <dd className="text-base font-medium">{profile.assignedClass ?? "N/A"}</dd>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <dt className="text-sm font-medium text-muted-foreground">Residential Address</dt>
                <dd className="text-base font-medium">{profile.address}</dd>
              </div>
            </dl>
          </CardContent>
          <div className="flex items-center gap-1.5 px-6 pt-4 text-xs italic text-muted-foreground">
            <History className="size-3.5" />
            Profile last updated: {formatDate(profile.updatedAt)}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                Guardian Details
              </CardTitle>
              <CardAction>
                <EditGuardianDialog guardian={profile.guardian} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {profile.guardian ? (
                <>
                  <div className="space-y-1">
                    <dt className="text-sm text-muted-foreground">Parent/Guardian Name</dt>
                    <dd className="text-base font-medium">{profile.guardian.guardianName}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-sm text-muted-foreground">Primary Phone Number</dt>
                    <dd className="text-base font-medium">{profile.guardian.primaryPhone}</dd>
                  </div>
                  {profile.guardian.emergencyContactPhone && (
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                      <Asterisk className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-destructive">Emergency Contact</div>
                        <div className="text-sm font-medium">{profile.guardian.emergencyContactPhone}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No guardian details on file yet. Click the pencil icon to add them.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <School className="size-5" />
                School Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Student Status</dt>
                <Badge className={profile.status === "ACTIVE" ? "bg-green-600 hover:bg-green-700" : undefined} variant={profile.status === "ACTIVE" ? "default" : "secondary"}>
                  {profile.status === "ACTIVE" ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">Admission Date</dt>
                <dd className="text-base font-medium">{formatDate(profile.admissionDate)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">Current Class Teacher</dt>
                {profile.classTeacher ? (
                  <div className="flex items-center justify-between gap-2">
                    <dd className="text-base font-medium">{profile.classTeacher.fullName ?? "Not assigned"}</dd>
                    {(profile.classTeacher.phone || profile.classTeacher.email) && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={profile.classTeacher.phone ? `tel:${profile.classTeacher.phone}` : `mailto:${profile.classTeacher.email}`}>
                          <Phone className="mr-1.5 size-3.5" />
                          Contact
                        </a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <dd className="text-base font-medium">N/A</dd>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
