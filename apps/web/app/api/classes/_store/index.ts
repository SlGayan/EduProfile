// Shared in-memory store for the classes mock API.
// Next.js Route Handlers share the same Node.js module cache within a process,
// so mutations in one handler are visible to others via this singleton.

export interface MockStudent {
  id: string
  studentId: string
  fullName: string
  dateOfBirth: string
}

export interface MockClass {
  id: string
  name: string
  grade: string
  year: number
  teacherId: string | null
  teacherName: string | null
  studentCount: number
  students: MockStudent[]
}

export const teacherMap: Record<string, string> = {
  t1: "Mr. John Smith",
  t2: "Ms. Sarah Johnson",
  t3: "Mr. David Lee",
  t4: "Ms. Emily Brown",
  t5: "Mr. Michael Chen",
  t6: "Ms. Lisa Anderson",
}

export const allStudents: MockStudent[] = [
  { id: "1", studentId: "STU001", fullName: "Amal Perera", dateOfBirth: "2005-03-15" },
  { id: "2", studentId: "STU002", fullName: "Nimal Silva", dateOfBirth: "2004-07-22" },
  { id: "3", studentId: "STU003", fullName: "Kamala Fernando", dateOfBirth: "2006-01-10" },
  { id: "4", studentId: "STU004", fullName: "Sunil Jayawardena", dateOfBirth: "2005-11-05" },
  { id: "5", studentId: "STU005", fullName: "Dilini Rajapaksa", dateOfBirth: "2003-09-18" },
  { id: "6", studentId: "STU006", fullName: "Kasun Bandara", dateOfBirth: "2006-05-30" },
  { id: "7", studentId: "STU007", fullName: "Sanduni Wickramasinghe", dateOfBirth: "2004-12-12" },
  { id: "8", studentId: "STU008", fullName: "Tharindu Gunasekara", dateOfBirth: "2005-08-25" },
]

export const classStore: MockClass[] = [
  {
    id: "1",
    name: "10A",
    grade: "10",
    year: 2025,
    teacherId: "t1",
    teacherName: "Mr. John Smith",
    studentCount: 2,
    students: [
      { id: "1", studentId: "STU001", fullName: "Amal Perera", dateOfBirth: "2005-03-15" },
      { id: "2", studentId: "STU002", fullName: "Nimal Silva", dateOfBirth: "2004-07-22" },
    ],
  },
  {
    id: "2",
    name: "11 Science",
    grade: "11",
    year: 2025,
    teacherId: "t2",
    teacherName: "Ms. Sarah Johnson",
    studentCount: 1,
    students: [
      { id: "3", studentId: "STU003", fullName: "Kamala Fernando", dateOfBirth: "2006-01-10" },
    ],
  },
  {
    id: "3",
    name: "12 Commerce",
    grade: "12",
    year: 2025,
    teacherId: null,
    teacherName: null,
    studentCount: 0,
    students: [],
  },
  {
    id: "4",
    name: "9B",
    grade: "9",
    year: 2025,
    teacherId: "t3",
    teacherName: "Mr. David Lee",
    studentCount: 0,
    students: [],
  },
]
