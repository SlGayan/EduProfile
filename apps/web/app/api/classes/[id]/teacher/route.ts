import { type NextRequest, NextResponse } from "next/server"
import { classStore, teacherMap } from "../../_store"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json()
  const { teacherId } = body as { teacherId: string }

  const idx = classStore.findIndex((c) => c.id === params.id)
  if (idx === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  if (!teacherMap[teacherId]) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 })
  }

  classStore[idx] = {
    ...classStore[idx],
    teacherId,
    teacherName: teacherMap[teacherId],
  }

  return NextResponse.json(classStore[idx])
}
