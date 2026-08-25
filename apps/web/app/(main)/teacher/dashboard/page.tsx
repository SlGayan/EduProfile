import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Users,
  ClipboardEdit,
  TrendingUp,
  AlertTriangle,
  UserPlus,
  Upload,
  PenLine,
  FileSpreadsheet,
  ClipboardList,
  Search,
} from "lucide-react"

// No role guard here by design: middleware.ts already redirects any
// non-teacher away from /teacher/*, matching every sibling teacher page.

// Static placeholder data for the UI shell — replaced by live data in a later story.
const classContext = {
  className: "Grade 10-A",
  roleLabel: "Class Teacher",
  studentCount: 14,
}

const stats = [
  {
    label: "Total Students",
    value: "14",
    caption: "Grade 10-A enrolled",
    icon: Users,
    accent: "border-l-blue-500 text-blue-500",
  },
  {
    label: "Marks Pending",
    value: "5",
    caption: "Need marks for Term 2",
    icon: ClipboardEdit,
    accent: "border-l-amber-500 text-amber-500",
  },
  {
    label: "Class Average",
    value: "72%",
    caption: "↑ 4% from Term 1",
    icon: TrendingUp,
    accent: "border-l-emerald-500 text-emerald-500",
  },
  {
    label: "Needs Support",
    value: "2",
    caption: "Students below 50%",
    icon: AlertTriangle,
    accent: "border-l-red-500 text-red-500",
  },
]

const quickActions = [
  { label: "Add Student", icon: UserPlus },
  { label: "Import Students", icon: Upload },
  { label: "Add Marks", icon: PenLine },
  { label: "Import Marks", icon: FileSpreadsheet },
  { label: "Add Student Activity", icon: ClipboardList },
  { label: "Search Student", icon: Search },
]

export default function TeacherDashboardPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's an overview of your class.</p>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {classContext.className} | {classContext.roleLabel} | {classContext.studentCount} Students
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className={`border-l-4 py-4 ${stat.accent}`}>
            <CardContent className="flex items-start justify-between gap-2 px-4">
              <div className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</p>
                <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.caption}</p>
              </div>
              <stat.icon className={`h-5 w-5 shrink-0 ${stat.accent.split(" ")[1]}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 px-4 sm:px-6">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Button key={action.label} variant="outline" className="w-full justify-start bg-transparent">
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
