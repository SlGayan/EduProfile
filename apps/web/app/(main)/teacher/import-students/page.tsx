import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Upload } from "lucide-react"

export default function ImportStudentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Student Data</h1>
        <p className="text-muted-foreground">Bulk import student information using a CSV file.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Student Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                1
              </span>
              <div className="space-y-2">
                <p className="font-medium">Download the template</p>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV Template
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                2
              </span>
              <p className="font-medium">Fill in the student data</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                3
              </span>
              <div className="flex-1 space-y-2">
                <p className="font-medium">Upload the file below</p>
                <div className="space-y-2">
                  <Label htmlFor="file-upload">CSV File</Label>
                  <div className="flex items-center gap-2">
                    <Input id="file-upload" type="file" accept=".csv" className="cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full">
            <Upload className="mr-2 h-4 w-4" />
            Start Import
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
