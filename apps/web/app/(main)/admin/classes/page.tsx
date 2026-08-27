"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MoreHorizontal,
  Plus,
  Loader2,
  Users,
  Pencil,
  Trash2,
  School,
  UserMinus,
  UserPlus,
  BookOpen,
} from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { getCurrentUser } from "@/lib/auth"

// ---------------------------------------------------------------------------
// Types — mirroring actual API response shapes from /api/classes and /api/users
// ---------------------------------------------------------------------------

interface ApiTeacherRecord {
  id: number
  userId: number
  user: { email: string }
}

interface ApiStudentRecord {
  id: number        // Student.id (used for class membership calls)
  userId: number
  user: { email: string }
}

interface ApiClass {
  id: number
  name: string
  year: number | null
  teacherId: number | null
  teacher: ApiTeacherRecord | null
  _count: { students: number }
}

interface ApiClassDetail extends ApiClass {
  students: ApiStudentRecord[]
}

// Row shape from GET /api/classes/:id/subject-assignments
interface ApiSubjectAssignment {
  id: number
  teacherId: number
  subjectId: number
  classId: number
  teacher: { id: number; user: { email: string } }
  subject: { id: number; name: string }
}

// Row shape from GET /api/subjects (a raw array, not { subjects: [...] })
interface ApiSubjectOption {
  id: string
  name: string
}

// User records from GET /api/users (includes nested teacher/student profile ids)
interface ApiUser {
  id: number
  email: string
  role: string
  teacher: { id: number } | null
  student: { id: number; fullName: string; indexNumber: string } | null
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  year: z
    .number({ invalid_type_error: "Year must be a number" })
    .int()
    .min(2000, "Year must be 2000 or later")
    .max(2100, "Year must be 2100 or earlier")
    .optional(),
})

type ClassFormValues = z.infer<typeof classSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

async function fetchClasses(): Promise<ApiClass[]> {
  const res = await apiFetch("/api/classes")
  if (!res.ok) throw new Error("Failed to fetch classes")
  const data = await res.json()
  return data.classes
}

async function fetchClassDetail(id: number): Promise<ApiClassDetail> {
  const res = await apiFetch(`/api/classes/${id}`)
  if (!res.ok) throw new Error("Failed to fetch class")
  const data = await res.json()
  return data.class
}

async function fetchUsers(): Promise<ApiUser[]> {
  const res = await apiFetch("/api/users")
  if (!res.ok) throw new Error("Failed to fetch users")
  const data = await res.json()
  return data.users
}

async function fetchClassSubjectAssignments(classId: number): Promise<ApiSubjectAssignment[]> {
  const res = await apiFetch(`/api/classes/${classId}/subject-assignments`)
  if (!res.ok) throw new Error("Failed to fetch subject assignments")
  const data = await res.json()
  return data.assignments
}

async function fetchSubjects(): Promise<ApiSubjectOption[]> {
  const res = await apiFetch("/api/subjects")
  if (!res.ok) throw new Error("Failed to fetch subjects")
  return res.json()
}

// ---------------------------------------------------------------------------
// Roster modal
// ---------------------------------------------------------------------------

function RosterModal({
  classItem,
  open,
  onClose,
}: {
  classItem: ApiClass | null
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [studentSearch, setStudentSearch] = useState("")
  const [removeTarget, setRemoveTarget] = useState<ApiStudentRecord | null>(null)

  const { data: classDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["class", classItem?.id],
    queryFn: () => fetchClassDetail(classItem!.id),
    enabled: open && classItem !== null,
  })

  // Fetch all users to build the student picker
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    enabled: open,
  })

  const allStudents = allUsers.filter(
    (u) => u.role === "STUDENT" && u.student !== null,
  )

  const filteredStudents = studentSearch.trim().length >= 2
    ? allStudents.filter((u) => {
        const query = studentSearch.toLowerCase()
        return (
          u.email.toLowerCase().includes(query) ||
          u.student!.fullName.toLowerCase().includes(query) ||
          u.student!.indexNumber.toLowerCase().includes(query)
        )
      })
    : []

  const enrolledStudentIds = new Set(
    (classDetail?.students ?? []).map((s) => s.id),
  )

  const addStudentMutation = useMutation({
    mutationFn: async (studentId: number) => {
      const res = await apiFetch(`/api/classes/${classItem!.id}/students`, {
        method: "POST",
        body: JSON.stringify({ studentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add student")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class", classItem?.id] })
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Student added to class")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeStudentMutation = useMutation({
    mutationFn: async (studentId: number) => {
      const res = await apiFetch(
        `/api/classes/${classItem!.id}/students/${studentId}`,
        { method: "DELETE" },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to remove student")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class", classItem?.id] })
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Student removed from class")
      setRemoveTarget(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setRemoveTarget(null)
    },
  })

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent className="max-w-full sm:max-w-2xl mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
          <DialogHeader>
            <DialogTitle>Manage Roster — {classItem?.name}</DialogTitle>
            <DialogDescription>
              Add or remove students from this class.
            </DialogDescription>
          </DialogHeader>

          {/* Enrolled students */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Enrolled Students</h3>
            {loadingDetail ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : classDetail?.students.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No students enrolled yet.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classDetail?.students.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.user.email}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(s)}
                          >
                            <UserMinus className="h-4 w-4" />
                            <span className="sr-only">Remove {s.user.email}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Add student search */}
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Add Student</h3>
            <Input
              placeholder="Search by name, index number, or email (min 2 characters)…"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            {studentSearch.trim().length >= 2 && filteredStudents.length === 0 && (
              <p className="text-xs text-muted-foreground">No students found.</p>
            )}
            {filteredStudents.length > 0 && (
              <div className="rounded-md border max-h-48 overflow-y-auto">
                <Table>
                  <TableBody>
                    {filteredStudents.map((u) => {
                      const studentId = u.student!.id
                      const enrolled = enrolledStudentIds.has(studentId)
                      return (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div>{u.student!.fullName}</div>
                            <div className="text-xs text-muted-foreground">
                              {u.student!.indexNumber} · {u.email}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {enrolled ? (
                              <Badge variant="outline" className="text-xs">Enrolled</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={addStudentMutation.isPending}
                                onClick={() => addStudentMutation.mutate(studentId)}
                              >
                                <UserPlus className="mr-1 h-3 w-3" />
                                Add
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Student</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{removeTarget?.user.email}</strong> from{" "}
              <strong>{classItem?.name}</strong>? They can be re-added at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeStudentMutation.isPending}
              onClick={() => removeTarget && removeStudentMutation.mutate(removeTarget.id)}
            >
              {removeStudentMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Subject assignments modal
// ---------------------------------------------------------------------------

function SubjectAssignmentsModal({
  classItem,
  teachers,
  open,
  onClose,
}: {
  classItem: ApiClass | null
  teachers: ApiUser[]
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("")
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("")
  const [warningMessage, setWarningMessage] = useState<string | null>(null)

  const { data: assignments = [], isLoading: loadingAssignments, isError: assignmentsError } = useQuery({
    queryKey: ["class-subject-assignments", classItem?.id],
    queryFn: () => fetchClassSubjectAssignments(classItem!.id),
    enabled: open && classItem !== null,
  })

  const { data: subjects = [], isError: subjectsError, isLoading: subjectsLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
    enabled: open,
  })

  // Reset local state when the modal closes or switches to a different class,
  // since this component stays mounted across different classItem values.
  useEffect(() => {
    setSelectedTeacherId("")
    setSelectedSubjectId("")
    setWarningMessage(null)
  }, [open, classItem?.id])

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/teacher-subject-assignments", {
        method: "POST",
        body: JSON.stringify({
          teacherId: Number(selectedTeacherId),
          subjectId: Number(selectedSubjectId),
          classId: classItem!.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add assignment")
      return data as { assignment: unknown; warning?: string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["class-subject-assignments", classItem?.id] })
      toast.success("Teacher assigned to subject")
      if (data.warning) {
        setWarningMessage(data.warning)
        toast.warning(data.warning)
      } else {
        setWarningMessage(null)
      }
      setSelectedTeacherId("")
      setSelectedSubjectId("")
    },
    onError: (err: Error) => {
      setWarningMessage(null)
      toast.error(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/teacher-subject-assignments/${id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to remove assignment")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-subject-assignments", classItem?.id] })
      toast.success("Assignment removed")
      setWarningMessage(null)
    },
    onError: (err: Error) => {
      // 404 (already removed) still means the list is stale — refresh it too.
      queryClient.invalidateQueries({ queryKey: ["class-subject-assignments", classItem?.id] })
      toast.error(err.message)
      setWarningMessage(null)
    },
  })

  const canSubmit = selectedTeacherId !== "" && selectedSubjectId !== ""

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-full sm:max-w-2xl mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
        <DialogHeader>
          <DialogTitle>Subject Teachers — {classItem?.name}</DialogTitle>
          <DialogDescription>
            Assign teachers to teach subjects in this class.
          </DialogDescription>
        </DialogHeader>

        {warningMessage && (
          <Badge
            variant="outline"
            className="w-fit border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400"
          >
            {warningMessage}
          </Badge>
        )}

        {/* Current assignments */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Current Assignments</h3>
          {loadingAssignments ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : assignmentsError ? (
            <p className="text-sm text-destructive py-4 text-center">
              Failed to load subject assignments.
            </p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No subject assignments yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.teacher.user.email}</TableCell>
                      <TableCell>{a.subject.name}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(a.id)}
                        >
                          <UserMinus className="h-4 w-4" />
                          <span className="sr-only">
                            Remove {a.teacher.user.email} from {a.subject.name}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Add assignment */}
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Add Teacher to Subject</h3>
          {subjectsError && (
            <p className="text-xs text-destructive">Failed to load subjects</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="sa-teacher" className="sr-only">Teacher</Label>
              <Select
                value={selectedTeacherId}
                onValueChange={setSelectedTeacherId}
                disabled={createMutation.isPending}
              >
                <SelectTrigger id="sa-teacher">
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.teacher!.id} value={String(t.teacher!.id)}>
                      {t.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="sa-subject" className="sr-only">Subject</Label>
              <Select
                value={selectedSubjectId}
                onValueChange={setSelectedSubjectId}
                disabled={subjectsError || subjectsLoading || createMutation.isPending}
              >
                <SelectTrigger id="sa-subject">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ClassManagementPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Role guard — only ADMINISTRATOR or PRINCIPAL (stored lowercase in auth)
  useEffect(() => {
    const user = getCurrentUser()
    if (user && user.role !== "admin" && user.role !== "principal") {
      router.replace("/unauthorized")
    }
  }, [router])

  // Modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [editClass, setEditClass] = useState<ApiClass | null>(null)
  const [deleteClass, setDeleteClass] = useState<ApiClass | null>(null)
  const [rosterClass, setRosterClass] = useState<ApiClass | null>(null)
  const [assignmentsClass, setAssignmentsClass] = useState<ApiClass | null>(null)

  // Teacher select state (uncontrolled relative to RHF since shadcn Select doesn't use register)
  const [createTeacherId, setCreateTeacherId] = useState<string>("none")
  const [editTeacherId, setEditTeacherId] = useState<string>("none")

  // Queries
  const { data: classes = [], isLoading, isError } = useQuery({
    queryKey: ["classes"],
    queryFn: fetchClasses,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  })

  const teachers = allUsers.filter(
    (u) => u.role === "TEACHER" && u.teacher !== null,
  )

  // Create form
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createForm = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema as any),
    defaultValues: { name: "", year: new Date().getFullYear() },
  })

  const createMutation = useMutation({
    mutationFn: async (values: ClassFormValues) => {
      const body: Record<string, unknown> = { name: values.name }
      if (values.year) body.year = values.year
      if (createTeacherId !== "none") body.teacherId = Number(createTeacherId)

      const res = await apiFetch("/api/classes", {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create class")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Class created successfully")
      setCreateOpen(false)
      createForm.reset()
      setCreateTeacherId("none")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Edit form
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editForm = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema as any),
    defaultValues: { name: "", year: new Date().getFullYear() },
  })

  const openEdit = (cls: ApiClass) => {
    setEditClass(cls)
    editForm.reset({ name: cls.name, year: cls.year ?? undefined })
    setEditTeacherId(cls.teacherId !== null ? String(cls.teacherId) : "none")
  }

  const editMutation = useMutation({
    mutationFn: async (values: ClassFormValues) => {
      if (!editClass) return
      const body: Record<string, unknown> = { name: values.name }
      if (values.year !== undefined) body.year = values.year
      body.teacherId = editTeacherId !== "none" ? Number(editTeacherId) : null

      const res = await apiFetch(`/api/classes/${editClass.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update class")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Class updated successfully")
      setEditClass(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/classes/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete class")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Class deleted")
      setDeleteClass(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setDeleteClass(null)
    },
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Class Management</h1>
          <p className="text-muted-foreground">
            Create classes, assign teachers, and manage student rosters.
          </p>
        </div>
        <Button
          onClick={() => {
            createForm.reset()
            setCreateTeacherId("none")
            setCreateOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Class
        </Button>
      </div>

      {/* Error banner */}
      {isError && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load classes. Make sure the API is running and you are logged in.
        </p>
      )}

      {/* Classes table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border bg-card">
          <School className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No classes yet</h3>
          <p className="text-sm text-muted-foreground">
            Click <strong>Create Class</strong> to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class Name</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Assigned Teacher</TableHead>
                <TableHead>Students</TableHead>
                <TableHead className="w-[70px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((cls) => (
                <TableRow key={cls.id}>
                  <TableCell className="font-medium">{cls.name}</TableCell>
                  <TableCell>{cls.year ?? <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                  <TableCell>
                    {cls.teacher ? (
                      cls.teacher.user.email
                    ) : (
                      <span className="text-muted-foreground text-sm">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{cls._count.students}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEdit(cls)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRosterClass(cls)}>
                          <Users className="mr-2 h-4 w-4" />
                          Manage Roster
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssignmentsClass(cls)}>
                          <BookOpen className="mr-2 h-4 w-4" />
                          Subject Teachers
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteClass(cls)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Class dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-full sm:max-w-md mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
          <DialogHeader>
            <DialogTitle>Create Class</DialogTitle>
            <DialogDescription>Add a new class to the school.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="create-cls-name">Class Name</Label>
                <Input
                  id="create-cls-name"
                  placeholder="e.g. 10A, 11 Science"
                  {...createForm.register("name")}
                />
                <FieldError message={createForm.formState.errors.name?.message} />
              </div>
              <div>
                <Label htmlFor="create-cls-year">Academic Year</Label>
                <Input
                  id="create-cls-year"
                  type="number"
                  placeholder={String(new Date().getFullYear())}
                  {...createForm.register("year", { valueAsNumber: true })}
                />
                <FieldError message={createForm.formState.errors.year?.message} />
              </div>
              <div>
                <Label htmlFor="create-cls-teacher">Assigned Teacher (optional)</Label>
                <Select value={createTeacherId} onValueChange={setCreateTeacherId}>
                  <SelectTrigger id="create-cls-teacher">
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No teacher assigned</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.teacher!.id} value={String(t.teacher!.id)}>
                        {t.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Class dialog */}
      <Dialog open={!!editClass} onOpenChange={(o) => { if (!o) setEditClass(null) }}>
        <DialogContent className="max-w-full sm:max-w-md mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
            <DialogDescription>Update details for {editClass?.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit((v) => editMutation.mutate(v))}>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="edit-cls-name">Class Name</Label>
                <Input
                  id="edit-cls-name"
                  placeholder="e.g. 10A, 11 Science"
                  {...editForm.register("name")}
                />
                <FieldError message={editForm.formState.errors.name?.message} />
              </div>
              <div>
                <Label htmlFor="edit-cls-year">Academic Year</Label>
                <Input
                  id="edit-cls-year"
                  type="number"
                  placeholder={String(new Date().getFullYear())}
                  {...editForm.register("year", { valueAsNumber: true })}
                />
                <FieldError message={editForm.formState.errors.year?.message} />
              </div>
              <div>
                <Label htmlFor="edit-cls-teacher">Assigned Teacher (optional)</Label>
                <Select value={editTeacherId} onValueChange={setEditTeacherId}>
                  <SelectTrigger id="edit-cls-teacher">
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No teacher assigned</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.teacher!.id} value={String(t.teacher!.id)}>
                        {t.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditClass(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteClass}
        onOpenChange={(o) => { if (!o) setDeleteClass(null) }}
      >
        <AlertDialogContent className="max-w-full sm:max-w-lg mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteClass?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteClass && deleteMutation.mutate(deleteClass.id)}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Roster modal */}
      <RosterModal
        classItem={rosterClass}
        open={!!rosterClass}
        onClose={() => setRosterClass(null)}
      />

      {/* Subject assignments modal */}
      <SubjectAssignmentsModal
        classItem={assignmentsClass}
        teachers={teachers}
        open={!!assignmentsClass}
        onClose={() => setAssignmentsClass(null)}
      />
    </div>
  )
}
