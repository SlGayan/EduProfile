"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { extractApiError, formatDateRange, toDateInputValue, type Activity } from "@/lib/activities"

export interface ActivityStudent {
  id: number
  fullName: string
  indexNumber: string
}

/**
 * Mirrors the server rules in apps/api/src/validators/activityValidators.ts so
 * the teacher gets inline errors without a round-trip. NOTE: apps/web is on
 * Zod 3 while the API is on Zod 4 — this is Zod 3 syntax and must stay that way.
 *
 * Date strings are `YYYY-MM-DD` (what `<input type="date">` emits and the only
 * format the API accepts), which compare lexicographically in date order — so
 * the end-after-start rule needs no Date parsing.
 */
const activitySchema = z
  .object({
    activityName: z.string().trim().min(1, "Activity name is required").max(255, "Must be 255 characters or fewer"),
    activityType: z.string().trim().min(1, "Activity type is required").max(100, "Must be 100 characters or fewer"),
    description: z.string().trim().max(2000, "Must be 2000 characters or fewer").optional(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
    achievements: z.string().trim().max(2000, "Must be 2000 characters or fewer").optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })

type ActivityFormValues = z.infer<typeof activitySchema>

const emptyForm: ActivityFormValues = {
  activityName: "",
  activityType: "",
  description: "",
  startDate: "",
  endDate: "",
  achievements: "",
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Only non-blank values are sent. A blank optional field is omitted rather than
 * sent as "" or null: the API treats an omitted key as "unchanged" and rejects
 * an explicit null, so clearing a previously-set optional field is not
 * currently possible (see the hint rendered in the form).
 */
function buildBody(values: ActivityFormValues): Record<string, string> {
  const body: Record<string, string> = {
    activityName: values.activityName.trim(),
    activityType: values.activityType.trim(),
    startDate: values.startDate,
  }
  if (values.description?.trim()) body.description = values.description.trim()
  if (values.endDate) body.endDate = values.endDate
  if (values.achievements?.trim()) body.achievements = values.achievements.trim()
  return body
}

async function fetchActivities(studentId: number): Promise<Activity[]> {
  const res = await apiFetch(`/api/students/${studentId}/activities`)
  const data = await readBody(res)
  if (!res.ok) throw new Error(extractApiError(data, "Failed to load activities"))
  if (!Array.isArray(data)) throw new Error("Unexpected response from server")
  return data as Activity[]
}

export function StudentActivitiesDialog({
  student,
  onOpenChange,
}: {
  student: ActivityStudent | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  // null = list view; otherwise the form is open (for a new or existing record)
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [deleting, setDeleting] = useState<Activity | null>(null)

  const activitiesKey = ["activities", student?.id]

  const {
    data: activities = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: activitiesKey,
    queryFn: () => fetchActivities(student!.id),
    enabled: !!student,
  })

  const form = useForm<ActivityFormValues>({
    // `as any` matches the existing zodResolver usage in admin/classes/page.tsx —
    // @hookform/resolvers v3 does not type a ZodEffects (a `.refine()`d schema)
    // cleanly against react-hook-form's generics.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(activitySchema as any),
    defaultValues: emptyForm,
  })

  const closeForm = () => {
    setFormMode(null)
    setEditing(null)
    form.reset(emptyForm)
  }

  const openCreate = () => {
    form.reset(emptyForm)
    setEditing(null)
    setFormMode("create")
  }

  const openEdit = (activity: Activity) => {
    form.reset({
      activityName: activity.activityName,
      activityType: activity.activityType,
      description: activity.description ?? "",
      startDate: toDateInputValue(activity.startDate),
      endDate: toDateInputValue(activity.endDate),
      achievements: activity.achievements ?? "",
    })
    setEditing(activity)
    setFormMode("edit")
  }

  const createMutation = useMutation({
    mutationFn: async (values: ActivityFormValues) => {
      const res = await apiFetch(`/api/students/${student!.id}/activities`, {
        method: "POST",
        body: JSON.stringify(buildBody(values)),
      })
      const data = await readBody(res)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to add activity"))
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activitiesKey })
      toast.success("Activity added")
      closeForm()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const editMutation = useMutation({
    mutationFn: async (values: ActivityFormValues) => {
      const res = await apiFetch(`/api/activities/${editing!.id}`, {
        method: "PUT",
        body: JSON.stringify(buildBody(values)),
      })
      const data = await readBody(res)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to update activity"))
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activitiesKey })
      toast.success("Activity updated")
      closeForm()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (activity: Activity) => {
      const res = await apiFetch(`/api/activities/${activity.id}`, { method: "DELETE" })
      const data = await readBody(res)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to remove activity"))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activitiesKey })
      toast.success("Activity removed")
      setDeleting(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setDeleting(null)
    },
  })

  const onSubmit = (values: ActivityFormValues) => {
    if (formMode === "edit") editMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || editMutation.isPending
  const fieldError = (name: keyof ActivityFormValues) => form.formState.errors[name]?.message

  return (
    <>
      <Dialog
        open={!!student}
        onOpenChange={(open) => {
          if (!open) closeForm()
          onOpenChange(open)
        }}
      >
        {/*
          Must be `sm:max-w-3xl`, not `max-w-3xl`: DialogContent's base classes
          end in `sm:max-w-lg`, and tailwind-merge does not treat the two as
          conflicting because their modifiers differ — so both survive and the
          `sm:` rule wins at every desktop width, pinning the dialog to 512px.
        */}
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Extracurricular Activities</DialogTitle>
            <DialogDescription>
              {student ? `${student.fullName} (${student.indexNumber})` : ""}
            </DialogDescription>
          </DialogHeader>

          {formMode ? (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="activityName">Activity Name</Label>
                  <Input id="activityName" {...form.register("activityName")} />
                  {fieldError("activityName") && (
                    <p className="text-sm text-destructive">{fieldError("activityName")}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activityType">Activity Type</Label>
                  <Input id="activityType" placeholder="e.g., Club, Sport, Society" {...form.register("activityType")} />
                  {fieldError("activityType") && (
                    <p className="text-sm text-destructive">{fieldError("activityType")}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" {...form.register("startDate")} />
                  {fieldError("startDate") && <p className="text-sm text-destructive">{fieldError("startDate")}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date (optional)</Label>
                  <Input id="endDate" type="date" {...form.register("endDate")} />
                  {fieldError("endDate") && <p className="text-sm text-destructive">{fieldError("endDate")}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea id="description" rows={2} {...form.register("description")} />
                {fieldError("description") && <p className="text-sm text-destructive">{fieldError("description")}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="achievements">Achievements (optional)</Label>
                <Textarea id="achievements" rows={2} {...form.register("achievements")} />
                {fieldError("achievements") && (
                  <p className="text-sm text-destructive">{fieldError("achievements")}</p>
                )}
              </div>

              {formMode === "edit" && (
                <p className="text-sm text-muted-foreground">
                  Optional fields can be changed but not cleared. Leaving one blank keeps its current value — to
                  remove it, delete the activity and add it again.
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForm} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : formMode === "edit" ? "Save Changes" : "Add Activity"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={openCreate} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Activity
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {error instanceof Error ? error.message : "Failed to load activities."}
                  </AlertDescription>
                </Alert>
              ) : activities.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center">
                  <p className="text-muted-foreground">No activities recorded yet.</p>
                  <p className="text-sm text-muted-foreground">
                    Use “Add Activity” to record this student’s participation.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Achievements</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="font-medium">{activity.activityName}</TableCell>
                          <TableCell>{activity.activityType}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDateRange(activity.startDate, activity.endDate)}
                          </TableCell>
                          <TableCell>{activity.achievements ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(activity)}
                              aria-label={`Edit ${activity.activityName}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleting(activity)}
                              aria-label={`Remove ${activity.activityName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this activity?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.activityName}” will be permanently removed from this student’s record. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleting) deleteMutation.mutate(deleting)
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
