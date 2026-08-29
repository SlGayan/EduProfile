"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Users,
  GraduationCap,
  Briefcase,
  School,
  UserPlus,
  BookOpen,
  Search,
  Zap,
  AlertTriangle,
  ClipboardList,
  UserX,
  BookX,
  Loader2,
  BarChart3,
  PieChartIcon,
} from "lucide-react"
import { fetchAdminDashboard, createSubject } from "@/lib/admin"

const genderChartConfig = {
  male: { label: "Male", color: "var(--chart-1)" },
  female: { label: "Female", color: "var(--chart-2)" },
  other: { label: "Other", color: "var(--chart-3)" },
  unspecified: { label: "Unspecified", color: "var(--muted-foreground)" },
} satisfies ChartConfig

const gradeChartConfig = {
  studentCount: { label: "Students", color: "var(--chart-1)" },
} satisfies ChartConfig

interface QuickAction {
  label: string
  description: string
  icon: typeof UserPlus
  iconClassName: string
  href?: string
  onClick?: () => void
}

// No role guard here by design: middleware.ts already redirects any
// non-admin away from /admin/*, matching every sibling admin page.
export default function AdminDashboardPage() {
  const queryClient = useQueryClient()
  const [addSubjectOpen, setAddSubjectOpen] = useState(false)
  const [subjectName, setSubjectName] = useState("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchAdminDashboard,
    retry: false,
  })

  const createSubjectMutation = useMutation({
    mutationFn: (name: string) => createSubject(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] })
      toast.success("Subject created successfully")
      setAddSubjectOpen(false)
      setSubjectName("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const quickActions: QuickAction[] = [
    {
      label: "Create User",
      description: "Add a new account",
      href: "/admin/users?create=1",
      icon: UserPlus,
      iconClassName: "bg-blue-50 text-blue-600",
    },
    {
      label: "Add Class",
      description: "Create a new grade & section",
      href: "/admin/classes?create=1",
      icon: School,
      iconClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Add Subject",
      description: "Register a new subject",
      icon: BookOpen,
      iconClassName: "bg-indigo-50 text-indigo-600",
      onClick: () => {
        setSubjectName("")
        setAddSubjectOpen(true)
      },
    },
    {
      label: "Search Student",
      description: "Find a student's record",
      href: "/admin/search-students",
      icon: Search,
      iconClassName: "bg-teal-50 text-teal-600",
    },
  ]

  const genderRows = data
    ? [
        { key: "male", name: "Male", value: data.genderDistribution.male },
        { key: "female", name: "Female", value: data.genderDistribution.female },
        { key: "other", name: "Other", value: data.genderDistribution.other },
        { key: "unspecified", name: "Unspecified", value: data.genderDistribution.unspecified },
      ].filter((row) => row.value > 0)
    : []
  const genderTotal = genderRows.reduce((sum, row) => sum + row.value, 0)

  const gradeRows = (data?.gradeDistribution ?? []).map((row) => ({
    grade: `G${row.gradeLevel}`,
    studentCount: row.studentCount,
  }))

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="text-muted-foreground">System Overview &amp; Administrative Controls</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load the admin dashboard."}
          </AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" data-testid="stat-card-skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="w-full min-w-0 border-l-4 border-l-blue-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-blue-500">Total Users</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.totalUsers}</p>
              </div>
              <Users className="h-5 w-5 text-blue-500" />
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 border-l-4 border-l-purple-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-purple-600">Total Students</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.totalStudents}</p>
              </div>
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 border-l-4 border-l-amber-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Teachers</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.totalTeachers}</p>
              </div>
              <Briefcase className="h-5 w-5 text-amber-600" />
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 border-l-4 border-l-green-500 py-4">
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-green-600">Classes</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.totalClasses}</p>
              </div>
              <School className="h-5 w-5 text-green-600" />
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Zap className="h-4 w-4 text-amber-500" />
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) =>
            action.href ? (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${action.iconClassName}`}>
                  <action.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{action.label}</span>
                  <span className="block text-xs text-muted-foreground">{action.description}</span>
                </span>
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${action.iconClassName}`}>
                  <action.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{action.label}</span>
                  <span className="block text-xs text-muted-foreground">{action.description}</span>
                </span>
              </button>
            ),
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Attention Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading || !data ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border bg-rose-50/50 p-3 dark:bg-rose-950/20">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div>
                  <p className="text-sm font-medium">
                    {data.attentionRequired.pendingActivities} Pending{" "}
                    {data.attentionRequired.pendingActivities === 1 ? "Activity" : "Activities"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Student extracurricular activities awaiting administrative review.
                  </p>
                </div>
              </div>

              <Link
                href="/admin/classes"
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <UserX className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">
                    {data.attentionRequired.unassignedClasses}{" "}
                    {data.attentionRequired.unassignedClasses === 1 ? "Class" : "Classes"} Unassigned
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.attentionRequired.unassignedClassExample
                      ? `${data.attentionRequired.unassignedClassExample} has no primary teacher assigned.`
                      : "Every class has a primary teacher assigned."}
                  </p>
                </div>
              </Link>

              <Link
                href="/admin/classes"
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <BookX className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium">
                    {data.attentionRequired.unassignedSubjects}{" "}
                    {data.attentionRequired.unassignedSubjects === 1 ? "Subject" : "Subjects"} Unassigned
                  </p>
                  <p className="text-xs text-muted-foreground">
                    No teacher currently teaches this subject in any class.
                  </p>
                </div>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              Student Distribution by Gender
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-64 w-full" />
            ) : genderTotal === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PieChartIcon className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No students on record yet.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative w-full max-w-[220px]">
                  <ChartContainer config={genderChartConfig} className="mx-auto aspect-square max-h-[220px]">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                      <Pie data={genderRows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} strokeWidth={2}>
                        {genderRows.map((row) => (
                          <Cell key={row.key} fill={`var(--color-${row.key})`} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{genderTotal}</span>
                    <span className="text-xs text-muted-foreground">Total</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {genderRows.map((row) => (
                    <div key={row.key} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(--color-${row.key})` }}
                      />
                      <span>{row.name}</span>
                      <span className="font-medium">{row.value}</span>
                      <span className="text-muted-foreground">
                        ({Math.round((row.value / genderTotal) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Student Distribution by Grade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-64 w-full" />
            ) : gradeRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No classes for the current academic year yet.</p>
              </div>
            ) : (
              <ChartContainer config={gradeChartConfig} className="min-h-64 w-full">
                <BarChart data={gradeRows}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="grade" tickLine={false} axisLine={false} interval={0} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="studentCount" fill="var(--color-studentCount)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
        <DialogContent className="max-w-full sm:max-w-md mx-2 my-4 p-4 sm:mx-auto sm:my-auto sm:p-6">
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
            <DialogDescription>Register a new subject that teachers can be assigned to.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (subjectName.trim()) createSubjectMutation.mutate(subjectName.trim())
            }}
            className="space-y-4 py-2"
          >
            <div>
              <Label htmlFor="subject-name">Subject Name</Label>
              <Input
                id="subject-name"
                placeholder="e.g. Mathematics"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddSubjectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!subjectName.trim() || createSubjectMutation.isPending}>
                {createSubjectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
