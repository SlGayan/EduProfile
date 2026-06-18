import { type NextRequest, NextResponse } from "next/server"
import { classStore } from "../../../_store"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; studentId: string } },
) {
  const idx = classStore.findIndex((c) => c.id === params.id)
  if (idx === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  const studentIdx = classStore[idx].students.findIndex((s) => s.id === params.studentId)
  if (studentIdx === -1) {
    return NextResponse.json({ error: "Student not in class" }, { status: 404 })
  }

  classStore[idx].students.splice(studentIdx, 1)
  classStore[idx].studentCount = classStore[idx].students.length

  return NextResponse.json(classStore[idx])
}
