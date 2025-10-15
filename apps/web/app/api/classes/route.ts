import { type NextRequest, NextResponse } from "next/server"

// Mock data
const classes = [
  {
    id: "1",
    name: "10A",
    grade: "10",
    year: 2025,
    teacherId: "t1",
    teacherName: "Mr. John Smith",
    studentCount: 32,
  },
  {
    id: "2",
    name: "11 Science",
    grade: "11",
    year: 2025,
    teacherId: "t2",
    teacherName: "Ms. Sarah Johnson",
    studentCount: 28,
  },
  {
    id: "3",
    name: "12 Commerce",
    grade: "12",
    year: 2025,
    teacherId: null,
    teacherName: null,
    studentCount: 25,
  },
  {
    id: "4",
    name: "9B",
    grade: "9",
    year: 2025,
    teacherId: "t3",
    teacherName: "Mr. David Lee",
    studentCount: 30,
  },
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const grade = searchParams.get("grade")
  const year = searchParams.get("year")

  let filtered = classes

  if (grade && grade !== "all") {
    filtered = filtered.filter((c) => c.grade === grade)
  }

  if (year && year !== "all") {
    filtered = filtered.filter((c) => c.year === Number.parseInt(year))
  }

  return NextResponse.json(filtered)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const newClass = {
    id: (classes.length + 1).toString(),
    name: body.name,
    grade: body.grade,
    year: body.year,
    teacherId: body.teacherId || null,
    teacherName: body.teacherId ? `Teacher ${body.teacherId}` : null,
    studentCount: 0,
  }

  classes.push(newClass)
  return NextResponse.json(newClass, { status: 201 })
}
