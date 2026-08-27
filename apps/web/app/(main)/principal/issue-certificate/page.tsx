"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/apiFetch"
import StudentSearch from "@/components/student-search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Check, Loader2, Pencil } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  extractApiError,
  fieldFontSize,
  fieldFontWeight,
  fieldHeight,
  fieldTextAlign,
  fieldWidth,
  isTemplateLayoutData,
  TEMPLATE_CANVAS_WIDTH,
  TEMPLATE_CANVAS_HEIGHT,
  type BoundFieldKey,
  type CertificateTemplate,
} from "@/lib/certificateTemplates"

type CharacterGrade = "GOOD" | "VERY_GOOD" | "EXCELLENT"

const CHARACTER_GRADE_LABELS: Record<CharacterGrade, string> = {
  EXCELLENT: "Excellent",
  VERY_GOOD: "Very Good",
  GOOD: "Good",
}

interface ProfileActivity {
  id: number
  activityName: string
  activityType: string
  description: string | null
  achievements: string | null
  status?: string
}

interface CertificateProfile {
  fullName: string
  admissionNumber: string | null
  dateOfAdmission: string | null
  attendancePercentage: number | null
  activities: ProfileActivity[]
}

interface IssueCertificatePayload {
  studentId: number
  selectedActivities: number[]
  characterGrade: CharacterGrade
  studentAttributes: string
  reasonForLeaving: string
  academicSummary: string
  // Forward-compat: sent so the backend can pick it up once certificate
  // issuance is wired to render from a saved template layout. Today the API
  // silently ignores unrecognized body fields, so this is a no-op there —
  // the default layout is always what actually gets issued until that lands.
  templateId: number | null
}

function TemplatePreview({
  template,
  resolveValue,
}: {
  template: CertificateTemplate
  resolveValue: (key: BoundFieldKey) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setScale(width / TEMPLATE_CANVAS_WIDTH)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!isTemplateLayoutData(template.layoutData)) {
    return (
      <p className="text-sm text-destructive">
        This template&apos;s saved layout is in an unexpected format and can&apos;t be previewed.
      </p>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-white border rounded-md overflow-hidden mx-auto w-full"
      style={{ height: TEMPLATE_CANVAS_HEIGHT * scale }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: TEMPLATE_CANVAS_WIDTH, height: TEMPLATE_CANVAS_HEIGHT, transform: `scale(${scale})` }}
      >
        {template.layoutData.fields.map((field) => (
          <div
            key={field.id}
            className="absolute text-foreground"
            style={{
              left: field.x,
              top: field.y,
              width: fieldWidth(field),
              height: field.kind === "text" ? fieldHeight(field) : undefined,
              whiteSpace: "pre-wrap",
              fontSize: field.kind === "text" ? fieldFontSize(field) : 11,
              fontWeight: field.kind === "text" ? fieldFontWeight(field) : undefined,
              textAlign: field.kind === "text" ? fieldTextAlign(field) : undefined,
            }}
          >
            {field.kind === "bound" && field.boundField ? resolveValue(field.boundField) : field.text}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function IssueCertificatePage() {
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        {selectedStudentId && (
          <Button variant="ghost" size="icon" onClick={() => setSelectedStudentId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-3xl font-bold tracking-tight">Issue Character Certificate</h1>
      </div>

      {!selectedStudentId ? (
        <div className="space-y-4">
          <p className="text-muted-foreground">First, find and select a student to issue a character certificate for.</p>
          <StudentSearch onSelectStudent={setSelectedStudentId} />
        </div>
      ) : (
        <CertificateComposer studentId={selectedStudentId} onCancel={() => setSelectedStudentId(null)} />
      )}
    </div>
  )
}

function CertificateComposer({ studentId, onCancel }: { studentId: number, onCancel: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  
  const [selectedActivities, setSelectedActivities] = useState<number[]>([])
  const [characterGrade, setCharacterGrade] = useState<CharacterGrade>("EXCELLENT")
  const [studentAttributes, setStudentAttributes] = useState("well-behaved, obedient, and respectful")
  const [reasonForLeaving, setReasonForLeaving] = useState("completion of studies")
  const [academicSummary, setAcademicSummary] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  // "none" = fall back to the existing default certificate layout — the
  // only behavior that existed before Story 12.8, and still the default here.
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none")

  const { data: profile, isLoading } = useQuery<CertificateProfile>({
    queryKey: ["certificateProfile", studentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/students/${studentId}/certificate-profile`)
      if (!res.ok) throw new Error("Failed to load student profile")
      return res.json()
    }
  })

  const { data: templates } = useQuery<CertificateTemplate[]>({
    queryKey: ["certificateTemplates"],
    queryFn: async () => {
      const res = await apiFetch("/api/certificate-templates")
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to load certificate templates"))
      return data.templates
    },
  })

  const selectedTemplate = templates?.find((t) => String(t.id) === selectedTemplateId) ?? null

  const mutation = useMutation({
    mutationFn: async (data: IssueCertificatePayload) => {
      const res = await apiFetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error("Failed to issue certificate")
      return res.json()
    },
    onSuccess: (data) => {
      toast({
        title: "Certificate Issued Successfully",
        description: `Certificate Ref: ${data.id}`,
      })
      // Redirect to the certificates list or download directly
      router.push("/principal/certificates")
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Error Issuing Certificate",
        description: err instanceof Error ? err.message : "An unknown error occurred"
      })
    }
  })

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) return <div>Student not found.</div>

  const handleToggleActivity = (id: number) => {
    setSelectedActivities(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const handleConfirmIssue = () => {
    setConfirmOpen(false)
    mutation.mutate({
      studentId,
      selectedActivities,
      characterGrade,
      studentAttributes,
      reasonForLeaving,
      academicSummary: academicSummary || "Completed studies satisfactorily.",
      templateId: selectedTemplateId !== "none" ? Number(selectedTemplateId) : null,
    })
  }

  function resolveBoundFieldValue(key: BoundFieldKey): string {
    switch (key) {
      case "STUDENT_NAME":
        return profile!.fullName
      case "ADMISSION_NUMBER":
        return profile!.admissionNumber || "N/A"
      case "DATE_OF_ADMISSION":
        return profile!.dateOfAdmission ? new Date(profile!.dateOfAdmission).toLocaleDateString() : "N/A"
      case "ATTENDANCE_PERCENTAGE":
        return profile!.attendancePercentage !== null ? `${profile!.attendancePercentage}%` : "N/A"
      case "CHARACTER_GRADE":
        return CHARACTER_GRADE_LABELS[characterGrade]
      case "STUDENT_ATTRIBUTES":
        return studentAttributes
      case "REASON_FOR_LEAVING":
        return reasonForLeaving
      case "ACADEMIC_SUMMARY":
        return academicSummary || "Completed studies satisfactorily."
      case "CERTIFICATE_ID":
        return "(assigned upon issuance)"
      case "ISSUED_DATE":
        return new Date().toLocaleDateString()
      default:
        return ""
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {/* Configuration Column */}
      <div className="col-span-1 lg:col-span-2 space-y-8">
        
        {/* Basic Info */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Student Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground block text-xs">Full Name</span> {profile.fullName}</div>
            <div><span className="text-muted-foreground block text-xs">Admission No</span> {profile.admissionNumber || 'N/A'}</div>
            <div><span className="text-muted-foreground block text-xs">Date of Admission</span> {profile.dateOfAdmission ? new Date(profile.dateOfAdmission).toLocaleDateString() : 'N/A'}</div>
            <div><span className="text-muted-foreground block text-xs">Attendance</span> {profile.attendancePercentage !== null ? `${profile.attendancePercentage}%` : 'N/A'}</div>
          </div>
        </div>

        {/* Certificate Layout */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Certificate Layout</h3>
          <div className="space-y-2">
            <Label>Select Template</Label>
            <div className="flex items-center gap-2">
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Default Layout" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default Layout</SelectItem>
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedTemplate}
                onClick={() => selectedTemplate && router.push(`/admin/certificate-templates?edit=${selectedTemplate.id}`)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Template
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedTemplate
                ? `Preview below reflects "${selectedTemplate.name}".`
                : "Using the default certificate layout."}
            </p>
            {selectedTemplate && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Note: issuing a certificate always uses the default layout for now — custom-template rendering isn&apos;t wired up yet. The preview below is for design reference only.
              </p>
            )}
          </div>

          {selectedTemplate && (
            <TemplatePreview template={selectedTemplate} resolveValue={resolveBoundFieldValue} />
          )}
        </div>

        {/* Academic & Remarks */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Certificate Details</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Academic Summary</Label>
              <Textarea 
                value={academicSummary} 
                onChange={e => setAcademicSummary(e.target.value)} 
                placeholder="Briefly describe academic performance (e.g., Passed G.C.E. O/L in 2024 with 5 A's...)"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Character Grade</Label>
              <Select value={characterGrade} onValueChange={(val) => setCharacterGrade(val as CharacterGrade)}>
                <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXCELLENT">Excellent</SelectItem>
                  <SelectItem value="VERY_GOOD">Very Good</SelectItem>
                  <SelectItem value="GOOD">Good</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Student Attributes</Label>
              <Input 
                value={studentAttributes} 
                onChange={e => setStudentAttributes(e.target.value)} 
                placeholder="e.g., well-behaved, obedient, and respectful"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Reason for Leaving</Label>
              <Input 
                value={reasonForLeaving} 
                onChange={e => setReasonForLeaving(e.target.value)} 
                placeholder="e.g., completion of studies"
              />
            </div>
          </div>
        </div>

        {/* Extracurricular Activities */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Select Extracurricular Activities</h3>
          <p className="text-sm text-muted-foreground mb-4">Select the most prominent activities to include in the certificate.</p>
          
          {profile.activities && profile.activities.filter((act) => !act.status || act.status === 'APPROVED').length > 0 ? (
            <div className="space-y-3">
              {profile.activities
                .filter((act) => !act.status || act.status === 'APPROVED')
                .map((act) => (
                <div key={act.id} className="flex items-start space-x-3 p-3 rounded border hover:bg-muted/50 cursor-pointer" onClick={() => handleToggleActivity(act.id)}>
                  <Checkbox id={`act-${act.id}`} checked={selectedActivities.includes(act.id)} onCheckedChange={() => handleToggleActivity(act.id)} />
                  <div className="grid gap-1.5 leading-none">
                    <label htmlFor={`act-${act.id}`} className="text-sm font-medium leading-none cursor-pointer">
                      {act.activityName} <span className="text-xs text-muted-foreground font-normal">({act.activityType})</span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {act.description || act.achievements || 'No description provided.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">No approved extracurricular activities recorded.</p>
          )}
        </div>
      </div>

      {/* Action Column */}
      <div className="col-span-1 lg:col-span-1">
        <div className="sticky top-6 rounded-lg border bg-card p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold border-b pb-2 mb-4">Actions</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Review all details carefully. Once issued, a character certificate cannot be altered, as it represents a snapshot of the student's record at this point in time.
            </p>
          </div>
          
          <Button
            className="w-full"
            size="lg"
            onClick={() => setConfirmOpen(true)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
            Issue Certificate
          </Button>

          <Button variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue this character certificate?</DialogTitle>
            <DialogDescription>
              This action is permanent — once issued, the certificate is assigned an official
              reference number and cannot be altered. Please confirm the details are correct
              before proceeding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmIssue} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm & Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
