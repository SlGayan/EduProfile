import { type NextRequest, NextResponse } from "next/server"
import { classStore, teacherMap } from "../_store"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cls = classStore.find((c) => c.id === params.id)
  if (!cls) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }
  return NextResponse.json(cls)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json()
  const idx = classStore.findIndex((c) => c.id === params.id)

  if (idx === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  const teacherName = body.teacherId
    ? (teacherMap[body.teacherId as string] ?? `Teacher ${body.teacherId}`)
    : null

  classStore[idx] = {
    ...classStore[idx],
    name: (body.name as string) ?? classStore[idx].name,
    grade: (body.grade as string) ?? classStore[idx].grade,
    year: (body.year as number) ?? classStore[idx].year,
    teacherId: body.teacherId !== undefined ? ((body.teacherId as string) || null) : classStore[idx].teacherId,
    teacherName: body.teacherId !== undefined ? teacherName : classStore[idx].teacherName,
  }

  return NextResponse.json(classStore[idx])
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const idx = classStore.findIndex((c) => c.id === params.id)

  if (idx === -1) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  classStore.splice(idx, 1)
  return NextResponse.json({ success: true })
}
