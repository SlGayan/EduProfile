"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MoreHorizontal, Plus, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"

type ApiRole = "STUDENT" | "TEACHER" | "PRINCIPAL" | "ADMINISTRATOR"

interface ApiUser {
  id: number
  email: string
  role: ApiRole
  createdAt: string
  updatedAt: string
}

const createSchema = z.object({
  email: z.string().email("Invalid email").endsWith("@edu.com", "Must be an @edu.com email"),
  password: z
    .string()
    .min(6, "At least 6 characters")
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Must contain a letter and a number"),
  role: z.enum(["STUDENT", "TEACHER", "PRINCIPAL", "ADMINISTRATOR"] as const),
})

const editSchema = z.object({
  email: z.string().email("Invalid email").endsWith("@edu.com", "Must be an @edu.com email").optional().or(z.literal("")),
  password: z
    .string()
    .min(6, "At least 6 characters")
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Must contain a letter and a number")
    .optional()
    .or(z.literal("")),
  role: z.enum(["STUDENT", "TEACHER", "PRINCIPAL", "ADMINISTRATOR"] as const).optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof editSchema>

async function fetchUsers(): Promise<ApiUser[]> {
  const res = await apiFetch("/api/users")
  if (!res.ok) throw new Error("Failed to fetch users")
  const data = await res.json()
  return data.users
}

const ROLE_OPTIONS: { label: string; value: ApiRole }[] = [
  { label: "Student", value: "STUDENT" },
  { label: "Teacher", value: "TEACHER" },
  { label: "Principal", value: "PRINCIPAL" },
  { label: "Administrator", value: "ADMINISTRATOR" },
]

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

function UserTable({
  users,
  onEdit,
  onDeactivate,
}: {
  users: ApiUser[]
  onEdit: (user: ApiUser) => void
  onDeactivate: (user: ApiUser) => void
}) {
  if (users.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[70px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <Badge variant="outline">{user.role}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="default">Active</Badge>
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
                  <DropdownMenuItem onClick={() => onEdit(user)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDeactivate(user)}
                  >
                    Deactivate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function UserManagementPage() {
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<ApiUser | null>(null)
  const [deactivateUser, setDeactivateUser] = useState<ApiUser | null>(null)

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  })

  const teachers = users.filter((u) => u.role === "TEACHER")
  const principals = users.filter((u) => u.role === "PRINCIPAL")
  const students = users.filter((u) => u.role === "STUDENT")

  // Create
  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", role: "STUDENT" },
  })

  const createMutation = useMutation({
    mutationFn: async (values: CreateFormValues) => {
      const res = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create user")
      return data.user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User created successfully")
      setCreateOpen(false)
      createForm.reset()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Edit
  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { email: "", password: "", role: undefined },
  })

  const openEdit = (user: ApiUser) => {
    setEditUser(user)
    editForm.reset({ email: user.email, password: "", role: user.role })
  }

  const editMutation = useMutation({
    mutationFn: async (values: EditFormValues) => {
      if (!editUser) return
      const payload: Record<string, string> = {}
      if (values.email && values.email !== editUser.email) payload.email = values.email
      if (values.password) payload.password = values.password
      if (values.role && values.role !== editUser.role) payload.role = values.role

      const res = await apiFetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update user")
      return data.user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User updated successfully")
      setEditUser(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Deactivate
  const deactivateMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to deactivate user")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User deactivated successfully")
      setDeactivateUser(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setDeactivateUser(null)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage users and roles in the system.</p>
        </div>
        <Button onClick={() => { createForm.reset(); setCreateOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      {isError && (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load users. Make sure the API is running and you are logged in as an Administrator.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="teachers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="teachers">Teachers ({teachers.length})</TabsTrigger>
            <TabsTrigger value="principals">Principals ({principals.length})</TabsTrigger>
            <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="teachers">
            <div className="rounded-lg border bg-card">
              <UserTable users={teachers} onEdit={openEdit} onDeactivate={setDeactivateUser} />
            </div>
          </TabsContent>

          <TabsContent value="principals">
            <div className="rounded-lg border bg-card">
              <UserTable users={principals} onEdit={openEdit} onDeactivate={setDeactivateUser} />
            </div>
          </TabsContent>

          <TabsContent value="students">
            <div className="rounded-lg border bg-card">
              <UserTable users={students} onEdit={openEdit} onDeactivate={setDeactivateUser} />
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Add a new user to the system.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4 py-2"
          >
            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input id="create-email" placeholder="user@edu.com" {...createForm.register("email")} />
              <FieldError message={createForm.formState.errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="create-password">Password</Label>
              <Input id="create-password" type="password" {...createForm.register("password")} />
              <FieldError message={createForm.formState.errors.password?.message} />
            </div>
            <div>
              <Label htmlFor="create-role">Role</Label>
              <Select
                defaultValue="STUDENT"
                onValueChange={(v) => createForm.setValue("role", v as ApiRole)}
              >
                <SelectTrigger id="create-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={createForm.formState.errors.role?.message} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update details for {editUser?.email}.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={editForm.handleSubmit((v) => editMutation.mutate(v))}
            className="space-y-4 py-2"
          >
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" placeholder="user@edu.com" {...editForm.register("email")} />
              <FieldError message={editForm.formState.errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="edit-password">New Password <span className="text-muted-foreground text-xs">(leave blank to keep)</span></Label>
              <Input id="edit-password" type="password" {...editForm.register("password")} />
              <FieldError message={editForm.formState.errors.password?.message} />
            </div>
            <div>
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editForm.watch("role")}
                onValueChange={(v) => editForm.setValue("role", v as ApiRole)}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={editForm.formState.errors.role?.message} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivateUser} onOpenChange={(open) => { if (!open) setDeactivateUser(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate <strong>{deactivateUser?.email}</strong>? They will
              no longer be able to log in. This action can be reversed by an administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateUser && deactivateMutation.mutate(deactivateUser.id)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
