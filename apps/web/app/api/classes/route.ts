import { type NextRequest, NextResponse } from "next/server"
import { classStore, teacherMap } from "./_store"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const grade = searchParams.get("grade")
  const year = searchParams.get("year")

  let filtered = classStore as typeof classStore

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

  const newId = (classStore.length + 1).toString()
  const resolvedTeacherName = body.teacherId ? (teacherMap[body.teacherId] ?? `Teacher ${body.teacherId}`) : null

  const newClass = {
    id: newId,
    name: body.name as string,
    grade: (body.grade as string) ?? "1",
    year: body.year as number,
    teacherId: (body.teacherId as string | null) || null,
    teacherName: resolvedTeacherName,
    studentCount: 0,
    students: [],
  }

  classStore.push(newClass)
  return NextResponse.json(newClass, { status: 201 })
}
