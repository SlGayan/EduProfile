import { type NextRequest, NextResponse } from "next/server"

// Mock student data
const mockStudents = [
  {
    id: "1",
    studentId: "STU001",
    fullName: "Amal Perera",
    dateOfBirth: "2005-03-15",
    nicNumber: "200512345678",
    olYear: 2020,
    alYear: 2023,
  },
  {
    id: "2",
    studentId: "STU002",
    fullName: "Nimal Silva",
    dateOfBirth: "2004-07-22",
    nicNumber: "200423456789",
    olYear: 2019,
    alYear: 2022,
  },
  {
    id: "3",
    studentId: "STU003",
    fullName: "Kamala Fernando",
    dateOfBirth: "2006-01-10",
    nicNumber: "200634567890",
    olYear: 2021,
    alYear: 2024,
  },
  {
    id: "4",
    studentId: "STU004",
    fullName: "Sunil Jayawardena",
    dateOfBirth: "2005-11-05",
    nicNumber: "200545678901",
    olYear: 2020,
    alYear: 2023,
  },
  {
    id: "5",
    studentId: "STU005",
    fullName: "Dilini Rajapaksa",
    dateOfBirth: "2003-09-18",
    nicNumber: "200356789012",
    olYear: 2018,
    alYear: 2021,
  },
  {
    id: "6",
    studentId: "STU006",
    fullName: "Kasun Bandara",
    dateOfBirth: "2006-05-30",
    nicNumber: "200667890123",
    olYear: 2021,
    alYear: null,
  },
  {
    id: "7",
    studentId: "STU007",
    fullName: "Sanduni Wickramasinghe",
    dateOfBirth: "2004-12-12",
    nicNumber: "200478901234",
    olYear: 2019,
    alYear: 2022,
  },
  {
    id: "8",
    studentId: "STU008",
    fullName: "Tharindu Gunasekara",
    dateOfBirth: "2005-08-25",
    nicNumber: "200589012345",
    olYear: 2020,
    alYear: 2023,
  },
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const fullName = searchParams.get("fullName")?.toLowerCase()
  const studentId = searchParams.get("studentId")?.toLowerCase()
  const nicNumber = searchParams.get("nicNumber")
  const olYear = searchParams.get("olYear")
  const alYear = searchParams.get("alYear")

  // Filter students based on search criteria
  let filteredStudents = mockStudents

  if (fullName) {
    filteredStudents = filteredStudents.filter((student) => student.fullName.toLowerCase().includes(fullName))
  }

  if (studentId) {
    filteredStudents = filteredStudents.filter((student) => student.studentId.toLowerCase().includes(studentId))
  }

  if (nicNumber) {
    filteredStudents = filteredStudents.filter((student) => student.nicNumber.includes(nicNumber))
  }

  if (olYear) {
    filteredStudents = filteredStudents.filter((student) => student.olYear === Number.parseInt(olYear))
  }

  if (alYear) {
    filteredStudents = filteredStudents.filter((student) => student.alYear === Number.parseInt(alYear))
  }

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  return NextResponse.json(filteredStudents)
}
