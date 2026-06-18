import { type NextRequest, NextResponse } from "next/server"
import { classStore, allStudents } from "../../_store"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json()
  const { studentId } = body as { studentId: string }

  const idx = classStore.findIndex((c) => c.id === params.id)
  if (idx === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  const student = allStudents.find((s) => s.id === studentId)
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 })
  }

  const alreadyEnrolled = classStore[idx].students.some((s) => s.id === studentId)
  if (alreadyEnrolled) {
    return NextResponse.json({ error: "Student already enrolled" }, { status: 409 })
  }

  classStore[idx].students.push(student)
  classStore[idx].studentCount = classStore[idx].students.length

  return NextResponse.json(classStore[idx])
}
