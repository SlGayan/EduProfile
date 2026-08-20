"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreHorizontal, Pencil, Trash2, Users, Filter } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { School } from "lucide-react" // Declare the School variable
import { apiFetch } from "@/lib/apiFetch"

interface ApiClass {
  id: number
  name: string
  year: number | null
  teacher: { id: number; user: { email: string } } | null
  _count: { students: number }
}

interface ApiUser {
  id: number
  email: string
  role: string
  teacher: { id: number } | null
}

interface ClassFormData {
  name: string
  year: number
  teacherId: string
}

export default function ClassManagementPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ApiClass | null>(null)
  const [yearFilter, setYearFilter] = useState<string>("all")
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<ClassFormData>({
    name: "",
    year: new Date().getFullYear(),
    teacherId: "none", // Changed default teacherId from empty string to "none"
  })

  // Fetch classes — the real endpoint takes no query params, so filtering happens client-side below
  const { data: classes = [], isLoading, isError: isClassesError } = useQuery<ApiClass[]>({
    queryKey: ["classes"],
    queryFn: async () => {
      const response = await apiFetch("/api/classes")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to fetch classes")
      return data.classes
    },
  })

  // Fetch teachers — no real /api/teachers endpoint exists yet (Epic 6 Story 6.4);
  // reuse admin/classes/page.tsx's pattern of filtering /api/users client-side instead.
  const { data: allUsers = [], isError: isUsersError } = useQuery<ApiUser[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await apiFetch("/api/users")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to fetch users")
      return data.users
    },
  })
  const teachers = allUsers.filter((u) => u.role === "TEACHER" && u.teacher !== null)

  // Create class mutation
  const createClassMutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      // createClassSchema's teacherId is `.optional()` only (no `.nullable()`) —
      // omit the key entirely rather than sending null, same as admin/classes/page.tsx.
      const body: Record<string, unknown> = { name: data.name, year: data.year }
      if (data.teacherId !== "none") body.teacherId = Number(data.teacherId)

      const response = await apiFetch("/api/classes", {
        method: "POST",
        body: JSON.stringify(body),
      })
      const responseData = await response.json()
      if (!response.ok) throw new Error(responseData.error || "Failed to create class")
      return responseData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Class created successfully")
      setIsCreateDialogOpen(false)
      resetForm()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Update class mutation
  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ClassFormData }) => {
      const response = await apiFetch(`/api/classes/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          year: data.year,
          teacherId: data.teacherId !== "none" ? Number(data.teacherId) : null,
        }),
      })
      const responseData = await response.json()
      if (!response.ok) throw new Error(responseData.error || "Failed to update class")
      return responseData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Class updated successfully")
      setIsEditDialogOpen(false)
      setSelectedClass(null)
      resetForm()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Delete class mutation
  const deleteClassMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiFetch(`/api/classes/${id}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete class")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] })
      toast.success("Class deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const resetForm = () => {
    setFormData({
      name: "",
      year: new Date().getFullYear(),
      teacherId: "none", // Changed default teacherId from empty string to "none"
    })
  }

  const handleCreate = () => {
    createClassMutation.mutate(formData)
  }

  // Guard against NaN (e.g. the field cleared mid-edit) rather than letting it
  // serialize to `null` and either fail create's non-nullable schema or, on
  // update, silently wipe an existing class's year.
  const handleYearChange = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isNaN(parsed)) {
      setFormData({ ...formData, year: parsed })
    }
  }

  const handleEdit = (classItem: ApiClass) => {
    setSelectedClass(classItem)
    setFormData({
      name: classItem.name,
      year: classItem.year ?? new Date().getFullYear(),
      teacherId: classItem.teacher ? String(classItem.teacher.id) : "none",
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdate = () => {
    if (selectedClass) {
      updateClassMutation.mutate({ id: selectedClass.id, data: formData })
    }
  }

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this class?")) {
      deleteClassMutation.mutate(id)
    }
  }

  // Reset regardless of how the dialog closes (Cancel, X, Escape, overlay click) —
  // and on open too, so leftover data from a cancelled Edit can't leak into Create.
  const handleCreateDialogChange = (open: boolean) => {
    resetForm()
    setIsCreateDialogOpen(open)
  }

  const handleEditDialogChange = (open: boolean) => {
    setIsEditDialogOpen(open)
    if (!open) {
      resetForm()
      setSelectedClass(null)
    }
  }

  const filteredClasses = yearFilter === "all" ? classes : classes.filter((c) => String(c.year) === yearFilter)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Class Management</h1>
          <p className="text-muted-foreground">Manage classes, assign teachers, and organize student rosters</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Class
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Class</DialogTitle>
              <DialogDescription>Add a new class to the school system</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Class Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., 10A, 11 Science"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Academic Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => handleYearChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher">Assign Teacher</Label>
                <Select
                  value={formData.teacherId}
                  onValueChange={(value) => setFormData({ ...formData, teacherId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No teacher assigned</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={String(teacher.teacher!.id)}>
                        {teacher.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleCreateDialogChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createClassMutation.isPending}>
                {createClassMutation.isPending ? "Creating..." : "Create Class"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banners */}
      {isClassesError && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load classes. Make sure the API is running and you are logged in.
        </p>
      )}
      {isUsersError && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load teachers — the teacher-assignment dropdown may be incomplete.
        </p>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex-1 space-y-2">
              <Label>Academic Year</Label>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Classes</CardTitle>
          <CardDescription>
            {filteredClasses.length} {filteredClasses.length === 1 ? "class" : "classes"} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <School className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No classes found</h3>
              <p className="mb-4 text-sm text-muted-foreground">Create your first class to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class Name</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClasses.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell className="font-medium">{classItem.name}</TableCell>
                      <TableCell>{classItem.year ?? "N/A"}</TableCell>
                      <TableCell>
                        {classItem.teacher ? (
                          classItem.teacher.user.email
                        ) : (
                          <span className="text-muted-foreground">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {classItem._count.students}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEdit(classItem)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit Class
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={`/principal/classes/${classItem.id}/roster`}>
                                <Users className="mr-2 h-4 w-4" />
                                Manage Roster
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(classItem.id)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Class
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
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
            <DialogDescription>Update class information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Class Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-year">Academic Year</Label>
              <Input
                id="edit-year"
                type="number"
                value={formData.year}
                onChange={(e) => handleYearChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-teacher">Assign Teacher</Label>
              <Select
                value={formData.teacherId}
                onValueChange={(value) => setFormData({ ...formData, teacherId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No teacher assigned</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={String(teacher.teacher!.id)}>
                      {teacher.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleEditDialogChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateClassMutation.isPending}>
              {updateClassMutation.isPending ? "Updating..." : "Update Class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
