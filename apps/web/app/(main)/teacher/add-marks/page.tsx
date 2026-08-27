"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, PenLine } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"

interface MarkResult {
  studentName: string
  studentIndexNumber: string
  subject: string
  term: number
  year: number
  marks: number
}

const currentYear = new Date().getFullYear()

/** Mirrors the API's Zod rules (validators/markValidators.ts) so obviously bad
 * input is caught before a round-trip. */
function validate(fields: {
  studentIndexNumber: string
  subjectName: string
  term: string
  year: string
  marks: string
}): string | null {
  if (!fields.studentIndexNumber.trim()) return "Student index number is required"
  if (!fields.subjectName.trim()) return "Subject name is required"
  const term = Number(fields.term)
  if (!Number.isInteger(term) || term < 1 || term > 3) return "Term must be 1, 2, or 3"
  const year = Number(fields.year)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return "Year must be between 2000 and 2100"
  const marks = Number(fields.marks)
  if (!Number.isInteger(marks) || marks < 0 || marks > 100) return "Marks must be a whole number between 0 and 100"
  return null
}

async function extractError(res: Response): Promise<string> {
  let data: { error?: string; details?: { message: string }[] } = {}
  try {
    data = await res.json()
  } catch {
    // no JSON body
  }
  if (Array.isArray(data.details) && data.details.length > 0) {
    return data.details.map((d) => d.message).join("; ")
  }
  return data.error ?? "Failed to add marks"
}

export default function AddMarksPage() {
  const [studentIndexNumber, setStudentIndexNumber] = useState("")
  const [subjectName, setSubjectName] = useState("")
  const [term, setTerm] = useState("1")
  const [year, setYear] = useState(String(currentYear))
  const [marks, setMarks] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<MarkResult | null>(null)
  const indexInputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: async (): Promise<MarkResult> => {
      const res = await apiFetch("/api/marks", {
        method: "POST",
        body: JSON.stringify({
          studentIndexNumber: studentIndexNumber.trim(),
          subjectName: subjectName.trim(),
          term: Number(term),
          year: Number(year),
          marks: Number(marks),
        }),
      })
      if (!res.ok) {
        throw new Error(await extractError(res))
      }
      return res.json()
    },
    onSuccess: (result) => {
      setLastResult(result)
      toast.success(`Saved ${result.marks} for ${result.studentName} — ${result.subject}`)
      // Keep subject/term/year: teachers typically enter one subject's marks
      // for several students in a row. Only the per-student fields reset.
      setStudentIndexNumber("")
      setMarks("")
      indexInputRef.current?.focus()
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toast.error(err.message)
    },
  })

  const handleSubmit = () => {
    setFormError(null)
    setLastResult(null)
    const error = validate({ studentIndexNumber, subjectName, term, year, marks })
    if (error) {
      setFormError(error)
      return
    }
    mutation.mutate()
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Add Marks</h1>
        <p className="text-muted-foreground">Record a single student's term test mark.</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Mark Details</CardTitle>
          <CardDescription>
            For a full class sheet, use{" "}
            <Link href="/teacher/import-marks" className="underline underline-offset-2">
              Import Marks
            </Link>{" "}
            instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="studentIndexNumber">Student Index Number</Label>
              <Input
                id="studentIndexNumber"
                ref={indexInputRef}
                value={studentIndexNumber}
                onChange={(e) => setStudentIndexNumber(e.target.value)}
                placeholder="e.g. 2024-1023"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subjectName">Subject</Label>
              <Input
                id="subjectName"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. Mathematics"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="term">Term</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger id="term" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Term 1</SelectItem>
                  <SelectItem value="2">Term 2</SelectItem>
                  <SelectItem value="3">Term 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={2000}
                max={2100}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="marks">Marks (0–100)</Label>
              <Input
                id="marks"
                type="number"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                min={0}
                max={100}
                placeholder="e.g. 78"
              />
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}

          {lastResult && !formError && (
            <Alert>
              <AlertTitle>
                Saved: {lastResult.studentName} ({lastResult.studentIndexNumber}) — {lastResult.subject}, Term{" "}
                {lastResult.term} {lastResult.year}: {lastResult.marks}
              </AlertTitle>
              <AlertDescription>Add another mark below, or move on.</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button className="w-full" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PenLine className="mr-2 h-4 w-4" />
            )}
            Add Marks
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
