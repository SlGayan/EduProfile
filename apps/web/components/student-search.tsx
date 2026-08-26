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
import { Search, RotateCcw, ArrowUpDown, AlertCircle } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"
import { getCurrentUser } from "@/lib/auth"
import { sortStudents, formatDate, type SortField, type SortOrder } from "@/lib/studentSearch"

interface StudentSearchProps {
  onSelectStudent?: (studentId: number) => void;
}

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

class StudentSearchError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
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
    throw new StudentSearchError(message, response.status)
  }
  const data = await response.json()
  if (!Array.isArray(data?.students)) {
    throw new Error("Unexpected response from server")
  }
  return data
}

export default function StudentSearch({ onSelectStudent }: StudentSearchProps = {}) {
  const router = useRouter()

  // Role guard — only ADMINISTRATOR, PRINCIPAL, or TEACHER (stored lowercase in auth)
  const user = getCurrentUser()
  const isAuthorized = !user || user.role === "admin" || user.role === "principal" || user.role === "teacher"

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
    // A 4xx (e.g. no filters submitted) is never transient, so retrying it
    // just re-sends the same bad request — fires 4 identical 400s instead of 1.
    retry: (failureCount, error) => {
      if (error instanceof StudentSearchError && error.status >= 400 && error.status < 500) return false
      return failureCount < 3
    },
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

  const sortHeaderClassName = (field: SortField) =>
    `flex items-center gap-1 px-0 hover:bg-transparent ${sortField === field ? "text-foreground font-semibold" : "text-muted-foreground"}`

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
      <form onSubmit={handleSearch} className="rounded-lg border bg-card p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              placeholder="Enter student's name..."
              value={filters.fullName}
              onChange={(e) => handleInputChange("fullName", e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="studentId">Student ID</Label>
            <Input
              id="studentId"
              placeholder="Enter student ID..."
              value={filters.studentId}
              onChange={(e) => handleInputChange("studentId", e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nicNumber">NIC Number</Label>
            <Input
              id="nicNumber"
              maxLength={10}
              placeholder="Enter NIC..."
              value={filters.nicNumber}
              onChange={(e) => handleInputChange("nicNumber", e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="olYear">O/L Year</Label>
            <Input
              id="olYear"
              type="number"
              min={1950}
              max={2100}
              placeholder="e.g., 2020"
              value={filters.olYear}
              onChange={(e) => {
                const val = e.target.value.slice(0, 4);
                handleInputChange("olYear", val);
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alYear">A/L Year</Label>
            <Input
              id="alYear"
              type="number"
              min={1950}
              max={2100}
              placeholder="e.g., 2023"
              value={filters.alYear}
              onChange={(e) => {
                const val = e.target.value.slice(0, 4);
                handleInputChange("alYear", val);
              }}
              className="w-full"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Button type="submit" className="w-full sm:w-auto">
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="w-full sm:w-auto">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </form>

      {/* Results Section */}
      {hasSearched && (
        <div className="rounded-lg border bg-card overflow-x-auto">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStudents.map((student) => (
                  <TableRow 
                    key={student.id} 
                    className={onSelectStudent ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => onSelectStudent?.(student.id)}
                  >
                    <TableCell className="font-medium">{student.indexNumber}</TableCell>
                    <TableCell>{student.fullName}</TableCell>
                    <TableCell>{formatDate(student.dateOfBirth)}</TableCell>
                    <TableCell>{student.olYear ?? "N/A"}</TableCell>
                    <TableCell>{student.alYear ?? "N/A"}</TableCell>
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
    </div>
  )
}
