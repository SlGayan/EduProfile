"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { MoreHorizontal, Plus, Shield } from "lucide-react"
import { UserRole, Permission } from "@/lib/types"

// Local type for user management records (separate from auth session User)
interface AdminUser {
  id: number
  name: string
  email: string
  role: UserRole
  status: "Active" | "Inactive"
  permissions?: Permission[]
}
import { useState } from "react"

// Mock data with permissions
const users: AdminUser[] = [
  {
    id: 1,
    name: "John Doe",
    email: "john.doe@school.edu",
    role: UserRole.TEACHER,
    status: "Active",
    permissions: [Permission.VIEW_STUDENTS, Permission.EDIT_STUDENTS, Permission.VIEW_MARKS, Permission.EDIT_MARKS],
  },
  {
    id: 2,
    name: "Jane Smith",
    email: "jane.smith@school.edu",
    role: UserRole.ADMINISTRATOR,
    status: "Active",
    permissions: Object.values(Permission),
  },
  {
    id: 3,
    name: "Bob Johnson",
    email: "bob.johnson@school.edu",
    role: UserRole.TEACHER,
    status: "Active",
    permissions: [Permission.VIEW_STUDENTS, Permission.VIEW_MARKS],
  },
  {
    id: 4,
    name: "Alice Williams",
    email: "alice.williams@school.edu",
    role: UserRole.STUDENT,
    status: "Inactive",
    permissions: [],
  },
  {
    id: 5,
    name: "Charlie Brown",
    email: "charlie.brown@school.edu",
    role: UserRole.PRINCIPAL,
    status: "Active",
    permissions: [
      Permission.VIEW_STUDENTS,
      Permission.EDIT_STUDENTS,
      Permission.VIEW_CLASSES,
      Permission.EDIT_CLASSES,
      Permission.VIEW_MARKS,
      Permission.VIEW_REPORTS,
    ],
  },
  {
    id: 6,
    name: "David Lee",
    email: "david.lee@school.edu",
    role: UserRole.STUDENT,
    status: "Active",
    permissions: [],
  },
  {
    id: 7,
    name: "Emma Davis",
    email: "emma.davis@school.edu",
    role: UserRole.TEACHER,
    status: "Active",
    permissions: [Permission.VIEW_STUDENTS, Permission.EDIT_STUDENTS, Permission.VIEW_MARKS],
  },
]

export default function UserManagementPage() {
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([])

  const teachers = users.filter((u) => u.role === UserRole.TEACHER)
  const principals = users.filter((u) => u.role === UserRole.PRINCIPAL)
  const students = users.filter((u) => u.role === UserRole.STUDENT)

  const handleManagePermissions = (user: AdminUser) => {
    setSelectedUser(user)
    setSelectedPermissions(user.permissions || [])
    setPermissionsDialogOpen(true)
  }

  const togglePermission = (permission: Permission) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission],
    )
  }

  const UserTable = ({ users }: { users: AdminUser[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Permissions</TableHead>
          <TableHead className="w-[70px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <Badge variant={user.status === "Active" ? "default" : "secondary"}>{user.status}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">
                {user.permissions?.length || 0} permissions
              </Badge>
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
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleManagePermissions(user)}>
                    <Shield className="mr-2 h-4 w-4" />
                    Manage Permissions
                  </DropdownMenuItem>
                  <DropdownMenuItem>{user.status === "Active" ? "Deactivate" : "Activate"}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Manage users, roles, and permissions in the system.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      <Tabs defaultValue="teachers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teachers">Teachers ({teachers.length})</TabsTrigger>
          <TabsTrigger value="principals">Principals ({principals.length})</TabsTrigger>
          <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="teachers" className="space-y-4">
          <div className="rounded-lg border bg-card">
            <UserTable users={teachers} />
          </div>
        </TabsContent>

        <TabsContent value="principals" className="space-y-4">
          <div className="rounded-lg border bg-card">
            <UserTable users={principals} />
          </div>
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <div className="rounded-lg border bg-card">
            <UserTable users={students} />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Permissions</DialogTitle>
            <DialogDescription>Configure permissions for {selectedUser?.name}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="space-y-4">
              <div>
                <h4 className="mb-3 text-sm font-medium">Student Management</h4>
                <div className="space-y-2">
                  {[Permission.VIEW_STUDENTS, Permission.EDIT_STUDENTS, Permission.DELETE_STUDENTS].map(
                    (permission) => (
                      <div key={permission} className="flex items-center space-x-2">
                        <Checkbox
                          id={permission}
                          checked={selectedPermissions.includes(permission)}
                          onCheckedChange={() => togglePermission(permission)}
                        />
                        <Label htmlFor={permission} className="text-sm font-normal cursor-pointer">
                          {permission
                            .replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/\b\w/g, (l) => l.toUpperCase())}
                        </Label>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-medium">Class Management</h4>
                <div className="space-y-2">
                  {[Permission.VIEW_CLASSES, Permission.EDIT_CLASSES, Permission.DELETE_CLASSES].map((permission) => (
                    <div key={permission} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission}
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      <Label htmlFor={permission} className="text-sm font-normal cursor-pointer">
                        {permission
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-medium">Marks & Reports</h4>
                <div className="space-y-2">
                  {[Permission.VIEW_MARKS, Permission.EDIT_MARKS, Permission.VIEW_REPORTS].map((permission) => (
                    <div key={permission} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission}
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      <Label htmlFor={permission} className="text-sm font-normal cursor-pointer">
                        {permission
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-medium">System Administration</h4>
                <div className="space-y-2">
                  {[Permission.MANAGE_USERS, Permission.SYSTEM_SETTINGS].map((permission) => (
                    <div key={permission} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission}
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      <Label htmlFor={permission} className="text-sm font-normal cursor-pointer">
                        {permission
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // console.log("Saving permissions:", selectedPermissions)
                setPermissionsDialogOpen(false)
              }}
            >
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
