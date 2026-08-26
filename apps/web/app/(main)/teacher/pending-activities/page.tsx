"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, FileCheck, Check, X, MessageSquareWarning } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { formatDateRange, type Activity } from "@/lib/activities"
import { TablePagination, TABLE_PAGE_SIZE } from "@/components/table-pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

async function fetchPendingActivities(): Promise<Activity[]> {
  const response = await apiFetch("/api/teachers/me/pending-activities")
  if (!response.ok) {
    throw new Error("Failed to load pending activities")
  }
  return response.json()
}

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

export default function PendingActivitiesPage() {
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
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Pending Activities</h1>

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
    </div>
  )
}
