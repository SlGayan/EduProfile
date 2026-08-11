"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Search, RotateCcw, ArrowUpDown, AlertCircle, Trophy } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { getCurrentUser } from "@/lib/auth"
import { sortStudents, formatDate, type SortField, type SortOrder } from "@/lib/studentSearch"
import { StudentActivitiesDialog, type ActivityStudent } from "@/components/student-activities-dialog"
import { canManageActivities } from "@/lib/activities"

interface SearchFilters {
  fullName: string
  studentId: string
  nicNumber: string
  olYear: string
  alYear: string
}

interface Student {
  id: number
  indexNumber: string
  fullName: string
  dateOfBirth: string
  olYear: number | null
  alYear: number | null
}

interface StudentSearchResponse {
  students: Student[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

async function fetchStudentSearch(queryParams: string): Promise<StudentSearchResponse> {
  const response = await apiFetch(`/api/students/search?${queryParams}`)
  if (!response.ok) {
    let message = "Failed to fetch students"
    try {
      const data = await response.json()
      if (typeof data?.error === "string") {
        message = data.error
      }
    } catch {
      // no JSON body
    }
    throw new Error(message)
  }
  const data = await response.json()
  if (!Array.isArray(data?.students)) {
    throw new Error("Unexpected response from server")
  }
  return data
}

export function StudentSearch() {
  const router = useRouter()

  // Role guard — only ADMINISTRATOR, PRINCIPAL, or TEACHER (stored lowercase in auth)
  const user = getCurrentUser()
  const isAuthorized = !user || user.role === "admin" || user.role === "principal" || user.role === "teacher"

  // Hides the activities control from principals — see canManageActivities.
  const showActivities = canManageActivities(user?.role)

  const [activitiesStudent, setActivitiesStudent] = useState<ActivityStudent | null>(null)

  useEffect(() => {
    if (!isAuthorized) {
      router.replace("/unauthorized")
    }
  }, [isAuthorized, router])

  const emptyFilters: SearchFilters = {
    fullName: "",
    studentId: "",
    nicNumber: "",
    olYear: "",
    alYear: "",
  }

  const [filters, setFilters] = useState<SearchFilters>(emptyFilters)
  // Filters actually submitted via Search — the query only reacts to this,
  // so editing the form mid-result-set doesn't silently re-fetch on every keystroke.
  const [submittedFilters, setSubmittedFilters] = useState<SearchFilters>(emptyFilters)
  const [hasSearched, setHasSearched] = useState(false)
  const [sortField, setSortField] = useState<SortField>("fullName")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")

  // Build query params from the submitted (not live) filters
  const buildQueryParams = (f: SearchFilters) => {
    const params = new URLSearchParams()
    if (f.fullName) params.append("fullName", f.fullName)
    if (f.studentId) params.append("studentId", f.studentId)
    if (f.nicNumber) params.append("nicNumber", f.nicNumber)
    if (f.olYear) params.append("olYear", f.olYear)
    if (f.alYear) params.append("alYear", f.alYear)
    return params.toString()
  }

  // Fetch students using TanStack Query
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["students", submittedFilters],
    queryFn: () => fetchStudentSearch(buildQueryParams(submittedFilters)),
    enabled: isAuthorized && hasSearched,
  })
  const students = data?.students

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  // `has-[>svg]:px-0` as well as `px-0`: Button's base size class carries
  // `has-[>svg]:px-3`, and every sort header holds an ArrowUpDown icon. Because
  // the two differ by modifier, tailwind-merge keeps both and the `:has()` rule
  // wins on specificity — leaving 12px of padding that pushes each header out
  // of line with the cell values beneath it.
  const sortHeaderClassName = (field: SortField) =>
    `flex items-center gap-1 px-0 has-[>svg]:px-0 hover:bg-transparent ${sortField === field ? "text-foreground font-semibold" : "text-muted-foreground"}`

  const sortIconClassName = (field: SortField) =>
    `h-4 w-4 transition-transform ${sortField === field && sortOrder === "desc" ? "rotate-180" : ""}`

  const sortedStudents = students ? sortStudents(students, sortField, sortOrder) : undefined

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittedFilters(filters)
    setHasSearched(true)
  }

  const handleReset = () => {
    setFilters(emptyFilters)
    setSubmittedFilters(emptyFilters)
    setHasSearched(false)
  }

  const handleInputChange = (field: keyof SearchFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student & Alumni Search</h1>
        <p className="text-muted-foreground">Search for students and alumni using multiple criteria.</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="rounded-lg border bg-card p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              placeholder="Enter student's name..."
              value={filters.fullName}
              onChange={(e) => handleInputChange("fullName", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="studentId">Student ID</Label>
            <Input
              id="studentId"
              placeholder="Enter student ID..."
              value={filters.studentId}
              onChange={(e) => handleInputChange("studentId", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nicNumber">NIC Number</Label>
            <Input
              id="nicNumber"
              placeholder="Enter NIC..."
              value={filters.nicNumber}
              onChange={(e) => handleInputChange("nicNumber", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="olYear">O/L Year</Label>
            <Input
              id="olYear"
              type="number"
              placeholder="e.g., 2020"
              value={filters.olYear}
              onChange={(e) => handleInputChange("olYear", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alYear">A/L Year</Label>
            <Input
              id="alYear"
              type="number"
              placeholder="e.g., 2023"
              value={filters.alYear}
              onChange={(e) => handleInputChange("alYear", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button type="submit">
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </form>

      {/* Results Section */}
      {hasSearched && (
        <div className="rounded-lg border bg-card">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error instanceof Error ? error.message : "Failed to search students. Please try again later."}
                </AlertDescription>
              </Alert>
            </div>
          ) : sortedStudents && sortedStudents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort("indexNumber")} className={sortHeaderClassName("indexNumber")}>
                      Student ID
                      <ArrowUpDown className={sortIconClassName("indexNumber")} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort("fullName")} className={sortHeaderClassName("fullName")}>
                      Full Name
                      <ArrowUpDown className={sortIconClassName("fullName")} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort("dateOfBirth")} className={sortHeaderClassName("dateOfBirth")}>
                      Date of Birth
                      <ArrowUpDown className={sortIconClassName("dateOfBirth")} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort("olYear")} className={sortHeaderClassName("olYear")}>
                      O/L Year
                      <ArrowUpDown className={sortIconClassName("olYear")} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort("alYear")} className={sortHeaderClassName("alYear")}>
                      A/L Year
                      <ArrowUpDown className={sortIconClassName("alYear")} />
                    </Button>
                  </TableHead>
                  {showActivities && <TableHead className="text-right">Activities</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.indexNumber}</TableCell>
                    <TableCell>{student.fullName}</TableCell>
                    <TableCell>{formatDate(student.dateOfBirth)}</TableCell>
                    <TableCell>{student.olYear ?? "N/A"}</TableCell>
                    <TableCell>{student.alYear ?? "N/A"}</TableCell>
                    {showActivities && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setActivitiesStudent({
                              id: student.id,
                              fullName: student.fullName,
                              indexNumber: student.indexNumber,
                            })
                          }
                        >
                          <Trophy className="mr-2 h-4 w-4" />
                          Activities
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <p className="text-muted-foreground">No students found matching your criteria.</p>
            </div>
          )}
        </div>
      )}

      {showActivities && (
        <StudentActivitiesDialog
          student={activitiesStudent}
          onOpenChange={(open) => {
            if (!open) setActivitiesStudent(null)
          }}
        />
      )}
    </div>
  )
}
