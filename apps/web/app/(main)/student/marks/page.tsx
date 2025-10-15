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

interface Mark {
  id: string
  subject: string
  term: string
  year: string
  marks: number
}

async function fetchMarks(year?: string, term?: string): Promise<Mark[]> {
  const params = new URLSearchParams()
  if (year) params.append("year", year)
  if (term) params.append("term", term)

  const response = await fetch(`/api/marks/my-marks?${params.toString()}`)
  if (!response.ok) {
    throw new Error("Failed to fetch marks")
  }
  return response.json()
}

type SortField = "subject" | "term" | "year" | "marks"
type SortOrder = "asc" | "desc"

export default function StudentMarksPage() {
  const [selectedYear, setSelectedYear] = useState<string>("")
  const [selectedTerm, setSelectedTerm] = useState<string>("")
  const [sortField, setSortField] = useState<SortField>("subject")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")

  const {
    data: marks,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["student-marks", selectedYear, selectedTerm],
    queryFn: () => fetchMarks(selectedYear || undefined, selectedTerm || undefined),
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  const sortedMarks = marks
    ? [...marks].sort((a, b) => {
        let aValue = a[sortField]
        let bValue = b[sortField]

        if (sortField === "marks") {
          aValue = Number(aValue)
          bValue = Number(bValue)
        }

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1
        return 0
      })
    : []

  const years = ["2023", "2024", "2025"]
  const terms = ["Term 1", "Term 2", "Term 3"]

  return (
    <div className="space-y-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight">My Marks</h1>

      <Card>
        <CardHeader>
          <CardTitle>Filter Marks</CardTitle>
          <CardDescription>Select year and term to view your marks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label htmlFor="year" className="text-sm font-medium">
                Year
              </label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="year">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                    <SelectItem key={term} value={term}>
                      {term}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedYear("")
                setSelectedTerm("")
              }}
            >
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academic Results</CardTitle>
          <CardDescription>Your marks across all subjects</CardDescription>
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
              <AlertDescription>Failed to load marks. Please try again later.</AlertDescription>
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
                      <TableCell className="font-medium">{mark.subject}</TableCell>
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
