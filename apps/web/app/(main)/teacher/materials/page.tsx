"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { Loader2, Trash2, Upload, FileText, Download } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { getCurrentUser } from "@/lib/auth"
import {
  ALLOWED_MATERIAL_MIME_TYPES,
  MAX_MATERIAL_UPLOAD_MB,
  extractApiError,
  formatFileSize,
  type StudyMaterial,
  type ClassOption,
  type SubjectOption,
  type SubjectAssignment,
} from "@/lib/materials"

const materialSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255, "Must be 255 characters or fewer"),
  description: z.string().trim().max(2000, "Must be 2000 characters or fewer").optional(),
})

type MaterialFormValues = z.infer<typeof materialSchema>

async function fetchJson<T>(path: string, fallback: string): Promise<T> {
  const res = await apiFetch(path)
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(extractApiError(data, fallback))
  }
  return data as T
}

/**
 * Real upload progress requires XMLHttpRequest — fetch() has no
 * upload-progress event in any browser. First use of XHR in this codebase;
 * every other call uses fetch/apiFetch.
 */
function uploadMaterial(
  formData: FormData,
  token: string | undefined,
  onProgress: (pct: number) => void
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/materials")
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // no JSON body
      }
      resolve({ status: xhr.status, body })
    }
    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.send(formData)
  })
}

export default function TeacherMaterialsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Role guard — TEACHER only. Story 9.2's POST /api/materials is
  // TEACHER-only (not admin), so anyone else visiting this page would hit
  // 403 on every upload with no recourse.
  const user = getCurrentUser()
  const isAuthorized = !user || user.role === "teacher"

  useEffect(() => {
    if (!isAuthorized) {
      router.replace("/unauthorized")
    }
  }, [isAuthorized, router])

  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [classId, setClassId] = useState<string>("none")
  const [subjectId, setSubjectId] = useState<string>("none")
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StudyMaterial | null>(null)

  const {
    data: classes = [],
    isLoading: classesLoading,
    isError: classesError,
  } = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => fetchJson<ClassOption[]>("/api/teachers/me/classes", "Failed to fetch your classes"),
    retry: false,
  })

  const {
    data: subjects = [],
    isLoading: subjectsLoading,
    isError: subjectsError,
  } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => fetchJson<SubjectOption[]>("/api/subjects", "Failed to fetch subjects"),
    retry: false,
  })

  // Story 9.3 AC #3: a teacher may also hold a subject-teaching assignment
  // for a class she doesn't own — GET /api/teachers/me/classes intentionally
  // stays "owned only" (other pages depend on that), so we merge in
  // /api/teachers/me/subject-assignments here instead. If this query fails,
  // degrade gracefully to owned classes only rather than blanking the picker.
  const {
    data: subjectAssignments = [],
    isLoading: subjectAssignmentsLoading,
    isError: subjectAssignmentsError,
  } = useQuery({
    queryKey: ["teacher-subject-assignments"],
    queryFn: () =>
      fetchJson<SubjectAssignment[]>(
        "/api/teachers/me/subject-assignments",
        "Failed to fetch subject assignments"
      ),
    retry: false,
  })

  // Merge owned classes with subject-assigned classes, deduplicated by id.
  // Owned classes win on conflicting names (there shouldn't be any, since
  // both sources ultimately name the same class row).
  const mergedClasses = useMemo<ClassOption[]>(() => {
    const byId = new Map<string, ClassOption>()
    for (const c of classes) byId.set(c.id, c)
    for (const a of subjectAssignments) {
      if (!byId.has(a.classId)) byId.set(a.classId, { id: a.classId, name: a.className })
    }
    return Array.from(byId.values())
  }, [classes, subjectAssignments])

  // GET /api/materials requires exactly one of classId/subjectId per call —
  // query once per class the teacher may upload to (owned + subject-assigned)
  // and merge, deduplicating by id.
  // Known gap (Story 9.3 Open Question 2): a teacher with zero assigned
  // classes will not see subject-only materials here.
  const {
    data: materials = [],
    isLoading: materialsLoading,
    isError: materialsError,
  } = useQuery({
    queryKey: ["materials", mergedClasses.map((c) => c.id)],
    queryFn: async () => {
      const results = await Promise.all(
        mergedClasses.map((c) =>
          fetchJson<StudyMaterial[]>(`/api/materials?classId=${c.id}`, "Failed to fetch materials")
        )
      )
      const merged = new Map<string, StudyMaterial>()
      for (const list of results) {
        for (const m of list) merged.set(m.id, m)
      }
      return Array.from(merged.values())
    },
    enabled: mergedClasses.length > 0,
    retry: false,
  })

  const form = useForm<MaterialFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(materialSchema as any),
    defaultValues: { title: "", description: "" },
  })

  function validateFile(f: File): string | null {
    if (!(ALLOWED_MATERIAL_MIME_TYPES as readonly string[]).includes(f.type)) {
      return "File type not allowed. Only PDF, DOC/DOCX, and images (JPEG, PNG, GIF, WebP) are accepted."
    }
    if (f.size > MAX_MATERIAL_UPLOAD_MB * 1024 * 1024) {
      return `File exceeds the maximum allowed size of ${MAX_MATERIAL_UPLOAD_MB}MB.`
    }
    return null
  }

  const uploadMutation = useMutation({
    mutationFn: async (values: MaterialFormValues) => {
      if (!file) throw new Error("No file selected")

      const formData = new FormData()
      formData.append("title", values.title)
      if (values.description) formData.append("description", values.description)
      if (classId !== "none") formData.append("classId", classId)
      if (subjectId !== "none") formData.append("subjectId", subjectId)
      formData.append("file", file)

      const currentUser = getCurrentUser()
      const { status, body } = await uploadMaterial(formData, currentUser?.token, setUploadProgress)

      if (status < 200 || status >= 300) {
        throw new Error(extractApiError(body, "Upload failed"))
      }
      return body as StudyMaterial
    },
    onMutate: () => {
      setUploadProgress(0)
    },
    onSuccess: () => {
      toast.success("Material uploaded successfully")
      queryClient.invalidateQueries({ queryKey: ["materials"] })
      form.reset()
      setFile(null)
      setFileError(null)
      setClassId("none")
      setSubjectId("none")
      setUploadProgress(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setUploadProgress(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/materials/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to delete material"))
      return data
    },
    onSuccess: () => {
      toast.success("Material deleted")
      queryClient.invalidateQueries({ queryKey: ["materials"] })
      setDeleteTarget(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setDeleteTarget(null)
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    if (!selected) {
      setFile(null)
      setFileError(null)
      return
    }
    const error = validateFile(selected)
    setFileError(error)
    setFile(error ? null : selected)
  }

  const hasTarget = classId !== "none" || subjectId !== "none"
  const canSubmit = !!file && !fileError && hasTarget && !uploadMutation.isPending

  function classOrSubjectName(m: StudyMaterial): string {
    const parts: string[] = []
    if (m.classId) {
      parts.push(mergedClasses.find((c) => c.id === m.classId)?.name ?? `Class #${m.classId}`)
    }
    if (m.subjectId) {
      parts.push(subjects.find((s) => s.id === m.subjectId)?.name ?? `Subject #${m.subjectId}`)
    }
    return parts.length > 0 ? parts.join(" / ") : "—"
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Study Materials</h1>
        <p className="text-muted-foreground">Upload and manage study materials for your classes and subjects.</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Upload a Material</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={form.handleSubmit((values) => uploadMutation.mutate(values))}
            className="space-y-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="material-title">Title</Label>
              <Input id="material-title" {...form.register("title")} className="w-full" />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="material-description">Description (optional)</Label>
              <Textarea id="material-description" {...form.register("description")} className="w-full" />
              {form.formState.errors.description && (
                <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="material-class">Class</Label>
                {classesError && mergedClasses.length === 0 ? (
                  <p className="text-xs text-destructive">Failed to load classes.</p>
                ) : (
                  <Select
                    name="classId"
                    value={classId}
                    onValueChange={setClassId}
                    disabled={classesLoading || subjectAssignmentsLoading}
                  >
                    <SelectTrigger id="material-class" className="w-full">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No class</SelectItem>
                      {mergedClasses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!classesError && subjectAssignmentsError && (
                  <p className="text-xs text-destructive">
                    Failed to load subject-assigned classes. Showing your owned classes only.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="material-subject">Subject</Label>
                {subjectsError ? (
                  <p className="text-xs text-destructive">Failed to load subjects.</p>
                ) : (
                  <Select name="subjectId" value={subjectId} onValueChange={setSubjectId} disabled={subjectsLoading}>
                    <SelectTrigger id="material-subject" className="w-full">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No subject</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {!hasTarget && (
              <p className="text-xs text-muted-foreground">Select at least one of class or subject.</p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="material-file">File</Label>
              <Input
                id="material-file"
                name="file"
                type="file"
                accept={ALLOWED_MATERIAL_MIME_TYPES.join(",")}
                className="cursor-pointer w-full"
                onChange={handleFileChange}
              />
              {file && !fileError && (
                <p className="text-sm text-muted-foreground">
                  {file.name} ({formatFileSize(file.size)})
                </p>
              )}
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
              <p className="text-xs text-muted-foreground">
                PDF, DOC/DOCX, or image. Max {MAX_MATERIAL_UPLOAD_MB}MB.
              </p>
            </div>

            {uploadProgress !== null && (
              <div className="space-y-1">
                <Progress value={uploadProgress} />
                <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
              </div>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {uploadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Uploaded Materials</CardTitle>
        </CardHeader>
        <CardContent>
          {materialsError ? (
            <Alert variant="destructive">
              <AlertDescription>Failed to load materials.</AlertDescription>
            </Alert>
          ) : materialsLoading && mergedClasses.length > 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : materials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No materials uploaded yet.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Class / Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>{classOrSubjectName(m)}</TableCell>
                      <TableCell>{m.fileType}</TableCell>
                      <TableCell>{new Date(m.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              try {
                                const res = await apiFetch(`/api/materials/${m.id}/download`)
                                if (!res.ok) throw new Error("Download failed")
                                
                                const blob = await res.blob()
                                const url = window.URL.createObjectURL(blob)
                                const a = document.createElement("a")
                                a.href = url
                                
                                const contentDisposition = res.headers.get("Content-Disposition")
                                let filename = `${m.title}`
                                if (contentDisposition) {
                                  const match = contentDisposition.match(/filename="?([^"]+)"?/)
                                  if (match && match[1]) filename = match[1]
                                }
                                a.download = filename
                                document.body.appendChild(a)
                                a.click()
                                window.URL.revokeObjectURL(url)
                                document.body.removeChild(a)
                              } catch (err) {
                                toast.error("Failed to download material")
                              }
                            }}
                          >
                            <Download className="h-4 w-4 text-muted-foreground" />
                            <span className="sr-only">Download {m.title}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete {m.title}</span>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent className="max-w-full sm:max-w-lg mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.title}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
