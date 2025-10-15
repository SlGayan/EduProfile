import type { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileText, TrendingUp, Award } from "lucide-react"

export const metadata: Metadata = {
  title: "Principal Dashboard | EduProfile",
  description: "Principal dashboard overview",
}

export default function PrincipalDashboardPage() {
  const stats = [
    {
      title: "Total Students",
      value: "1,234",
      description: "Across all grades",
      icon: Users,
    },
    {
      title: "Total Teachers",
      value: "87",
      description: "Active staff members",
      icon: Users,
    },
    {
      title: "Academic Reports",
      value: "45",
      description: "Pending review",
      icon: FileText,
    },
    {
      title: "Average Performance",
      value: "85%",
      description: "School-wide average",
      icon: TrendingUp,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-balance text-3xl font-bold tracking-tight">Principal Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's an overview of your school.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>Latest updates from your school</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Award className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">New academic year started</p>
                  <p className="text-xs text-muted-foreground">2 days ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Term 1 reports submitted</p>
                  <p className="text-xs text-muted-foreground">1 week ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">New teachers onboarded</p>
                  <p className="text-xs text-muted-foreground">2 weeks ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Use the sidebar to navigate to different sections.</p>
              <ul className="space-y-1 text-sm">
                <li>• Search and view student records</li>
                <li>• Review academic reports</li>
                <li>• Monitor school performance</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
