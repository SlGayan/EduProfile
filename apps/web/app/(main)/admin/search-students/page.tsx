"use client"

import type React from "react"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, RotateCcw, Eye } from "lucide-react"
import Link from "next/link"

interface SearchFilters {
  fullName: string
  studentId: string
  nicNumber: string
  olYear: string
  alYear: string
}

interface Student {
  id: string
  studentId: string
  fullName: string
  dateOfBirth: string
  olYear: number | null
  alYear: number | null
}

export default function StudentSearchPage() {
  const [filters, setFilters] = useState<SearchFilters>({
    fullName: "",
    studentId: "",
    nicNumber: "",
    olYear: "",
    alYear: "",
  })
  const [hasSearched, setHasSearched] = useState(false)

  // Build query params from filters
  const buildQueryParams = () => {
    const params = new URLSearchParams()
    if (filters.fullName) params.append("fullName", filters.fullName)
    if (filters.studentId) params.append("studentId", filters.studentId)
    if (filters.nicNumber) params.append("nicNumber", filters.nicNumber)
    if (filters.olYear) params.append("olYear", filters.olYear)
    if (filters.alYear) params.append("alYear", filters.alYear)
    return params.toString()
  }

  // Fetch students using TanStack Query
  const { data: students, isLoading } = useQuery<Student[]>({
    queryKey: ["students", filters],
    queryFn: async () => {
      const queryParams = buildQueryParams()
      const response = await fetch(`/api/students/search?${queryParams}`)
      if (!response.ok) throw new Error("Failed to fetch students")
      return response.json()
    },
    enabled: hasSearched,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setHasSearched(true)
  }

  const handleReset = () => {
    setFilters({
      fullName: "",
      studentId: "",
      nicNumber: "",
      olYear: "",
      alYear: "",
    })
    setHasSearched(false)
  }

  const handleInputChange = (field: keyof SearchFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
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
          ) : students && students.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Date of Birth</TableHead>
                  <TableHead>O/L Year</TableHead>
                  <TableHead>A/L Year</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.studentId}</TableCell>
                    <TableCell>{student.fullName}</TableCell>
                    <TableCell>{student.dateOfBirth}</TableCell>
                    <TableCell>{student.olYear || "N/A"}</TableCell>
                    <TableCell>{student.alYear || "N/A"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/students/${student.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Profile
                        </Link>
                      </Button>
                    </TableCell>
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
