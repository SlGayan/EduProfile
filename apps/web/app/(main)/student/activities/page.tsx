"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Trophy, Plus } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { formatDateRange, type Activity } from "@/lib/activities"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

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

export default function StudentActivitiesPage() {
  const {
    data: activities,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-activities"],
    queryFn: fetchMyActivities,
    retry: false,
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Activities</h1>
        <SubmitActivityDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Extracurricular Activities</CardTitle>
          <CardDescription>Your recorded participation in clubs, sports and societies</CardDescription>
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
                {error instanceof Error ? error.message : "Failed to load activities. Please try again later."}
              </AlertDescription>
            </Alert>
          ) : !activities || activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Trophy className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No activities recorded yet</p>
              <p className="text-sm text-muted-foreground">
                You haven&apos;t submitted any extracurricular activities, or your teachers haven&apos;t added any to your record.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Achievements</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">
                        <div>{activity.activityName}</div>
                        {activity.teacherNote && activity.status === 'NEEDS_CORRECTION' && (
                          <div className="text-sm text-destructive mt-1">Note: {activity.teacherNote}</div>
                        )}
                      </TableCell>
                      <TableCell>{activity.activityType}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateRange(activity.startDate, activity.endDate)}
                      </TableCell>
                      <TableCell>{activity.achievements ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={activity.status} /></TableCell>
                      <TableCell className="text-right">
                        {activity.status === 'NEEDS_CORRECTION' && (
                          <EditActivityDialog activity={activity} />
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
