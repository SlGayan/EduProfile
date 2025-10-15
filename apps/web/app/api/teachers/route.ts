import { NextResponse } from "next/server"

// Mock teachers data
const teachers = [
  { id: "t1", name: "Mr. John Smith" },
  { id: "t2", name: "Ms. Sarah Johnson" },
  { id: "t3", name: "Mr. David Lee" },
  { id: "t4", name: "Ms. Emily Brown" },
  { id: "t5", name: "Mr. Michael Chen" },
  { id: "t6", name: "Ms. Lisa Anderson" },
]

export async function GET() {
  return NextResponse.json(teachers)
}
