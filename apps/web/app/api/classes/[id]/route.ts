import { type NextRequest, NextResponse } from "next/server"

// Mock data (shared with route.ts)
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

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  const classIndex = classes.findIndex((c) => c.id === params.id)

  if (classIndex === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  classes[classIndex] = {
    ...classes[classIndex],
    name: body.name,
    grade: body.grade,
    year: body.year,
    teacherId: body.teacherId || null,
    teacherName: body.teacherId ? `Teacher ${body.teacherId}` : null,
  }

  return NextResponse.json(classes[classIndex])
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const classIndex = classes.findIndex((c) => c.id === params.id)

  if (classIndex === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  classes.splice(classIndex, 1)
  return NextResponse.json({ success: true })
}
