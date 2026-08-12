/**
 * Types, pure helpers and fetchers for academic performance analytics
 * (Story 10.2), consuming the Story 10.1 endpoints.
 *
 * Four contract facts drive this file:
 *
 *  1. `classBreakdown[].average` is `number | null`. `null` means "no marks
 *     recorded in this scope" — NOT "everyone scored zero". Coercing with
 *     `?? 0` puts a point at the bottom of a chart and tells a principal a
 *     class failed.
 *  2. `studentCount` is students ENROLLED; `scoredStudentCount` is those with
 *     at least one mark. Different numbers.
 *  3. Both query schemas are `.strict()` — any unrecognised key is a 400,
 *     including a cache-buster. Only ever send `year`, `term`, `classId`.
 *  4. `/api/classes` returns `{ classes: [...] }` while
 *     `/api/teachers/me/classes` returns a bare array. Two envelopes.
 */
import { apiFetch } from "./apiFetch"
import { extractApiError } from "./utils"

export { extractApiError }

/** Matches the API's `POSTGRES_INT4_MAX`; larger ids throw inside Prisma. */
const POSTGRES_INT4_MAX = 2147483647

// ---------------------------------------------------------------------------
// Response types — mirror apps/api/src/modules/analytics/analytics.controller.ts
// ---------------------------------------------------------------------------

/** `id` arrives as a STRING here; analytics responses use a NUMBER `classId`. */
export interface TeacherClassResponse {
  id: string
  name: string
}

export interface TeacherClass {
  id: number
  name: string
}

/** Grouped by (subject, term, year) — a subject recurs per term AND per year. */
export interface ClassSubjectAverage {
  subjectId: number
  subject: string
  term: number
  year: number
  average: number | null
  markCount: number
}

export interface StudentMark {
  subject: string
  term: number
  year: number
  marks: number
}

export interface StudentProgress {
  studentId: number
  studentName: string
  indexNumber: string
  marks: StudentMark[]
}

export interface ClassAnalytics {
  classId: number
  className: string
  scope: { year: number | null; term: number | null }
  subjectAverages: ClassSubjectAverage[]
  studentProgress: StudentProgress[]
}

/** Grouped by subject alone — no term/year, unlike the class endpoint. */
export interface SchoolSubjectAverage {
  subjectId: number
  subject: string
  average: number | null
  markCount: number
}

export interface ClassBreakdown {
  classId: number
  className: string
  average: number | null
  /** Students ENROLLED in the class. */
  studentCount: number
  /** Students with at least one mark in the selected scope. */
  scoredStudentCount: number
  markCount: number
}

/**
 * School-level truth. Summing `classBreakdown` does NOT reproduce this — a
 * student enrolled in two classes has their marks credited to both.
 */
export interface SchoolTotals {
  markCount: number
  studentCount: number
  /** Marks belonging to students in no class at all. */
  unassignedMarkCount: number
}

export interface SchoolAnalytics {
  scope: { classId: number | null; year: number | null }
  totals: SchoolTotals
  subjectAverages: SchoolSubjectAverage[]
  classBreakdown: ClassBreakdown[]
}

export interface ClassOption {
  id: number
  name: string
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Bridges the string/number id mismatch between `/teachers/me/classes` and the
 * analytics endpoints.
 *
 * Digits-only on purpose: `parseInt("5.9")` returns 5, which would silently
 * request a real but different class — the defect found in the 8.2 review.
 * The int4 ceiling mirrors the API's own `parseId`.
 */
export function normalizeClassId(id: string | number): number | null {
  if (typeof id === "number") {
    return Number.isSafeInteger(id) && id > 0 && id <= POSTGRES_INT4_MAX ? id : null
  }
  if (!/^\d+$/.test(id)) return null
  const parsed = Number(id)
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= POSTGRES_INT4_MAX ? parsed : null
}

/**
 * Builds a query string containing ONLY the keys the API accepts. Undefined and
 * null are omitted entirely rather than sent empty, because the schemas are
 * `.strict()` and an unexpected or empty key is a 400.
 */
export function buildAnalyticsQuery(
  params: Record<string, number | null | undefined>
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

/** "T1 2026" — a single point on the time axis. */
export function periodLabel(term: number, year: number): string {
  return `T${term} ${year}`
}

/**
 * One row per (term, year) period, with one key per subject:
 * `{ label: "T1 2026", s0: 72.4, s1: 52.5 }`
 *
 * This shape lets a chart put TIME on the x-axis and give each subject its own
 * series. A missing subject in a period stays `undefined` so the chart draws a
 * gap rather than dropping to zero.
 */
export interface PeriodRow {
  label: string
  year: number
  term: number
  /** Values live under SYNTHETIC keys (`s0`, `s1`, …) — never the subject name. */
  [seriesKey: string]: string | number | undefined
}

/** A chart series: a safe key for data/CSS, plus the name to display. */
export interface SubjectSeries {
  key: string
  subject: string
}

interface PivotResult {
  rows: PeriodRow[]
  series: SubjectSeries[]
}

/**
 * ⚠️ Subject names are NEVER used as keys.
 *
 * `Subject.name` comes from a teacher-uploaded CSV validated only as
 * `z.string().min(1)` — no character restriction — and shadcn's `ChartStyle`
 * interpolates every config key straight into a `dangerouslySetInnerHTML`
 * `<style>` block as `--color-${key}`. Using the subject name as the key would
 * let a teacher store script that runs in a principal's browser, and would
 * break colours outright for any ordinary multi-word name ("Social Studies" is
 * not a valid custom-property identifier). It also collides with the reserved
 * `label`/`year`/`term` fields and silently swallows `__proto__`.
 *
 * Synthetic `s0`, `s1`, … keys close all four. The subject name travels only as
 * `ChartConfig.label`, which React escapes as ordinary text.
 */
function pivot(
  entries: Array<{ subject: string; term: number; year: number; value: number | null }>
): PivotResult {
  const subjects = new Set<string>()
  for (const entry of entries) {
    if (entry.value === null) continue
    subjects.add(entry.subject)
  }

  const series: SubjectSeries[] = [...subjects]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((subject, index) => ({ key: `s${index}`, subject }))
  const keyBySubject = new Map(series.map((s) => [s.subject, s.key]))

  const byPeriod = new Map<string, PeriodRow>()
  for (const entry of entries) {
    // null means "no marks in this scope" — dropped, never coerced to 0.
    if (entry.value === null) continue
    const label = periodLabel(entry.term, entry.year)
    let row = byPeriod.get(label)
    if (!row) {
      row = { label, year: entry.year, term: entry.term }
      byPeriod.set(label, row)
    }
    row[keyBySubject.get(entry.subject)!] = entry.value
  }

  const rows = [...byPeriod.values()].sort((a, b) => a.year - b.year || a.term - b.term)
  return { rows, series }
}

/** Class averages, pivoted so the x-axis is time and each subject is a series. */
export function pivotClassAverages(rows: ClassSubjectAverage[]): PivotResult {
  return pivot(
    rows.map((row) => ({
      subject: row.subject,
      term: row.term,
      year: row.year,
      value: row.average,
    }))
  )
}

/**
 * One student's marks, pivoted the same way.
 *
 * A student has one mark per (subject, term, year), so a flat 1:1 mapping would
 * put Maths 81, Science 42 and English 95 on three points all labelled
 * "T1 2026" joined by a single line — reading as a collapse and recovery within
 * one term. Pivoting gives each subject its own line across real time.
 */
export function pivotStudentProgress(student: StudentProgress): PivotResult {
  return pivot(
    student.marks.map((mark) => ({
      subject: mark.subject,
      term: mark.term,
      year: mark.year,
      value: mark.marks,
    }))
  )
}

/**
 * Deterministic subject → colour slot, so a subject keeps the same colour in
 * every chart on the page and across re-renders. Index-based assignment gave
 * Mathematics one colour in the class chart and another in the progress chart,
 * reshuffling whenever the selected student changed.
 *
 * Only `--chart-1..5` exist, so more than five subjects in one chart still
 * share colours — the legend disambiguates.
 */
function colourSlot(subject: string): number {
  // Hash across the full 32-bit range BEFORE reducing. Taking `% 5` inside the
  // loop with a multiplier of 31 degenerates, because 31 = 1 (mod 5) — the
  // whole thing collapses to sum(charCodes) % 5 and buckets most real subject
  // names onto the same two or three colours.
  let hash = 0
  for (let i = 0; i < subject.length; i++) {
    hash = (Math.imul(hash, 31) + subject.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 5) + 1
}

/**
 * Builds a chart config keyed by the SYNTHETIC series key.
 *
 * The key reaches `ChartStyle`'s `dangerouslySetInnerHTML` as `--color-${key}`,
 * so it must never carry user input — see the note on `pivot`. The subject name
 * is carried only in `label`, which renders as escaped text.
 */
export function buildSubjectChartConfig(
  series: SubjectSeries[]
): Record<string, { label: string; color: string }> {
  const config: Record<string, { label: string; color: string }> = {}
  for (const { key, subject } of series) {
    config[key] = { label: subject, color: `var(--chart-${colourSlot(subject)})` }
  }
  return config
}

export interface SchoolChartRow {
  subject: string
  average: number
  markCount: number
}

/** School endpoint is grouped by subject alone, so no pivot is needed. */
export function toSchoolSubjectRows(rows: SchoolSubjectAverage[]): SchoolChartRow[] {
  return rows
    .filter((row): row is SchoolSubjectAverage & { average: number } => row.average !== null)
    .map((row) => ({ subject: row.subject, average: row.average, markCount: row.markCount }))
}

/**
 * Renders an average for display. `null` becomes an em dash — a real average of
 * 0 is a genuinely different fact and still renders as "0".
 */
export function formatAverage(average: number | null): string {
  if (average === null) return "—"
  return String(average)
}

/**
 * Labels the two student counts so neither can be mistaken for the other.
 * Collapses to a single figure only when every enrolled student has marks.
 */
export function formatStudentCount(studentCount: number, scoredStudentCount: number): string {
  const noun = studentCount === 1 ? "student" : "students"
  if (studentCount === scoredStudentCount) return `${studentCount} ${noun}`
  return `${studentCount} ${noun} · ${scoredStudentCount} with marks`
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    return extractApiError(await response.json(), fallback)
  } catch {
    return fallback
  }
}

function toClassOptions(list: Array<{ id: number | string; name: string }>): ClassOption[] {
  return list
    .map((item) => {
      const id = normalizeClassId(item.id)
      return id === null ? null : { id, name: item.name }
    })
    .filter((item): item is ClassOption => item !== null)
}

/** `GET /api/teachers/me/classes` — role TEACHER. Returns a BARE ARRAY. */
export async function fetchTeacherClasses(): Promise<TeacherClass[]> {
  const response = await apiFetch("/api/teachers/me/classes")
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load your classes"))
  }
  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response from server")
  }
  return toClassOptions(data as TeacherClassResponse[])
}

/**
 * `GET /api/classes` — roles ADMINISTRATOR, PRINCIPAL.
 *
 * ⚠️ Returns `{ classes: [...] }`, an OBJECT — unlike the bare array from
 * `/api/teachers/me/classes`. Both existing consumers (`admin/classes`,
 * `principal/classes`) unwrap `data.classes`; treating the body as an array
 * throws on every real call.
 */
export async function fetchAllClasses(): Promise<ClassOption[]> {
  const response = await apiFetch("/api/classes")
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load classes"))
  }
  const data = await response.json()
  const list = (data as { classes?: unknown })?.classes
  if (!Array.isArray(list)) {
    throw new Error("Unexpected response from server")
  }
  return toClassOptions(list as Array<{ id: number | string; name: string }>)
}

/** `GET /api/analytics/class/:classId` — TEACHER (own), PRINCIPAL, ADMINISTRATOR. */
export async function fetchClassAnalytics(
  classId: number,
  filters: { year?: number | null; term?: number | null } = {}
): Promise<ClassAnalytics> {
  const query = buildAnalyticsQuery({ year: filters.year, term: filters.term })
  const response = await apiFetch(`/api/analytics/class/${classId}${query}`)
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load class analytics"))
  }
  return (await response.json()) as ClassAnalytics
}

/** `GET /api/analytics/school` — PRINCIPAL, ADMINISTRATOR. No `grade` param exists. */
export async function fetchSchoolAnalytics(
  filters: { classId?: number | null; year?: number | null } = {}
): Promise<SchoolAnalytics> {
  const query = buildAnalyticsQuery({ classId: filters.classId, year: filters.year })
  const response = await apiFetch(`/api/analytics/school${query}`)
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load school analytics"))
  }
  return (await response.json()) as SchoolAnalytics
}
