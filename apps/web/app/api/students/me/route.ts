import { NextResponse } from "next/server"

// Mock student profile data
const mockProfile = {
  id: "STU001",
  fullName: "Alice Johnson",
  studentId: "2024-STU-001",
  dateOfBirth: "2005-03-15",
  nicNumber: "200512345678",
  address: "123 Main Street, Colombo 07, Sri Lanka",
  assignedClass: "Grade 12 - Science Stream",
  email: "student@edu.com",
  phoneNumber: "+94 77 123 4567",
}

export async function GET() {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  return NextResponse.json(mockProfile)
}
