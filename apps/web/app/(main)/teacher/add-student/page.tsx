"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, UserPlus } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"

interface ClassOption {
  id: number
  name: string
}

interface CreateResult {
  message: string
  id: number
  indexNumber: string
}

interface FormFields {
  email: string
  fullName: string
  indexNumber: string
  dateOfBirth: string
  address: string
  nicNumber: string
  olYear: string
  alYear: string
}

const emptyFields: FormFields = {
  email: "",
  fullName: "",
  indexNumber: "",
  dateOfBirth: "",
  address: "",
  nicNumber: "",
  olYear: "",
  alYear: "",
}

/** Mirrors the API's Zod rules (validators/studentValidators.ts createStudentSchema). */
function validate(fields: FormFields): string | null {
  if (!fields.email.trim()) return "Email is required"
  if (!fields.email.trim().toLowerCase().endsWith("@edu.com")) return "Email must end with @edu.com"
  if (!fields.fullName.trim()) return "Full name is required"
  if (!fields.indexNumber.trim()) return "Index number is required"
  if (!fields.dateOfBirth.trim() || Number.isNaN(Date.parse(fields.dateOfBirth))) {
    return "A valid date of birth is required"
  }
  if (!fields.address.trim()) return "Address is required"
  return null
}

interface ApiErrorInfo {
  title: string
  classes?: ClassOption[]
}

async function extractError(res: Response): Promise<ApiErrorInfo> {
  let data: { error?: string; details?: { message: string }[]; classes?: ClassOption[] } = {}
  try {
    data = await res.json()
  } catch {
    // no JSON body
  }
  if (Array.isArray(data.details) && data.details.length > 0) {
    return { title: data.details.map((d) => d.message).join("; ") }
  }
  return { title: data.error ?? "Failed to add student", classes: data.classes }
}

export default function AddStudentPage() {
  const [fields, setFields] = useState<FormFields>(emptyFields)
  const [classId, setClassId] = useState<string>("")
  const [classOptions, setClassOptions] = useState<ClassOption[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<CreateResult | null>(null)

  const setField = (key: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const mutation = useMutation({
    mutationFn: async (): Promise<CreateResult> => {
      const res = await apiFetch("/api/students", {
        method: "POST",
        body: JSON.stringify({
          email: fields.email.trim(),
          fullName: fields.fullName.trim(),
          indexNumber: fields.indexNumber.trim(),
          dateOfBirth: fields.dateOfBirth,
          address: fields.address.trim(),
          ...(fields.nicNumber.trim() && { nicNumber: fields.nicNumber.trim() }),
          ...(fields.olYear.trim() && { olYear: Number(fields.olYear) }),
          ...(fields.alYear.trim() && { alYear: Number(fields.alYear) }),
          ...(classId && { classId: Number(classId) }),
        }),
      })
      if (!res.ok) {
        const info = await extractError(res)
        if (info.classes) {
          setClassOptions(info.classes)
        }
        throw new Error(info.title)
      }
      return res.json()
    },
    onSuccess: (result) => {
      setLastResult(result)
      toast.success(result.message)
      setFields(emptyFields)
      setClassId("")
      setClassOptions(null)
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toast.error(err.message)
    },
  })

  const handleSubmit = () => {
    setFormError(null)
    setLastResult(null)
    const error = validate(fields)
    if (error) {
      setFormError(error)
      return
    }
    mutation.mutate()
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Add Student</h1>
        <p className="text-muted-foreground">Enroll a single student in your class.</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Student Details</CardTitle>
          <CardDescription>
            For a whole class roster, use{" "}
            <Link href="/teacher/import-students" className="underline underline-offset-2">
              Import Students
            </Link>{" "}
            instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fields.fullName} onChange={setField("fullName")} placeholder="e.g. Jane Perera" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="indexNumber">Index Number</Label>
              <Input id="indexNumber" value={fields.indexNumber} onChange={setField("indexNumber")} placeholder="e.g. 2026-1045" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={fields.email} onChange={setField("email")} placeholder="student@edu.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input id="dateOfBirth" type="date" value={fields.dateOfBirth} onChange={setField("dateOfBirth")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nicNumber">NIC Number (optional)</Label>
              <Input id="nicNumber" value={fields.nicNumber} onChange={setField("nicNumber")} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={fields.address} onChange={setField("address")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="olYear">O/L Year (optional)</Label>
              <Input id="olYear" type="number" value={fields.olYear} onChange={setField("olYear")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alYear">A/L Year (optional)</Label>
              <Input id="alYear" type="number" value={fields.alYear} onChange={setField("alYear")} />
            </div>

            {classOptions && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="classId">Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger id="classId" className="w-full">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}

          {lastResult && !formError && (
            <Alert>
              <AlertTitle>
                {lastResult.message}: {lastResult.indexNumber}
              </AlertTitle>
              <AlertDescription>Add another student below, or move on.</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button className="w-full" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Add Student
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
