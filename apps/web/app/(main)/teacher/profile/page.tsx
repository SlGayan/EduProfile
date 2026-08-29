"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Info } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { toast } from "sonner"

type GenderValue = "MALE" | "FEMALE" | "OTHER"

const GENDER_LABELS: Record<GenderValue, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
}

interface TeacherClass {
  id: number
  name: string
}

interface TeacherProfile {
  id: number
  staffId: string
  displayName: string | null
  phoneNumber: string | null
  address: string | null
  gender: GenderValue | null
  email: string
  role: string
  joinedDate: string
  classes: TeacherClass[]
}

class ProfileFetchError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function fetchTeacherProfile(): Promise<TeacherProfile> {
  const response = await apiFetch("/api/teachers/me")
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

interface EditContactFormValues {
  displayName: string
  phoneNumber: string
  address: string
  gender: GenderValue | ""
}

function EditContactForm({ profile }: { profile: TeacherProfile }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<EditContactFormValues>({
    displayName: profile.displayName ?? "",
    phoneNumber: profile.phoneNumber ?? "",
    address: profile.address ?? "",
    gender: profile.gender ?? "",
  })

  // Re-sync local edits whenever the server value changes underneath us
  // (e.g. after a successful save refetches the query).
  useEffect(() => {
    setValues({
      displayName: profile.displayName ?? "",
      phoneNumber: profile.phoneNumber ?? "",
      address: profile.address ?? "",
      gender: profile.gender ?? "",
    })
  }, [profile.displayName, profile.phoneNumber, profile.address, profile.gender])

  const mutation = useMutation({
    mutationFn: async (payload: EditContactFormValues) => {
      const { gender, ...rest } = payload
      const response = await apiFetch("/api/teachers/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, ...(gender && { gender }) }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to save profile")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-profile"] })
      toast.success("Profile updated")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save profile")
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(values)
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={values.displayName}
              onChange={(e) => setValues((v) => ({ ...v, displayName: e.target.value }))}
              maxLength={255}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              value={values.phoneNumber}
              onChange={(e) =>
                setValues((v) => ({ ...v, phoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              inputMode="numeric"
              maxLength={10}
              placeholder="10 digits, e.g. 0771234567"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={values.gender}
              onValueChange={(value) => setValues((v) => ({ ...v, gender: value as GenderValue }))}
            >
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={values.address}
              onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
              maxLength={500}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default function TeacherProfilePage() {
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["teacher-profile"],
    queryFn: fetchTeacherProfile,
  })

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Profile</h1>
        <Skeleton className="h-10 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(5)].map((_, i) => (
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
              Your teacher profile has not been set up yet. Please contact your administrator to complete your registration.
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
          <CardTitle>Staff Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Staff ID</dt>
              <dd className="text-base font-medium">{profile?.staffId}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="text-base font-medium">{profile?.email}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Role</dt>
              <dd className="text-base font-medium">{profile?.role}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Joined Date</dt>
              <dd className="text-base font-medium">
                {profile?.joinedDate ? new Date(profile.joinedDate).toLocaleDateString() : "N/A"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Display Name</dt>
              <dd className="text-base font-medium">{profile?.displayName || "Not set"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Phone Number</dt>
              <dd className="text-base font-medium">{profile?.phoneNumber || "Not set"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-muted-foreground">Gender</dt>
              <dd className="text-base font-medium">
                {profile?.gender ? GENDER_LABELS[profile.gender] : "Not set"}
              </dd>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Address</dt>
              <dd className="text-base font-medium">{profile?.address || "Not set"}</dd>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Assigned Classes</dt>
              <dd className="text-base font-medium">
                {profile?.classes && profile.classes.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {profile.classes.map((c) => (
                      <li key={c.id}>{c.name}</li>
                    ))}
                  </ul>
                ) : (
                  "No classes assigned"
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {profile && <EditContactForm profile={profile} />}
    </div>
  )
}
