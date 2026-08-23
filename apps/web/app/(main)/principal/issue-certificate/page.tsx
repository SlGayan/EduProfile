"use client"

import { useState } from "react"
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
import { ArrowLeft, Check, ChevronRight, FileText, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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
  const [characterGrade, setCharacterGrade] = useState("EXCELLENT")
  const [studentAttributes, setStudentAttributes] = useState("well-behaved, obedient, and respectful")
  const [reasonForLeaving, setReasonForLeaving] = useState("completion of studies")
  const [academicSummary, setAcademicSummary] = useState("")

  const { data: profile, isLoading } = useQuery({
    queryKey: ["certificateProfile", studentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/students/${studentId}/certificate-profile`)
      if (!res.ok) throw new Error("Failed to load student profile")
      return res.json()
    }
  })

  const mutation = useMutation({
    mutationFn: async (data: any) => {
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

  const handleSubmit = () => {
    mutation.mutate({
      studentId,
      selectedActivities,
      characterGrade,
      studentAttributes,
      reasonForLeaving,
      academicSummary: academicSummary || "Completed studies satisfactorily."
    })
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
            <div><span className="text-muted-foreground block text-xs">Attendance</span> {profile.attendancePercentage}%</div>
          </div>
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
              <Select value={characterGrade} onValueChange={setCharacterGrade}>
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
          
          {profile.activities && profile.activities.filter((act: any) => !act.status || act.status === 'APPROVED').length > 0 ? (
            <div className="space-y-3">
              {profile.activities
                .filter((act: any) => !act.status || act.status === 'APPROVED')
                .map((act: any) => (
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
            onClick={handleSubmit}
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
    </div>
  )
}
