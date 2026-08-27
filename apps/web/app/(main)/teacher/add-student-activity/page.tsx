"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Pencil, Plus, Search, Trash2, UserRoundCheck, X } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { type Activity, toDateInputValue, formatDateRange, extractApiError } from "@/lib/activities"

interface StudentResult {
  id: number
  fullName: string
  indexNumber: string
}

interface ActivityFormState {
  activityName: string
  activityType: string
  description: string
  startDate: string
  endDate: string
  achievements: string
  evidenceUrl: string
}

const emptyForm: ActivityFormState = {
  activityName: "",
  activityType: "",
  description: "",
  startDate: "",
  endDate: "",
  achievements: "",
  evidenceUrl: "",
}

/** Mirrors the API's Zod rules (validators/activityValidators.ts). */
function validate(fields: ActivityFormState): string | null {
  if (!fields.activityName.trim()) return "Activity name is required"
  if (fields.activityName.trim().length > 255) return "Activity name must be 255 characters or fewer"
  if (!fields.activityType.trim()) return "Activity type is required"
  if (fields.activityType.trim().length > 100) return "Activity type must be 100 characters or fewer"
  if (!fields.startDate) return "Start date is required"
  if (fields.endDate && fields.endDate < fields.startDate) return "End date must be on or after start date"
  if (fields.description.length > 2000) return "Description must be 2000 characters or fewer"
  if (fields.achievements.length > 2000) return "Achievements must be 2000 characters or fewer"
  if (fields.evidenceUrl && !/^https?:\/\//i.test(fields.evidenceUrl)) {
    return "Evidence URL must be a valid http(s) URL"
  }
  return null
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function searchStudents(query: string): Promise<StudentResult[]> {
  const params = new URLSearchParams()
  // A bare digit string is almost always an index number lookup; anything
  // else is a name search. Keeping this to one field keeps the picker
  // deliberately small — the full multi-filter search lives on its own page.
  if (/^[a-zA-Z0-9-]+$/.test(query) && /\d/.test(query)) {
    params.append("studentId", query)
  } else {
    params.append("fullName", query)
  }
  const res = await apiFetch(`/api/students/search?${params.toString()}`)
  if (!res.ok) {
    throw new Error(extractApiError(await readJson(res), "Failed to search students"))
  }
  const data = await res.json()
  return (data.students ?? []) as StudentResult[]
}

async function fetchActivities(studentId: number): Promise<Activity[]> {
  const res = await apiFetch(`/api/students/${studentId}/activities`)
  if (!res.ok) {
    throw new Error(extractApiError(await readJson(res), "Failed to load activities"))
  }
  return res.json()
}

export default function AddStudentActivityPage() {
  const queryClient = useQueryClient()

  const [query, setQuery] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [fields, setFields] = useState<ActivityFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Activity | null>(null)

  const searchQuery = useQuery({
    queryKey: ["student-lookup", submittedQuery],
    queryFn: () => searchStudents(submittedQuery),
    enabled: submittedQuery.trim().length > 0,
    retry: false,
  })

  const activitiesQuery = useQuery({
    queryKey: ["activities", selectedStudent?.id],
    queryFn: () => fetchActivities(selectedStudent!.id),
    enabled: selectedStudent !== null,
    retry: false,
    staleTime: 0,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittedQuery(query.trim())
  }

  const changeStudent = () => {
    setSelectedStudent(null)
    closeForm()
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setFields(emptyForm)
    setFormError(null)
  }

  const openAddForm = () => {
    setEditing(null)
    setFields(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  const openEditForm = (activity: Activity) => {
    setEditing(activity)
    setFields({
      activityName: activity.activityName,
      activityType: activity.activityType,
      description: activity.description ?? "",
      startDate: toDateInputValue(activity.startDate),
      endDate: activity.endDate ? toDateInputValue(activity.endDate) : "",
      achievements: activity.achievements ?? "",
      evidenceUrl: activity.evidenceUrl ?? "",
    })
    setFormError(null)
    setShowForm(true)
  }

  const createMutation = useMutation({
    mutationFn: async (vars: { studentId: number; payload: Record<string, unknown> }) => {
      const res = await apiFetch(`/api/students/${vars.studentId}/activities`, {
        method: "POST",
        body: JSON.stringify(vars.payload),
      })
      if (!res.ok) throw new Error(extractApiError(await readJson(res), "Failed to add activity"))
      return res.json() as Promise<Activity>
    },
    // `vars.studentId` is the argument passed to `.mutate()`, not a live read
    // of `selectedStudent` — correct even if the student changes mid-save.
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["activities", vars.studentId] })
      toast.success("Activity added")
      closeForm()
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toast.error(err.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (vars: { studentId: number; activityId: string; payload: Record<string, unknown> }) => {
      const res = await apiFetch(`/api/activities/${vars.activityId}`, {
        method: "PUT",
        body: JSON.stringify(vars.payload),
      })
      if (!res.ok) throw new Error(extractApiError(await readJson(res), "Failed to update activity"))
      return res.json() as Promise<Activity>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["activities", vars.studentId] })
      toast.success("Activity updated")
      closeForm()
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toast.error(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (vars: { studentId: number; activityId: string }) => {
      const res = await apiFetch(`/api/activities/${vars.activityId}`, { method: "DELETE" })
      if (!res.ok) throw new Error(extractApiError(await readJson(res), "Failed to delete activity"))
      return res.json()
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["activities", vars.studentId] })
      toast.success("Activity deleted")
    },
    onError: (err: Error, vars) => {
      toast.error(err.message)
      // Covers a concurrent delete (404): refresh either way so a phantom
      // row never lingers just because this specific attempt failed.
      queryClient.invalidateQueries({ queryKey: ["activities", vars.studentId] })
    },
    onSettled: () => setDeleting(null),
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleSubmit = () => {
    if (!selectedStudent) return
    setFormError(null)
    const validationError = validate(fields)
    if (validationError) {
      setFormError(validationError)
      return
    }

    if (editing) {
      // Send only what changed. Optional fields left blank are omitted, not
      // sent as "" — the API treats a missing key as "unchanged" and 400s on
      // an empty string, so this is also how "can't clear yet" is enforced.
      const payload: Record<string, unknown> = {}
      if (fields.activityName.trim() !== editing.activityName) payload.activityName = fields.activityName.trim()
      if (fields.activityType.trim() !== editing.activityType) payload.activityType = fields.activityType.trim()
      if (fields.startDate !== toDateInputValue(editing.startDate)) payload.startDate = fields.startDate
      const prevEndDate = editing.endDate ? toDateInputValue(editing.endDate) : ""
      if (fields.endDate && fields.endDate !== prevEndDate) payload.endDate = fields.endDate
      const nextDescription = fields.description.trim()
      if (nextDescription && nextDescription !== (editing.description ?? "")) payload.description = nextDescription
      const nextAchievements = fields.achievements.trim()
      if (nextAchievements && nextAchievements !== (editing.achievements ?? "")) payload.achievements = nextAchievements
      const nextEvidenceUrl = fields.evidenceUrl.trim()
      if (nextEvidenceUrl && nextEvidenceUrl !== (editing.evidenceUrl ?? "")) payload.evidenceUrl = nextEvidenceUrl

      if (Object.keys(payload).length === 0) {
        closeForm()
        return
      }
      updateMutation.mutate({ studentId: selectedStudent.id, activityId: editing.id, payload })
    } else {
      const payload: Record<string, unknown> = {
        activityName: fields.activityName.trim(),
        activityType: fields.activityType.trim(),
        startDate: fields.startDate,
      }
      if (fields.endDate) payload.endDate = fields.endDate
      if (fields.description.trim()) payload.description = fields.description.trim()
      if (fields.achievements.trim()) payload.achievements = fields.achievements.trim()
      if (fields.evidenceUrl.trim()) payload.evidenceUrl = fields.evidenceUrl.trim()
      createMutation.mutate({ studentId: selectedStudent.id, payload })
    }
  }

  const canAdd = !!selectedStudent && !activitiesQuery.isLoading && !activitiesQuery.error

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Add Student Activity</h1>
        <p className="text-muted-foreground">Record a student's participation in an extracurricular activity.</p>
      </div>

      {!selectedStudent && (
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Find the Student</CardTitle>
            <CardDescription>Search by name or index number, then pick them from the results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Jane Perera or 2026-1045"
                className="flex-1"
              />
              <Button type="submit" disabled={!query.trim()}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </form>

            {searchQuery.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {searchQuery.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {searchQuery.error instanceof Error ? searchQuery.error.message : "Search failed."}
                </AlertDescription>
              </Alert>
            )}

            {searchQuery.data && (
              searchQuery.data.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No students matched that search.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Index Number</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead className="text-right">Select</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchQuery.data.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.indexNumber}</TableCell>
                        <TableCell>{s.fullName}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => setSelectedStudent(s)}>
                            <UserRoundCheck className="mr-2 h-4 w-4" />
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </CardContent>
        </Card>
      )}

      {selectedStudent && (
        <Card className="w-full max-w-3xl">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{selectedStudent.fullName}'s Activities</CardTitle>
              <CardDescription>{selectedStudent.indexNumber}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={changeStudent}>
              <X className="mr-2 h-4 w-4" />
              Change Student
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {activitiesQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : activitiesQuery.data ? (
              activitiesQuery.data.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No activities recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
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
                      {activitiesQuery.data.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="font-medium">{activity.activityName}</TableCell>
                          <TableCell>{activity.activityType}</TableCell>
                          <TableCell>{formatDateRange(activity.startDate, activity.endDate)}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{activity.achievements ?? "—"}</TableCell>
                          <TableCell className="space-x-1 text-right">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEditForm(activity)} aria-label="Edit activity">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(activity)} aria-label="Delete activity">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : activitiesQuery.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {activitiesQuery.error instanceof Error ? activitiesQuery.error.message : "Failed to load activities."}
                </AlertDescription>
              </Alert>
            ) : null}

            {!showForm && (
              <Button onClick={openAddForm} disabled={!canAdd} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Activity
              </Button>
            )}

            {showForm && (
              <div className="space-y-4 border-t pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="activityName">Activity Name</Label>
                    <Input
                      id="activityName"
                      value={fields.activityName}
                      onChange={(e) => setFields((p) => ({ ...p, activityName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="activityType">Activity Type</Label>
                    <Input
                      id="activityType"
                      value={fields.activityType}
                      onChange={(e) => setFields((p) => ({ ...p, activityType: e.target.value }))}
                      placeholder="e.g. Sports, Club, Competition"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={fields.startDate}
                      onChange={(e) => setFields((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date (optional)</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={fields.endDate}
                      onChange={(e) => setFields((p) => ({ ...p, endDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={fields.description}
                      onChange={(e) => setFields((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="achievements">Achievements (optional)</Label>
                    <Textarea
                      id="achievements"
                      value={fields.achievements}
                      onChange={(e) => setFields((p) => ({ ...p, achievements: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="evidenceUrl">Evidence URL (optional)</Label>
                    <Input
                      id="evidenceUrl"
                      value={fields.evidenceUrl}
                      onChange={(e) => setFields((p) => ({ ...p, evidenceUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                {editing && (
                  <p className="text-xs text-muted-foreground">
                    Optional fields can be changed but not cleared — leaving one blank keeps its current value. To
                    remove it, delete the activity and add it again.
                  </p>
                )}

                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
          {showForm && (
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" onClick={closeForm} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Add Activity"}
              </Button>
            </CardFooter>
          )}
        </Card>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this activity?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.activityName}" will be permanently removed.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleting && selectedStudent) {
                  deleteMutation.mutate({ studentId: selectedStudent.id, activityId: deleting.id })
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
