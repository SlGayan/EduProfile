/**
 * PDF report generation for the principal analytics page (Story 10.3).
 *
 * Split out of `lib/analytics.ts` on purpose: `analytics.ts` is fetchers plus
 * pure transforms with no browser-only dependency, and a dynamic
 * `import("jspdf")` in there would couple every consumer of those helpers to the
 * PDF stack.
 *
 * Four contract facts drive this file:
 *
 *  1. `classBreakdown[].average` is `number | null`. `null` means "no marks
 *     recorded in this scope" — NOT zero. In a document handed to a school
 *     board, a zero is a permanent printed claim that a class scored nothing.
 *     Every average goes through `formatAverage`, which renders null as an
 *     em dash and keeps a genuine 0 as "0".
 *  2. `totals` is the school-level truth and is printed verbatim. Summing
 *     `classBreakdown` overshoots: `TermMark` has no `classId`, so a student
 *     enrolled in two classes is credited to both rows but counted once
 *     school-wide. The document now says so out loud — see `SUMMARY_NOTE`.
 *  3. `Class.name` and `Subject.name` come from a teacher-uploaded CSV
 *     validated only as `z.string().min(1)` — no character restriction at all.
 *     They reach `doc.save()` as a filename, so the filename is sanitised
 *     rather than trusted. Same untrusted strings that produced the stored XSS
 *     found in Story 10.2's review; different sink.
 *  4. jsPDF's standard fonts are `/WinAnsiEncoding`. The em dash, curly quotes
 *     and accented Latin all render correctly; anything genuinely outside
 *     WinAnsi (Sinhala, Tamil, CJK) does not — see `hasUnsupportedGlyphs`. The
 *     export refuses to ship a silently garbled name.
 */
import { formatAverage, type SchoolAnalytics } from "./analytics"

/** The scope the principal page currently has selected. */
export interface ReportScope {
  className?: string | null
  /**
   * `Class.name` has NO unique constraint (unlike `Subject.name`), so two
   * classes genuinely can share a name. Without the id, two different cohorts
   * export to the same filename and the browser silently suffixes "(1)".
   */
  classId?: number | null
  year?: number | null
}

export interface ReportTable {
  head: string[]
  body: string[][]
}

/**
 * A fully-resolved, serialisable description of the document. Everything is
 * already a display string, so the PDF layer never re-derives a number and can
 * never disagree with what the page shows.
 */
export interface ReportModel {
  title: string
  scopeLine: string
  generatedAt: string
  /** Label/value pairs taken straight from the response `totals` block. */
  summary: string[][]
  /** Why the summary does not reconcile with the class table. Always present. */
  summaryNote: string
  /** Present only when marks exist for students in no class. */
  unassignedNote: string | null
  subjects: ReportTable
  classes: ReportTable
}

export const REPORT_TITLE = "EduProfile — Academic Performance Report"

/**
 * The page carries this explanation on screen; without it in the PDF a reader
 * sees totals that do not add up to the table beneath them and has no way to
 * interpret the gap. The PDF, not the page, is what leaves the building.
 */
export const SUMMARY_NOTE =
  "School totals are counted school-wide and are not the sum of the class rows below: " +
  "a student enrolled in two classes is counted once here but credited to both classes. " +
  "A class with no marks recorded shows a dash, which is different from an average of zero."

/** Keeps the filename comfortably inside every filesystem's per-segment limit. */
const MAX_CLASS_SEGMENT = 60

/** Used when a class name sanitises away entirely, and for the all-classes scope. */
const FALLBACK_CLASS_SEGMENT = "school"

/**
 * Codepoints above U+00FF that WinAnsiEncoding still represents (the CP1252
 * 0x80–0x9F block — em dash, curly quotes, ellipsis, bullet and friends).
 * Everything else above U+00FF is unsupported.
 */
const WINANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

/**
 * True when a string contains a character jsPDF's standard fonts cannot render.
 *
 * jsPDF registers Helvetica/Times/Courier with `/WinAnsiEncoding` and no
 * embedded encoding metadata, so a codepoint outside WinAnsi is written as its
 * raw bytes with no BOM. Verified at byte level against jspdf 4.2.1:
 * `A—B` → `41 97 42` (correct — 0x97 IS em dash in WinAnsi), but
 * `X数Y` → `58 65 70 59` and Sinhala `ග` → `0d 9c`, both of which render as two
 * wrong glyphs.
 *
 * So the em dash this report depends on is safe; only genuinely non-WinAnsi
 * scripts are affected, and the caller warns about those rather than shipping
 * them silently.
 */
export function hasUnsupportedGlyphs(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code >= 0x20 && code <= 0x7e) continue
    if (code >= 0xa0 && code <= 0xff) continue
    if (WINANSI_HIGH.has(code)) continue
    return true
  }
  return false
}

/**
 * Every class or subject name in the report that will not render correctly.
 *
 * Returned so the caller can name the affected entries to the user, rather than
 * handing a school board a document with silently garbled text in it.
 */
export function findUnsupportedNames(
  analytics: SchoolAnalytics,
  scope: ReportScope = {}
): string[] {
  const names = [
    ...(scope.className ? [scope.className] : []),
    ...analytics.subjectAverages.map((row) => row.subject),
    ...analytics.classBreakdown.map((row) => row.className),
  ]
  return [...new Set(names.filter(hasUnsupportedGlyphs))]
}

/**
 * Reduces arbitrary text to a filename-safe segment.
 *
 * Allow-list, not deny-list: everything outside `[a-z0-9]` collapses to a single
 * dash, so `/`, `\`, `:`, `..`, NUL, CR/LF and every unicode codepoint are
 * handled by construction rather than by enumerating what to strip. Truncation
 * happens after collapsing and re-trims, so a cut that lands on a separator
 * cannot leave a trailing dash.
 */
function slugify(raw: string, maxLength: number): string {
  const collapsed = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const trimmed = collapsed.replace(/^-+|-+$/g, "")
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength).replace(/-+$/g, "")
}

/**
 * Builds the extension-less basename for the exported file (AC2).
 *
 * `{ className: "Grade 10-A", classId: 3, year: 2026 }` → `grade-10-a-3_2026`
 * `{ className: null, year: null }`                     → `school_all-years`
 * `{ className: "../../etc/passwd", classId: 7 }`       → `etc-passwd-7_all-years`
 *
 * The `classId` suffix exists because `Class.name` is not unique — without it,
 * two cohorts both called "Grade 10-A" produce the same file and the browser
 * silently suffixes the second. The result always matches
 * `/^[a-z0-9][a-z0-9_-]*$/`.
 */
export function buildReportFilename(scope: ReportScope): string {
  const base = scope.className
    ? slugify(scope.className, MAX_CLASS_SEGMENT) || FALLBACK_CLASS_SEGMENT
    : FALLBACK_CLASS_SEGMENT
  const classSegment =
    scope.className && scope.classId != null ? `${base}-${scope.classId}` : base
  const yearSegment = scope.year == null ? "all-years" : String(scope.year)
  return `${classSegment}_${yearSegment}`
}

/**
 * Human-readable description of what the numbers below are scoped to.
 *
 * Carries the class id so a PRINTED copy is self-identifying: two reports for
 * same-named classes are otherwise indistinguishable on paper.
 */
function buildScopeLine(scope: ReportScope): string {
  const className = scope.className
    ? scope.classId != null
      ? `${scope.className} (#${scope.classId})`
      : scope.className
    : "All classes"
  const year = scope.year == null ? "All years" : String(scope.year)
  return `Class: ${className}  ·  Year: ${year}`
}

/**
 * Fixed-format local timestamp with an explicit UTC offset.
 *
 * `toLocaleString()` renders `8/12/2026` or `12/08/2026` depending on the
 * exporting browser and carries no timezone at all, which is intolerable on a
 * permanently filed document. This codebase already pins locale deliberately
 * elsewhere (`localeCompare(a, b, "en")`) for exactly this hazard.
 */
export function formatGeneratedAt(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? "-" : "+"
  const abs = Math.abs(offsetMinutes)
  const offset = `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  return (
    `Generated ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())} (${offset})`
  )
}

/**
 * Turns an analytics response plus the selected scope into the printable model.
 *
 * Pure: `now` is injected so the entire document, timestamp included, is
 * assertable without touching jsPDF.
 */
export function buildReportModel(
  analytics: SchoolAnalytics,
  scope: ReportScope,
  now: Date = new Date()
): ReportModel {
  const { totals } = analytics

  // Read verbatim. Summing `classBreakdown` double-counts dual-enrolled students.
  const summary: string[][] = [
    ["Marks in scope", String(totals.markCount)],
    ["Students with marks", String(totals.studentCount)],
  ]

  const unassignedNote =
    totals.unassignedMarkCount > 0
      ? `${totals.unassignedMarkCount} mark${totals.unassignedMarkCount === 1 ? "" : "s"} ` +
        `belong to students in no class. They are counted in the totals above but appear in ` +
        `no class row below — normal straight after a bulk import, before class assignment.`
      : null

  const subjects: ReportTable = {
    head: ["Subject", "Average", "Marks"],
    body: analytics.subjectAverages.map((row) => [
      row.subject,
      formatAverage(row.average),
      String(row.markCount),
    ]),
  }

  // Enrolled and scored are two different facts and get two headed columns, so
  // neither can be read as the other. `formatStudentCount`'s single composite
  // string is right for a dense UI cell, wrong for a report column a reader
  // scans down.
  const classes: ReportTable = {
    head: ["Class", "Average", "Students enrolled", "With marks", "Marks"],
    body: analytics.classBreakdown.map((row) => [
      row.className,
      formatAverage(row.average),
      String(row.studentCount),
      String(row.scoredStudentCount),
      String(row.markCount),
    ]),
  }

  return {
    title: REPORT_TITLE,
    scopeLine: buildScopeLine(scope),
    generatedAt: formatGeneratedAt(now),
    summary,
    summaryNote: SUMMARY_NOTE,
    unassignedNote,
    subjects,
    classes,
  }
}

/** jsPDF's own typings do not expose the property the autotable plugin sets. */
interface WithLastAutoTable {
  lastAutoTable?: { finalY: number }
}

/**
 * Renders the model and triggers the download (AC1, AC2).
 *
 * `jspdf` and `jspdf-autotable` are loaded with a dynamic import INSIDE this
 * function, never at module scope. jsPDF touches browser globals and the
 * principal page is server-prerendered even as a `"use client"` component, and
 * a static import would pull the whole PDF stack into the initial bundle for a
 * button most page views never press.
 *
 * Note the call shape: `autoTable(doc, options)`. jspdf-autotable v5 self-applies
 * to the jsPDF prototype only via `window.jsPDF` / `window.jspdf`, which a
 * bundled app never sets, so the v3-era `doc.autoTable(options)` idiom found in
 * most tutorials is unavailable here.
 */
export async function exportReportPdf(model: ReportModel, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const { autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF()
  const marginLeft = 14
  const textWidth = 180
  const pageBottom = 277 // A4 portrait is 297mm; keep a 20mm foot margin.
  let cursorY = 20

  /** Wraps and draws a paragraph, breaking the page rather than running off it. */
  const drawParagraph = (text: string, size: number) => {
    doc.setFontSize(size)
    for (const line of doc.splitTextToSize(text, textWidth) as string[]) {
      if (cursorY > pageBottom) {
        doc.addPage()
        cursorY = 20
      }
      doc.text(line, marginLeft, cursorY)
      cursorY += 4
    }
    doc.setFontSize(10)
  }

  doc.setFontSize(16)
  doc.text(model.title, marginLeft, cursorY)

  cursorY += 8
  doc.setFontSize(10)
  doc.text(model.scopeLine, marginLeft, cursorY)

  cursorY += 5
  doc.text(model.generatedAt, marginLeft, cursorY)

  cursorY += 6
  autoTable(doc, {
    startY: cursorY,
    head: [["Summary", ""]],
    body: model.summary,
    theme: "plain",
  })
  cursorY = (doc as unknown as WithLastAutoTable).lastAutoTable?.finalY ?? cursorY

  cursorY += 6
  drawParagraph(model.summaryNote, 9)

  if (model.unassignedNote) {
    cursorY += 4
    drawParagraph(model.unassignedNote, 9)
  }

  autoTable(doc, {
    startY: cursorY + 8,
    head: [model.subjects.head],
    body: model.subjects.body,
  })
  cursorY = (doc as unknown as WithLastAutoTable).lastAutoTable?.finalY ?? cursorY

  autoTable(doc, {
    startY: cursorY + 8,
    head: [model.classes.head],
    body: model.classes.body,
  })

  doc.save(`${filename}.pdf`)
}
