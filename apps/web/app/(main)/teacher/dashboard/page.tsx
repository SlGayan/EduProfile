import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileSpreadsheet } from "lucide-react"

export default function TeacherDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teacher Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's an overview of your class.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Student Data
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Import Mark Data
            </Button>
          </CardContent>
        </Card>

        {/* Your Class Card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Class</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">Grade 11-A</p>
              <p className="text-sm text-muted-foreground">32 students enrolled</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Card */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>Updated marks for Math Quiz 3</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>Added 2 new students to class</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>Generated progress reports</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
