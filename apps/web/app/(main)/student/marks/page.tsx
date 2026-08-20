"use client"

import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { apiFetch } from "@/lib/apiFetch"

interface Mark {
  id: string
  subject: string
  term: number
  year: number
  marks: number
}

async function fetchMarks(year?: string, term?: string): Promise<Mark[]> {
  const params = new URLSearchParams()
  if (year) params.append("year", year)
  if (term) params.append("term", term)

  const response = await apiFetch(`/api/marks/my-marks?${params.toString()}`)
  if (!response.ok) {
    throw new Error("Failed to fetch marks")
  }
  return response.json()
}

interface MarkGroup {
  year: number
  term: number
  marks: Mark[]
}

function groupMarks(marks: Mark[]): MarkGroup[] {
  const groupsByKey = new Map<string, MarkGroup>()
  const orderedGroups: MarkGroup[] = []

  for (const mark of marks) {
    const key = `${mark.year}-${mark.term}`
    let group = groupsByKey.get(key)
    if (!group) {
      group = { year: mark.year, term: mark.term, marks: [] }
      groupsByKey.set(key, group)
      orderedGroups.push(group)
    }
    group.marks.push(mark)
  }

  return orderedGroups
}

export default function StudentMarksPage() {
  const [selectedYear, setSelectedYear] = useState<string>("")
  const [selectedTerm, setSelectedTerm] = useState<string>("")

  const {
    data: marks,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["student-marks", selectedYear, selectedTerm],
    queryFn: () => fetchMarks(selectedYear || undefined, selectedTerm || undefined),
  })

  const years = ["2023", "2024", "2025"]
  const terms = [1, 2, 3]

  const groupedMarks = marks ? groupMarks(marks) : []

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">My Marks</h1>

      <Card>
        <CardHeader>
          <CardTitle>Filter Marks</CardTitle>
          <CardDescription>Select year and term to view your marks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label htmlFor="year" className="mb-1 block text-sm font-medium">
                Year
              </label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="year" className="w-full">
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
              <label htmlFor="term" className="mb-1 block text-sm font-medium">
                Term
              </label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger id="term" className="w-full">
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

            <Button
              variant="outline"
              onClick={() => {
                setSelectedYear("")
                setSelectedTerm("")
              }}
              className="w-full sm:w-auto"
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
          ) : groupedMarks.length === 0 ? (
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
                    <TableHead>Subject</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Marks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedMarks.map((group) => (
                    <Fragment key={`${group.year}-${group.term}`}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={4} className="font-semibold">
                          {`Year ${group.year} — Term ${group.term}`}
                        </TableCell>
                      </TableRow>
                      {group.marks.map((mark) => (
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
                    </Fragment>
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
