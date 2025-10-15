import { type NextRequest, NextResponse } from "next/server"

interface Mark {
  id: string
  subject: string
  term: string
  year: string
  marks: number
}

// Mock marks data
const mockMarks: Mark[] = [
  { id: "1", subject: "Mathematics", term: "Term 1", year: "2024", marks: 85 },
  { id: "2", subject: "Physics", term: "Term 1", year: "2024", marks: 78 },
  { id: "3", subject: "Chemistry", term: "Term 1", year: "2024", marks: 82 },
  { id: "4", subject: "Biology", term: "Term 1", year: "2024", marks: 90 },
  { id: "5", subject: "English", term: "Term 1", year: "2024", marks: 88 },
  { id: "6", subject: "Mathematics", term: "Term 2", year: "2024", marks: 92 },
  { id: "7", subject: "Physics", term: "Term 2", year: "2024", marks: 85 },
  { id: "8", subject: "Chemistry", term: "Term 2", year: "2024", marks: 87 },
  { id: "9", subject: "Biology", term: "Term 2", year: "2024", marks: 93 },
  { id: "10", subject: "English", term: "Term 2", year: "2024", marks: 91 },
  { id: "11", subject: "Mathematics", term: "Term 1", year: "2023", marks: 75 },
  { id: "12", subject: "Physics", term: "Term 1", year: "2023", marks: 72 },
  { id: "13", subject: "Chemistry", term: "Term 1", year: "2023", marks: 80 },
  { id: "14", subject: "Biology", term: "Term 1", year: "2023", marks: 85 },
  { id: "15", subject: "English", term: "Term 1", year: "2023", marks: 82 },
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const year = searchParams.get("year")
  const term = searchParams.get("term")

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  let filteredMarks = mockMarks

  if (year && year !== "all") {
    filteredMarks = filteredMarks.filter((mark) => mark.year === year)
  }

  if (term && term !== "all") {
    filteredMarks = filteredMarks.filter((mark) => mark.term === term)
  }

  return NextResponse.json(filteredMarks)
}
