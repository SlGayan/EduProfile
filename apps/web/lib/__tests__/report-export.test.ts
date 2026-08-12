import { describe, it, expect } from "vitest"
import {
  SUMMARY_NOTE,
  buildReportFilename,
  buildReportModel,
  findUnsupportedNames,
  formatGeneratedAt,
  hasUnsupportedGlyphs,
} from "../report-export"
import type { SchoolAnalytics } from "../analytics"

/**
 * Story 10.3, AC1 and AC2 — the pure half.
 *
 * `exportReportPdf` is deliberately not exercised here: it drives a browser-only
 * library and jsdom cannot render a PDF. It is asserted at the call level in
 * `__tests__/principal-analytics-page.test.tsx` instead.
 */

/**
 * Deliberately built so `classBreakdown` does NOT reconcile with `totals`:
 * 120 + 90 = 210 marks and 30 + 28 = 58 students in the rows, against totals of
 * 180 and 45. That is the real shape — `TermMark` has no `classId`, so a student
 * enrolled in two classes is credited to both rows but counted once school-wide.
 * Any implementation that sums the rows will fail these assertions.
 */
const analytics: SchoolAnalytics = {
  scope: { classId: null, year: 2026 },
  totals: { markCount: 180, studentCount: 45, unassignedMarkCount: 0 },
  subjectAverages: [
    { subjectId: 1, subject: "Mathematics", average: 68.9, markCount: 120 },
    { subjectId: 2, subject: "Social Studies", average: 0, markCount: 60 },
  ],
  classBreakdown: [
    {
      classId: 1,
      className: "Grade 10-A",
      average: 72.4,
      studentCount: 30,
      scoredStudentCount: 24,
      markCount: 120,
    },
    {
      classId: 2,
      className: "Grade 10-C",
      average: null,
      studentCount: 28,
      scoredStudentCount: 0,
      markCount: 90,
    },
  ],
}

const unscopedScope = { className: null, year: null }

function flat(rows: string[][]): string {
  return rows.map((r) => r.join("|")).join("\n")
}

describe("buildReportFilename", () => {
  it("builds a lowercase slug from the class name and year", () => {
    expect(buildReportFilename({ className: "Grade 10-A", year: 2026 })).toBe("grade-10-a_2026")
  })

  it("falls back to school and all-years when nothing is selected", () => {
    expect(buildReportFilename({ className: null, year: null })).toBe("school_all-years")
    expect(buildReportFilename({})).toBe("school_all-years")
  })

  it("includes the year only when one is selected", () => {
    expect(buildReportFilename({ className: "Grade 9", year: null })).toBe("grade-9_all-years")
    expect(buildReportFilename({ className: "Grade 9", year: 2024 })).toBe("grade-9_2024")
  })

  it("strips path traversal out of a class name", () => {
    expect(buildReportFilename({ className: "../../etc/passwd" })).toBe("etc-passwd_all-years")
  })

  it("collapses runs of punctuation and whitespace to a single dash", () => {
    expect(buildReportFilename({ className: "Grade   10 -- A" })).toBe("grade-10-a_all-years")
  })

  it("collapses a newline rather than carrying it into the filename", () => {
    expect(buildReportFilename({ className: "Grade\n10" })).toBe("grade-10_all-years")
  })

  it("falls back to school when the name sanitises to nothing", () => {
    expect(buildReportFilename({ className: "数学" })).toBe("school_all-years")
    expect(buildReportFilename({ className: "!!!" })).toBe("school_all-years")
    expect(buildReportFilename({ className: "   " })).toBe("school_all-years")
  })

  it("caps the class segment at 60 characters and leaves no trailing dash", () => {
    const name = buildReportFilename({ className: "A".repeat(200) })
    const [classSegment] = name.split("_")
    expect(classSegment.length).toBe(60)
    expect(classSegment.endsWith("-")).toBe(false)
  })

  it("does not leave a trailing dash when truncation lands on a separator", () => {
    // 59 chars, then a space, then more — truncating at 60 would end on the dash.
    const classSegment = buildReportFilename({ className: `${"a".repeat(59)} bcdef` }).split("_")[0]
    expect(classSegment.endsWith("-")).toBe(false)
  })

  it("never emits a path separator, colon, leading dot or control character", () => {
    const hostile = [
      "../../etc/passwd",
      "C:\\Windows\\System32",
      "..",
      ".hidden",
      "a/b\\c:d",
      "report\r\nContent-Disposition: attachment",
      "<script>alert(1)</script>",
      "%2e%2e%2f",
      "__proto__",
      "con",
    ]
    for (const className of hostile) {
      const name = buildReportFilename({ className, year: 2026 })
      expect(name, className).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
      expect(name, className).not.toContain("..")
    }
  })
})

describe("buildReportModel", () => {
  it("renders a null class average as an em dash, never as zero", () => {
    const model = buildReportModel(analytics, unscopedScope)
    const row = model.classes.body.find((r) => r[0] === "Grade 10-C")
    expect(row).toBeDefined()
    expect(row![1]).toBe("—")
    expect(row![1]).not.toBe("0")
  })

  it("preserves a genuine average of zero as a number", () => {
    const model = buildReportModel(analytics, unscopedScope)
    const row = model.subjects.body.find((r) => r[0] === "Social Studies")
    expect(row![1]).toBe("0")
  })

  it("uses the totals block verbatim and never sums classBreakdown", () => {
    const model = buildReportModel(analytics, unscopedScope)
    const summary = flat(model.summary)
    expect(summary).toContain("180")
    expect(summary).toContain("45")
    // 210 and 58 are the sums of the per-class rows — the wrong numbers.
    expect(summary).not.toContain("210")
    expect(summary).not.toContain("58")
  })

  it("emits enrolled and scored student counts as two distinct columns", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.classes.head).toContain("Students enrolled")
    expect(model.classes.head).toContain("With marks")
    const row = model.classes.body.find((r) => r[0] === "Grade 10-A")
    expect(row).toEqual(["Grade 10-A", "72.4", "30", "24", "120"])
  })

  it("omits the unassigned-marks note when the count is zero", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.unassignedNote).toBeNull()
  })

  it("includes the unassigned-marks note when the count is above zero", () => {
    const withUnassigned: SchoolAnalytics = {
      ...analytics,
      totals: { ...analytics.totals, unassignedMarkCount: 4 },
    }
    const model = buildReportModel(withUnassigned, unscopedScope)
    expect(model.unassignedNote).toContain("4")
    expect(model.unassignedNote?.toLowerCase()).toContain("no class")
  })

  it("describes the selected scope in the scope line", () => {
    const scoped = buildReportModel(analytics, { className: "Grade 10-A", year: 2026 })
    expect(scoped.scopeLine).toContain("Grade 10-A")
    expect(scoped.scopeLine).toContain("2026")

    const unscoped = buildReportModel(analytics, unscopedScope)
    expect(unscoped.scopeLine).toContain("All classes")
    expect(unscoped.scopeLine).toContain("All years")
  })

  it("renders every school subject average row", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.subjects.body).toHaveLength(2)
    expect(model.subjects.head).toEqual(["Subject", "Average", "Marks"])
  })

  it("renders every class row, including one with no marks", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.classes.body).toHaveLength(2)
  })

  it("carries a title and a generated-at stamp", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.title).toBeTruthy()
    expect(model.generatedAt).toBeTruthy()
  })

  it("always explains why the totals do not sum to the class rows", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.summaryNote).toBe(SUMMARY_NOTE)
    expect(model.summaryNote).toMatch(/not the sum of the class rows/i)
    // The page carries this on screen; the PDF is what actually leaves.
    expect(model.summaryNote).toMatch(/counted once here but credited to both/i)
  })
})

describe("buildReportFilename — class id disambiguation", () => {
  it("appends the class id so two same-named classes cannot collide", () => {
    expect(buildReportFilename({ className: "Grade 10-A", classId: 3, year: 2026 })).toBe(
      "grade-10-a-3_2026"
    )
    expect(buildReportFilename({ className: "Grade 10-A", classId: 7, year: 2026 })).toBe(
      "grade-10-a-7_2026"
    )
  })

  it("does not append an id to the all-classes scope", () => {
    expect(buildReportFilename({ className: null, classId: null, year: 2026 })).toBe("school_2026")
  })

  it("still matches the safe-filename shape with an id attached", () => {
    const name = buildReportFilename({ className: "../../etc/passwd", classId: 9, year: 2026 })
    expect(name).toBe("etc-passwd-9_2026")
    expect(name).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
  })
})

describe("buildScopeLine — class id in the printed document", () => {
  it("identifies the class by id so a printed copy is unambiguous", () => {
    const model = buildReportModel(analytics, { className: "Grade 10-A", classId: 3, year: 2026 })
    expect(model.scopeLine).toContain("Grade 10-A")
    expect(model.scopeLine).toContain("#3")
  })

  it("omits the id marker when no class is selected", () => {
    const model = buildReportModel(analytics, unscopedScope)
    expect(model.scopeLine).toContain("All classes")
    expect(model.scopeLine).not.toContain("#")
  })
})

describe("formatGeneratedAt", () => {
  it("uses a fixed field order rather than the browser locale", () => {
    // 2026-08-12 16:45 local. toLocaleString() would render this as either
    // 8/12/2026 or 12/08/2026 depending on the exporting browser.
    const stamp = formatGeneratedAt(new Date(2026, 7, 12, 16, 45))
    expect(stamp).toContain("2026-08-12 16:45")
    expect(stamp).not.toMatch(/8\/12\/2026|12\/08\/2026/)
  })

  it("states the UTC offset, so two reports can always be ordered", () => {
    expect(formatGeneratedAt(new Date(2026, 7, 12, 16, 45))).toMatch(/\(UTC[+-]\d{2}:\d{2}\)/)
  })

  it("zero-pads single-digit months, days, hours and minutes", () => {
    expect(formatGeneratedAt(new Date(2026, 0, 5, 9, 7))).toContain("2026-01-05 09:07")
  })
})

describe("hasUnsupportedGlyphs — jsPDF standard fonts are WinAnsi only", () => {
  it("accepts the characters this report actually depends on", () => {
    // Verified at byte level against jspdf 4.2.1: em dash emits 0x97.
    expect(hasUnsupportedGlyphs("—")).toBe(false)
    expect(hasUnsupportedGlyphs("Grade 10-A")).toBe(false)
    expect(hasUnsupportedGlyphs("Mathematics · 2026")).toBe(false)
    expect(hasUnsupportedGlyphs("café")).toBe(false)
    expect(hasUnsupportedGlyphs("it’s")).toBe(false)
    expect(hasUnsupportedGlyphs("€100")).toBe(false)
  })

  it("flags scripts that jsPDF silently corrupts", () => {
    expect(hasUnsupportedGlyphs("数学")).toBe(true)
    expect(hasUnsupportedGlyphs("ගණිතය")).toBe(true)
    expect(hasUnsupportedGlyphs("கணிதம்")).toBe(true)
    expect(hasUnsupportedGlyphs("Grade 10-අ")).toBe(true)
  })
})

describe("findUnsupportedNames", () => {
  it("returns nothing for an all-Latin report", () => {
    expect(findUnsupportedNames(analytics, unscopedScope)).toEqual([])
  })

  it("names every affected subject and class exactly once", () => {
    const mixed: SchoolAnalytics = {
      ...analytics,
      subjectAverages: [
        { subjectId: 1, subject: "ගණිතය", average: 70, markCount: 10 },
        { subjectId: 2, subject: "Mathematics", average: 68, markCount: 10 },
      ],
      classBreakdown: [
        {
          classId: 1,
          className: "ගණිතය",
          average: 70,
          studentCount: 1,
          scoredStudentCount: 1,
          markCount: 10,
        },
      ],
    }
    expect(findUnsupportedNames(mixed, unscopedScope)).toEqual(["ගණිතය"])
  })

  it("includes the selected class name itself", () => {
    expect(findUnsupportedNames(analytics, { className: "数学", classId: 4 })).toEqual(["数学"])
  })
})
