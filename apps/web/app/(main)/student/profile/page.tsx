"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { AlertCircle, Info } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { toast } from "sonner"
import { formatDate } from "@/lib/studentSearch"

interface StudentProfile {
  id: number
  fullName: string
  indexNumber: string
  dateOfBirth: string
  nicNumber: string | null
  address: string
  phoneNumber: string | null
  olYear: number | null
  alYear: number | null
  assignedClass: string | null
  email: string
}

interface ProfileEditRequest {
  id: string
  requestedPhoneNumber: string | null
  requestedAddress: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  teacherNote: string | null
  createdAt: string
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

async function fetchMyProfileRequests(): Promise<ProfileEditRequest[]> {
  const response = await apiFetch("/api/students/me/profile-requests")
  if (!response.ok) {
    throw new Error("Failed to load profile update requests")
  }
  return response.json()
}

function RequestUpdateDialog({ latestRequest }: { latestRequest: ProfileEditRequest | undefined }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [address, setAddress] = useState("")

  const hasPending = latestRequest?.status === "PENDING"

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        phoneNumber: phoneNumber.trim() || undefined,
        address: address.trim() || undefined,
      }
      const response = await apiFetch("/api/students/me/profile-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to submit update request")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile-requests"] })
      toast.success("Update request submitted")
      setOpen(false)
      setPhoneNumber("")
      setAddress("")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to submit update request")
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={hasPending}>{hasPending ? "Request Pending" : "Request Update"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a Profile Update</DialogTitle>
          <DialogDescription>
            Your assigned teacher will review this request. Leave a field blank to keep it unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="requestPhoneNumber">Phone Number</Label>
            <Input
              id="requestPhoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              maxLength={10}
              placeholder="10 digits, e.g. 0771234567"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="requestAddress">Address</Label>
            <Input id="requestAddress" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (!phoneNumber.trim() && !address.trim())}
          >
            {mutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const { data: myRequests } = useQuery({
    queryKey: ["my-profile-requests"],
    queryFn: fetchMyProfileRequests,
  })
  const latestRequest = myRequests?.[0]

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-10 w-48" />
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

  if (error) {
    const isNoProfileError = error instanceof ProfileFetchError && error.status === 404

    if (isNoProfileError) {
      return (
        <div className="space-y-6 p-4 sm:p-6">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Your student profile has not been set up yet. Please contact your administrator to complete your registration.
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load profile information. Please try again later.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your student profile details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Full Name</dt>
              <dd className="text-base font-medium">{profile?.fullName}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Index Number</dt>
              <dd className="text-base font-medium">{profile?.indexNumber}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Date of Birth</dt>
              <dd className="text-base font-medium">{profile && formatDate(profile.dateOfBirth)}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">NIC Number</dt>
              <dd className="text-base font-medium">{profile?.nicNumber || "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="text-base font-medium">{profile?.email}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Phone Number</dt>
              <dd className="text-base font-medium">{profile?.phoneNumber || "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">O/L Year</dt>
              <dd className="text-base font-medium">{profile?.olYear ?? "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">A/L Year</dt>
              <dd className="text-base font-medium">{profile?.alYear ?? "N/A"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Assigned Class</dt>
              <dd className="text-base font-medium">{profile?.assignedClass ?? "N/A"}</dd>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Address</dt>
              <dd className="text-base font-medium">{profile?.address}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Update Request</CardTitle>
          <CardDescription>
            Phone number and address changes are reviewed by your assigned teacher before they take effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestRequest && latestRequest.status === "PENDING" && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Pending Review</Badge>
                  <span>Your assigned teacher hasn&apos;t reviewed this yet. Your profile still shows the values below until then.</span>
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  {latestRequest.requestedPhoneNumber && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Requested Phone Number:</dt>
                      <dd className="font-medium">{latestRequest.requestedPhoneNumber}</dd>
                    </div>
                  )}
                  {latestRequest.requestedAddress && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Requested Address:</dt>
                      <dd className="font-medium">{latestRequest.requestedAddress}</dd>
                    </div>
                  )}
                </dl>
              </AlertDescription>
            </Alert>
          )}
          {latestRequest && latestRequest.status === "REJECTED" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your last request was rejected{latestRequest.teacherNote ? `: ${latestRequest.teacherNote}` : "."}
              </AlertDescription>
            </Alert>
          )}
          <RequestUpdateDialog latestRequest={latestRequest} />
        </CardContent>
      </Card>
    </div>
  )
}
