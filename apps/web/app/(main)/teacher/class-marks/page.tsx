"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ArrowUpDown } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"

interface ClassMark {
  id: string
  studentName: string
  studentIndexNumber: string
  subject: string
  term: number
  year: number
  marks: number
}

async function fetchClassMarks(): Promise<ClassMark[]> {
  const response = await apiFetch("/api/marks/class-marks")
  if (!response.ok) {
    let message = "Failed to fetch class marks"
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
  return response.json()
}

type SortField = "studentName" | "subject" | "term" | "year" | "marks"
type SortOrder = "asc" | "desc"

export default function TeacherClassMarksPage() {
  const [selectedTerm, setSelectedTerm] = useState<string>("")
  const [selectedSubject, setSelectedSubject] = useState<string>("")
  const [sortField, setSortField] = useState<SortField>("studentName")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")

  const {
    data: marks,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["class-marks"],
    queryFn: fetchClassMarks,
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  const subjectOptions = marks ? [...new Set(marks.map((m) => m.subject))].sort() : []
  const terms = [1, 2, 3]

  const filteredMarks = (marks ?? []).filter((mark) => {
    if (selectedTerm && selectedTerm !== "all" && mark.term !== Number(selectedTerm)) return false
    if (selectedSubject && selectedSubject !== "all" && mark.subject !== selectedSubject) return false
    return true
  })

  const sortedMarks = [...filteredMarks].sort((a, b) => {
    let aValue = a[sortField]
    let bValue = b[sortField]

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue
    }

    aValue = String(aValue)
    bValue = String(bValue)
    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1
    return 0
  })

  return (
    <div className="space-y-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight">Class Marks</h1>

      <Card>
        <CardHeader>
          <CardTitle>Filter Marks</CardTitle>
          <CardDescription>Select term and subject to view class results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label htmlFor="term" className="text-sm font-medium">
                Term
              </label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger id="term">
                  <SelectValue placeholder="All Terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Terms</SelectItem>
                  {terms.map((term) => (
                    <SelectItem key={term} value={String(term)}>
                      {`Term ${term}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-2">
              <label htmlFor="subject" className="text-sm font-medium">
                Subject
              </label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger id="subject">
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjectOptions.map((subject) => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedTerm("")
                setSelectedSubject("")
              }}
            >
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Class Results</CardTitle>
          <CardDescription>Marks for all students in your class</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : "Failed to load class marks. Please try again later."}
              </AlertDescription>
            </Alert>
          ) : sortedMarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No marks found</p>
              <p className="text-sm text-muted-foreground">No marks available for the selected criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("studentName")}
                        className="flex items-center gap-1 px-0 hover:bg-transparent"
                      >
                        Student
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("subject")}
                        className="flex items-center gap-1 px-0 hover:bg-transparent"
                      >
                        Subject
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("term")}
                        className="flex items-center gap-1 px-0 hover:bg-transparent"
                      >
                        Term
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("year")}
                        className="flex items-center gap-1 px-0 hover:bg-transparent"
                      >
                        Year
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort("marks")}
                        className="flex items-center gap-1 px-0 hover:bg-transparent"
                      >
                        Marks
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMarks.map((mark) => (
                    <TableRow key={mark.id}>
                      <TableCell className="font-medium">
                        {mark.studentName}
                        <span className="ml-2 text-muted-foreground">({mark.studentIndexNumber})</span>
                      </TableCell>
                      <TableCell>{mark.subject}</TableCell>
                      <TableCell>{mark.term}</TableCell>
                      <TableCell>{mark.year}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{mark.marks}</span>
                        <span className="text-muted-foreground">/100</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
