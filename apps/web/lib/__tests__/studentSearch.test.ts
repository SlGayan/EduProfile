import { describe, it, expect } from "vitest"
import { sortStudents, formatDate, type SortableStudent } from "../studentSearch"

const students: SortableStudent[] = [
  { indexNumber: "STU003", fullName: "Kasun Silva", dateOfBirth: "2020-05-01T00:00:00.000Z", olYear: 2020, alYear: 2023 },
  { indexNumber: "STU001", fullName: "Amal Perera", dateOfBirth: "2005-03-15T00:00:00.000Z", olYear: 2021, alYear: 2024 },
  { indexNumber: "STU002", fullName: "amali fernando", dateOfBirth: "2010-01-10T00:00:00.000Z", olYear: 2019, alYear: null },
]

describe("sortStudents", () => {
  it("sorts a string field ascending", () => {
    const sorted = sortStudents(students, "fullName", "asc")
    expect(sorted.map((s) => s.fullName)).toEqual(["Amal Perera", "Kasun Silva", "amali fernando"])
  })

  it("sorts a string field descending", () => {
    const sorted = sortStudents(students, "fullName", "desc")
    expect(sorted.map((s) => s.fullName)).toEqual(["amali fernando", "Kasun Silva", "Amal Perera"])
  })

  it("sorts a numeric field ascending", () => {
    const sorted = sortStudents(students, "olYear", "asc")
    expect(sorted.map((s) => s.olYear)).toEqual([2019, 2020, 2021])
  })

  it("sorts a numeric field descending", () => {
    const sorted = sortStudents(students, "olYear", "desc")
    expect(sorted.map((s) => s.olYear)).toEqual([2021, 2020, 2019])
  })

  it("does not mutate the original array", () => {
    const copy = [...students]
    sortStudents(students, "fullName", "asc")
    expect(students).toEqual(copy)
  })

  it("sorts a nullable numeric field, falling back to string comparison when a null is present", () => {
    // alYear has a null for "amali fernando" — matches the existing class-marks
    // comparator's documented behavior (String(null) === "null") rather than
    // special-casing nulls, since this pattern was reused verbatim per the story.
    const sorted = sortStudents(students, "alYear", "asc")
    expect(sorted.map((s) => s.alYear)).toEqual([2023, 2024, null])
  })
})

describe("formatDate", () => {
  it("formats a full ISO datetime string as a plain date", () => {
    expect(formatDate("2005-03-15T00:00:00.000Z")).toBe("2005-03-15")
  })

  it("returns the original string if it cannot be parsed as a date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date")
  })
})
