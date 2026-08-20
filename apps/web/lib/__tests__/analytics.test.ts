import { describe, it, expect } from "vitest"
import {
  normalizeClassId,
  buildAnalyticsQuery,
  pivotClassAverages,
  pivotStudentProgress,
  buildSubjectChartConfig,
  toSchoolSubjectRows,
  formatAverage,
  formatStudentCount,
  extractApiError,
  type ClassSubjectAverage,
  type SchoolSubjectAverage,
  type StudentProgress,
} from "../analytics"

describe("normalizeClassId", () => {
  // /api/teachers/me/classes returns `id` as a STRING; every analytics response
  // returns `classId` as a NUMBER. Normalising at the boundary is the point.
  it("converts the string id to a number", () => {
    expect(normalizeClassId("3")).toBe(3)
  })

  it("passes a number through", () => {
    expect(normalizeClassId(7)).toBe(7)
  })

  it("returns null rather than NaN for junk", () => {
    expect(normalizeClassId("abc")).toBeNull()
    expect(normalizeClassId("")).toBeNull()
  })

  it("rejects prefix-parsable strings — parseInt('5.9') would give 5", () => {
    expect(normalizeClassId("5.9")).toBeNull()
    expect(normalizeClassId("5abc")).toBeNull()
  })

  it("rejects ids above the API's int4 bound", () => {
    expect(normalizeClassId("2147483648")).toBeNull()
  })
})

describe("buildAnalyticsQuery", () => {
  // Both API query schemas are .strict(): ANY unrecognised or empty key is a 400.
  it("returns an empty string when everything is undefined", () => {
    expect(buildAnalyticsQuery({ year: undefined, term: undefined })).toBe("")
  })

  it("omits undefined rather than sending it empty", () => {
    expect(buildAnalyticsQuery({ year: 2026, term: undefined })).toBe("?year=2026")
  })

  it("includes both when both are set", () => {
    expect(buildAnalyticsQuery({ year: 2026, term: 1 })).toBe("?year=2026&term=1")
  })

  it("omits nulls too", () => {
    expect(buildAnalyticsQuery({ year: null, term: 2 })).toBe("?term=2")
  })

  it("carries classId for the school endpoint", () => {
    expect(buildAnalyticsQuery({ classId: 4, year: undefined })).toBe("?classId=4")
  })
})

describe("pivotClassAverages", () => {
  const rows: ClassSubjectAverage[] = [
    { subjectId: 1, subject: "Mathematics", term: 1, year: 2026, average: 72.4, markCount: 18 },
    { subjectId: 2, subject: "Science", term: 1, year: 2026, average: null, markCount: 0 },
    { subjectId: 1, subject: "Mathematics", term: 2, year: 2026, average: 80, markCount: 18 },
    { subjectId: 3, subject: "English", term: 1, year: 2026, average: 65, markCount: 12 },
  ]

  // Keying the x-axis on `subject` renders two bars both labelled "Mathematics".
  it("puts TIME on the x-axis — one row per (term, year)", () => {
    const { rows: out } = pivotClassAverages(rows)
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.label)).toEqual(["T1 2026", "T2 2026"])
  })

  it("gives each subject a SYNTHETIC key, one chart series each", () => {
    const { rows: out, series } = pivotClassAverages(rows)
    expect(series).toEqual([
      { key: "s0", subject: "English" },
      { key: "s1", subject: "Mathematics" },
    ])
    expect(out[0].s1).toBe(72.4)
    expect(out[0].s0).toBe(65)
    expect(out[1].s1).toBe(80)
  })

  // Subject.name is teacher-supplied CSV (`z.string().min(1)`, no character
  // restriction) and every ChartConfig key is interpolated into
  // dangerouslySetInnerHTML as `--color-${key}`. It must never be the key.
  it("NEVER uses the subject name as a key, however hostile", () => {
    const hostile = "x</style><img src=q onerror=alert(1)>"
    const { rows: out, series } = pivotClassAverages([
      { subjectId: 9, subject: hostile, term: 1, year: 2026, average: 50, markCount: 1 },
    ])
    expect(Object.keys(out[0])).toEqual(["label", "year", "term", "s0"])
    expect(Object.keys(out[0])).not.toContain(hostile)
    expect(series[0]).toEqual({ key: "s0", subject: hostile })
  })

  it("keeps multi-word subjects working — keys stay valid CSS identifiers", () => {
    const { rows: out, series } = pivotClassAverages([
      { subjectId: 4, subject: "Social Studies", term: 1, year: 2026, average: 61, markCount: 3 },
    ])
    expect(series[0].key).toMatch(/^s[0-9]+$/)
    expect(out[0].s0).toBe(61)
  })

  it("survives a subject named after a reserved row field", () => {
    const { rows: out } = pivotClassAverages([
      { subjectId: 5, subject: "year", term: 1, year: 2026, average: 55, markCount: 1 },
      { subjectId: 6, subject: "label", term: 3, year: 2025, average: 70, markCount: 1 },
    ])
    expect(out.map((r) => r.label)).toEqual(["T3 2025", "T1 2026"])
    expect(out[1].year).toBe(2026)
  })

  it("does not swallow a subject named __proto__", () => {
    const { rows: out, series } = pivotClassAverages([
      { subjectId: 7, subject: "__proto__", term: 1, year: 2026, average: 42, markCount: 1 },
    ])
    expect(series[0].subject).toBe("__proto__")
    expect(out[0][series[0].key]).toBe(42)
  })

  it("orders periods chronologically across a year boundary", () => {
    const { rows: out } = pivotClassAverages([
      { subjectId: 1, subject: "Maths", term: 1, year: 2026, average: 50, markCount: 1 },
      { subjectId: 1, subject: "Maths", term: 3, year: 2025, average: 40, markCount: 1 },
    ])
    expect(out.map((r) => r.label)).toEqual(["T3 2025", "T1 2026"])
  })

  // null = "no marks in scope", NOT "scored zero".
  it("DROPS null averages — never coerces to 0", () => {
    const { rows: out, series } = pivotClassAverages(rows)
    expect(series.map((x) => x.subject)).not.toContain("Science")
    expect(Object.values(out[0]).some((v) => v === 0)).toBe(false)
  })

  it("leaves a subject absent in a period undefined, so the chart gaps", () => {
    const { rows: out, series } = pivotClassAverages(rows)
    const english = series.find((x) => x.subject === "English")!.key
    expect(out[1][english]).toBeUndefined()
  })

  it("returns empty rows and no series for an empty scope", () => {
    expect(pivotClassAverages([])).toEqual({ rows: [], series: [] })
  })
})

describe("pivotStudentProgress", () => {
  const student: StudentProgress = {
    studentId: 5,
    studentName: "Nimal Perera",
    indexNumber: "S-001",
    marks: [
      { subject: "Mathematics", term: 1, year: 2026, marks: 81 },
      { subject: "Science", term: 1, year: 2026, marks: 42 },
      { subject: "Mathematics", term: 2, year: 2026, marks: 88 },
    ],
  }

  // A 1:1 map puts Maths 81 and Science 42 on two points both labelled
  // "T1 2026", joined by one line — a within-term collapse that never happened.
  it("collapses one term into a single row, not one row per mark", () => {
    const { rows } = pivotStudentProgress(student)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.label)).toEqual(["T1 2026", "T2 2026"])
  })

  it("keeps each subject a separate series so lines never join across subjects", () => {
    const { rows, series } = pivotStudentProgress(student)
    expect(series.map((x) => x.subject)).toEqual(["Mathematics", "Science"])
    const maths = series.find((x) => x.subject === "Mathematics")!.key
    const science = series.find((x) => x.subject === "Science")!.key
    expect(rows[0][maths]).toBe(81)
    expect(rows[0][science]).toBe(42)
    expect(rows[1][maths]).toBe(88)
    expect(rows[1][science]).toBeUndefined()
  })

  it("preserves a genuine mark of 0", () => {
    const { rows, series } = pivotStudentProgress({
      ...student,
      marks: [{ subject: "Art", term: 1, year: 2026, marks: 0 }],
    })
    expect(series.map((x) => x.subject)).toEqual(["Art"])
    expect(rows[0][series[0].key]).toBe(0)
  })

  it("handles a student with no marks", () => {
    expect(pivotStudentProgress({ ...student, marks: [] })).toEqual({ rows: [], series: [] })
  })
})

describe("buildSubjectChartConfig", () => {
  it("keys the config by the SYNTHETIC key, never the subject name", () => {
    const hostile = "x</style><script>alert(1)</script>"
    const config = buildSubjectChartConfig([{ key: "s0", subject: hostile }])
    expect(Object.keys(config)).toEqual(["s0"])
    expect(Object.keys(config)[0]).not.toContain("<")
    // The name survives only as a label, which React escapes as text.
    expect(config.s0.label).toBe(hostile)
  })

  it("emits only valid CSS custom-property fragments as keys", () => {
    const config = buildSubjectChartConfig([
      { key: "s0", subject: "Social Studies" },
      { key: "s1", subject: "Health & PE" },
    ])
    for (const key of Object.keys(config)) {
      expect(key).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
    }
  })

  it("gives a subject the same colour wherever it appears", () => {
    const classChart = buildSubjectChartConfig([
      { key: "s0", subject: "English" },
      { key: "s1", subject: "Mathematics" },
    ])
    const progressChart = buildSubjectChartConfig([{ key: "s0", subject: "Mathematics" }])
    expect(progressChart.s0.color).toBe(classChart.s1.color)
  })

  // Regression guard: a `% 5` inside the hash loop with multiplier 31
  // degenerates (31 = 1 mod 5) to sum(charCodes) % 5, which buckets most real
  // subject names onto two or three colours. The legend swatch uses the same
  // resolved token, so colliding series become genuinely indistinguishable.
  it("spreads realistic subject names across the palette", () => {
    const subjects = [
      "Mathematics", "Science", "English", "History", "Geography",
      "Sinhala", "Tamil", "ICT", "Commerce", "Health",
    ]
    const config = buildSubjectChartConfig(
      subjects.map((subject, i) => ({ key: "s" + i, subject }))
    )
    const distinct = new Set(Object.values(config).map((c) => c.color))
    expect(distinct.size).toBeGreaterThanOrEqual(4)
  })

  it("always emits a real theme token", () => {
    const config = buildSubjectChartConfig(
      ["a", "b", "c", "d", "e", "f", "g"].map((subject, i) => ({ key: "s" + i, subject }))
    )
    for (const entry of Object.values(config)) {
      expect(entry.color).toMatch(/^var\(--chart-[1-5]\)$/)
    }
  })
})

describe("toSchoolSubjectRows", () => {
  const rows: SchoolSubjectAverage[] = [
    { subjectId: 1, subject: "Mathematics", average: 68.9, markCount: 240 },
    { subjectId: 2, subject: "Science", average: null, markCount: 0 },
  ]

  it("drops null averages", () => {
    const out = toSchoolSubjectRows(rows)
    expect(out).toHaveLength(1)
    expect(out[0].subject).toBe("Mathematics")
  })

  it("returns an empty array for an empty scope", () => {
    expect(toSchoolSubjectRows([])).toEqual([])
  })
})

describe("formatAverage", () => {
  it("renders null as an em dash, NOT 0", () => {
    expect(formatAverage(null)).toBe("—")
    expect(formatAverage(null)).not.toBe("0")
  })

  it("renders a real zero as 0 — a different fact entirely", () => {
    expect(formatAverage(0)).toBe("0")
  })

  it("renders a normal average", () => {
    expect(formatAverage(72.4)).toBe("72.4")
  })
})

describe("formatStudentCount", () => {
  // studentCount = enrolled; scoredStudentCount = has at least one mark.
  it("shows both counts when they differ", () => {
    expect(formatStudentCount(30, 12)).toBe("30 students · 12 with marks")
  })

  it("collapses to one figure when every enrolled student has marks", () => {
    expect(formatStudentCount(30, 30)).toBe("30 students")
  })

  it("handles a class where nobody has marks yet", () => {
    expect(formatStudentCount(28, 0)).toBe("28 students · 0 with marks")
  })

  it("uses the singular for one student", () => {
    expect(formatStudentCount(1, 1)).toBe("1 student")
  })
})

describe("extractApiError (re-exported)", () => {
  it("surfaces the first Zod issue message", () => {
    const body = { error: "Invalid input", details: [{ message: "year must be a 4-digit year" }] }
    expect(extractApiError(body, "fallback")).toBe("year must be a 4-digit year")
  })

  it("falls back to the plain error string", () => {
    expect(extractApiError({ error: "Class not found" }, "fallback")).toBe("Class not found")
  })

  it("returns the fallback for an unusable body", () => {
    expect(extractApiError(null, "fallback")).toBe("fallback")
  })
})
