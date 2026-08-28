import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PrincipalAnalyticsPage from "@/app/(main)/principal/analytics/page"

/**
 * Story 10.2, AC2 and AC3.
 *
 * Assertions target the table, totals and request shape — never the recharts
 * SVG: `ResponsiveContainer` measures 0x0 in jsdom, so a chart assertion would
 * pass or fail for the wrong reason.
 */

const apiFetchMock = vi.fn()
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

/**
 * Story 10.3. jsPDF is mocked at the MODULE boundary rather than mocking
 * `lib/report-export`, so the real `buildReportModel` / `buildReportFilename` /
 * `exportReportPdf` chain runs and the page-to-PDF wiring is genuinely
 * exercised. Only the final byte-producing layer is faked — jsdom cannot render
 * a PDF, so an assertion on output bytes would pass or fail for the wrong
 * reason.
 */
const pdfSave = vi.fn()
const pdfText = vi.fn()
const autoTableMock = vi.fn()
const toastWarning = vi.fn()
const toastError = vi.fn()

vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock("jspdf", () => ({
  jsPDF: class {
    setFontSize = vi.fn()
    addPage = vi.fn()
    text = (...args: unknown[]) => pdfText(...args)
    splitTextToSize = (text: string) => [text]
    save = (...args: unknown[]) => pdfSave(...args)
  },
}))

/**
 * The double MUST set `lastAutoTable`, exactly as the real plugin does
 * (`DocHandler.getLastAutoTable` reads `jsPDFDocument.lastAutoTable`). Without
 * it, `cursorY` silently falls back on every call and every line of vertical
 * layout arithmetic in `exportReportPdf` becomes unassertable — deleting the
 * cursor advances would leave all three tables overprinted and the suite green.
 */
vi.mock("jspdf-autotable", () => ({
  autoTable: (doc: { lastAutoTable?: { finalY: number } }, options: { startY?: number }) => {
    autoTableMock(doc, options)
    doc.lastAutoTable = { finalY: (options.startY ?? 0) + 30 }
  },
}))

/** Radix Select drives pointer APIs jsdom does not implement. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

/** Every string drawn with `doc.text`, i.e. everything outside the tables. */
function pdfTextLines(): string[] {
  return pdfText.mock.calls.map((call) => String(call[0]))
}

function pdfHeadCells(): string[] {
  return autoTableMock.mock.calls.flatMap((call) => {
    const options = call[1] as { head?: string[][] }
    return (options.head ?? []).flat()
  })
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PrincipalAnalyticsPage />
    </QueryClientProvider>,
  )
}

/**
 * ⚠️ `GET /api/classes` returns `{ classes: [...] }` — an OBJECT, not a bare
 * array like `/api/teachers/me/classes`. Mocking a bare array here once let the
 * whole suite go green while the real class filter was permanently broken.
 * Keep the envelope.
 */
function mockApi(
  analytics: unknown,
  classes: Array<{ id: number; name: string }> = [],
  ok = true,
  status = 200,
) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/classes")) return Promise.resolve(jsonResponse({ classes }))
    return Promise.resolve(jsonResponse(analytics, ok, status))
  })
}

const populated = {
  scope: { classId: null, year: null },
  totals: { markCount: 240, studentCount: 30, unassignedMarkCount: 0 },
  subjectAverages: [{ subjectId: 1, subject: "Mathematics", average: 68.9, markCount: 240 }],
  classBreakdown: [
    {
      classId: 1,
      className: "Grade 10-A",
      average: 72.4,
      studentCount: 30,
      scoredStudentCount: 12,
      markCount: 120,
    },
    {
      classId: 2,
      className: "Grade 10-C",
      average: null,
      studentCount: 28,
      scoredStudentCount: 0,
      markCount: 0,
    },
  ],
}

beforeEach(() => {
  apiFetchMock.mockReset()
  pdfSave.mockReset()
  pdfText.mockReset()
  autoTableMock.mockReset()
  toastWarning.mockReset()
  toastError.mockReset()
})

describe("PrincipalAnalyticsPage — a class with no marks", () => {
  it("renders a null average as an em dash, NEVER as 0", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("Grade 10-C")).toBeInTheDocument()
    const row = screen.getByText("Grade 10-C").closest("tr")!
    expect(row).toHaveTextContent("—")
    expect(row.querySelector("td:nth-child(2)")).not.toHaveTextContent(/^0$/)
  })

  it("still lists the zero-mark class rather than hiding it", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("Grade 10-C")).toBeInTheDocument()
    expect(screen.getByText("Grade 10-A")).toBeInTheDocument()
  })
})

describe("PrincipalAnalyticsPage — enrolled vs scored students", () => {
  it("shows both counts when they differ", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("30 students · 12 with marks")).toBeInTheDocument()
  })

  it("shows the zero-mark class as 28 enrolled with 0 scored", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("28 students · 0 with marks")).toBeInTheDocument()
  })
})

describe("PrincipalAnalyticsPage — school totals", () => {
  it("renders totals from `totals`, not by summing the breakdown", async () => {
    mockApi(populated)
    renderPage()

    // Breakdown sums to 120 marks; totals says 240. The page must show 240.
    expect(await screen.findByText("240")).toBeInTheDocument()
    expect(screen.getByText("marks in scope")).toBeInTheDocument()
  })

  it("surfaces unassigned marks when there are any", async () => {
    mockApi({ ...populated, totals: { markCount: 240, studentCount: 30, unassignedMarkCount: 7 } })
    renderPage()

    expect(await screen.findByText(/7 marks belong to students in no class/i)).toBeInTheDocument()
  })

  it("says nothing about unassigned marks when there are none", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    expect(screen.queryByText(/belong to students in no class/i)).not.toBeInTheDocument()
  })
})

describe("PrincipalAnalyticsPage — class filter (AC2 per-class scoping)", () => {
  it("populates the filter from the { classes: [...] } envelope the API really sends", async () => {
    mockApi(populated, [
      { id: 1, name: "Grade 10-A" },
      { id: 2, name: "Grade 10-C" },
    ])
    renderPage()

    await screen.findByText("30 students · 12 with marks")
    expect(screen.queryByTestId("class-filter-error")).not.toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith("/api/classes")
  })

  it("surfaces an error instead of silently offering an empty filter", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      // A bare array is the WRONG shape — the client must reject it loudly.
      if (path.startsWith("/api/classes")) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse(populated))
    })
    renderPage()

    expect(await screen.findByTestId("class-filter-error")).toBeInTheDocument()
  })
})

describe("PrincipalAnalyticsPage — empty state (AC3)", () => {
  it("renders the friendly empty block when nothing is in scope", async () => {
    mockApi({
      scope: { classId: null, year: null },
      totals: { markCount: 0, studentCount: 0, unassignedMarkCount: 0 },
      subjectAverages: [],
      classBreakdown: [],
    })
    renderPage()

    expect(await screen.findByTestId("analytics-empty-state")).toBeInTheDocument()
    expect(screen.getByText("No marks recorded yet")).toBeInTheDocument()
  })

  it("explains an empty breakdown rather than showing bare headers", async () => {
    mockApi({ ...populated, classBreakdown: [] })
    renderPage()

    expect(await screen.findByText(/No classes exist yet/i)).toBeInTheDocument()
  })
})

describe("PrincipalAnalyticsPage — request shape", () => {
  it("sends no query params at all when the scope is unfiltered", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    // The API schema is .strict(); a stray or empty param is a 400.
    expect(apiFetchMock).toHaveBeenCalledWith("/api/analytics/school")
  })

  // Story 13.1 gave Class a real `gradeLevel`, so a grade filter is now
  // feasible — but it was deliberately left out of scope, and the analytics
  // query schema is still .strict(), so a grade param would be a 400.
  it("never sends a grade param — the endpoint accepts none", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    const calls = apiFetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((url) => url.includes("grade"))).toBe(false)
  })
})

describe("PrincipalAnalyticsPage — PDF export (Story 10.3, AC1 & AC2)", () => {
  it("saves a PDF named for the unfiltered scope", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    expect(pdfSave).toHaveBeenCalledWith("school_all-years.pdf")
  })

  it("names the file after the class and year actually selected, with the class id", async () => {
    const user = userEvent.setup()
    mockApi(populated, [
      { id: 1, name: "Grade 10-A" },
      { id: 2, name: "Grade 10-C" },
    ])
    renderPage()

    await screen.findByText("30 students · 12 with marks")

    await user.click(screen.getByLabelText("Class"))
    await user.click(await screen.findByRole("option", { name: "Grade 10-A" }))
    await user.click(screen.getByLabelText("Year"))
    await user.click(await screen.findByRole("option", { name: "2026" }))

    await user.click(screen.getByTestId("export-report"))

    // The id is what keeps two same-named cohorts from colliding on disk.
    expect(pdfSave).toHaveBeenCalledWith("grade-10-a-1_2026.pdf")
  })

  it("scopes the export to the RESOLVED class, not the raw held id", async () => {
    const user = userEvent.setup()
    // The held id (2) is NOT in the class list, so it must never reach the
    // document. Without resolution the export would claim a scope the page is
    // not displaying — the whole point of `resolvedClassId`.
    mockApi(populated, [{ id: 1, name: "Grade 10-A" }])
    renderPage()

    await screen.findByText("30 students · 12 with marks")
    await user.click(screen.getByTestId("export-report"))

    // Resolution falls back to ALL, so no class name and no id in the filename.
    expect(pdfSave).toHaveBeenCalledWith("school_all-years.pdf")
    expect(pdfTextLines().join(" ")).toContain("All classes")
  })

  it("writes the title, scope line and generated-at stamp into the document", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    const lines = pdfTextLines()
    // AC1: "that scope's summary data" reaches the reader ONLY via the scope
    // line. Asserting the model alone let both of these be deleted silently.
    expect(lines).toContain("EduProfile — Academic Performance Report")
    expect(lines.join(" ")).toMatch(/Class: All classes/)
    expect(lines.join(" ")).toMatch(/Generated \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)/)
  })

  it("prints the explanation of why totals do not sum to the class rows", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    expect(pdfTextLines().join(" ")).toMatch(/not the sum of the class rows/i)
  })

  it("prints the unassigned-marks note into the document when there are any", async () => {
    const user = userEvent.setup()
    mockApi({ ...populated, totals: { markCount: 240, studentCount: 30, unassignedMarkCount: 7 } })
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    expect(pdfTextLines().join(" ")).toMatch(/7 marks belong to students in no class/i)
  })

  it("lays the three tables out down the page instead of overprinting them", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    const startYs = autoTableMock.mock.calls.map((c) => (c[1] as { startY: number }).startY)
    expect(startYs).toHaveLength(3)
    // Strictly increasing: each table starts below the one before it.
    expect(startYs[1]).toBeGreaterThan(startYs[0])
    expect(startYs[2]).toBeGreaterThan(startYs[1])
  })

  it("warns which names the PDF cannot render, rather than garbling them silently", async () => {
    const user = userEvent.setup()
    mockApi({
      ...populated,
      subjectAverages: [{ subjectId: 1, subject: "ගණිතය", average: 68.9, markCount: 240 }],
    })
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    expect(pdfSave).toHaveBeenCalled() // the export still succeeds
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining("ගණිතය"))
  })

  it("stays silent when every name is renderable", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    expect(toastWarning).not.toHaveBeenCalled()
  })

  it("explains in visible text why Export is unavailable", async () => {
    mockApi({
      scope: { classId: null, year: null },
      totals: { markCount: 0, studentCount: 0, unassignedMarkCount: 0 },
      subjectAverages: [],
      classBreakdown: [],
    })
    renderPage()

    await screen.findByTestId("analytics-empty-state")
    // A `title` tooltip cannot work here: shadcn's Button sets
    // `disabled:pointer-events-none`, so hover never fires.
    const reason = screen.getByTestId("export-blocked-reason")
    expect(reason).toBeVisible()
    expect(reason).toHaveTextContent(/no marks are recorded/i)
    expect(screen.getByTestId("export-report")).toHaveAttribute(
      "aria-describedby",
      "export-blocked-reason"
    )
  })

  it("keeps the button's accessible name equal to its visible label", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    // WCAG 2.5.3: an aria-label would replace "Export PDF" and would mutate
    // with query state, leaving the control without a stable identity.
    const button = screen.getByTestId("export-report")
    expect(button).not.toHaveAttribute("aria-label")
    expect(button).toHaveAccessibleName("Export PDF")
  })

  it("exports the totals block, never the sum of the class rows", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    // Targets the SUMMARY table specifically. Asserting "240 appears somewhere
    // in the document" passes for the wrong reason: `subjectAverages[0]`
    // carries markCount 240 too, so it survives even when the summary is
    // wrongly derived by summing the class rows. Verified by mutation.
    const summary = autoTableMock.mock.calls.find(
      (call) => (call[1] as { head?: string[][] }).head?.[0]?.[0] === "Summary"
    )
    expect(summary).toBeDefined()
    const summaryBody = (summary![1] as { body: string[][] }).body

    // The class rows sum to 120 marks / 58 students; `totals` says 240 / 30.
    expect(summaryBody).toContainEqual(["Marks in scope", "240"])
    expect(summaryBody).toContainEqual(["Students with marks", "30"])
  })

  it("writes a null class average into the PDF as an em dash, never 0", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-C")
    await user.click(screen.getByTestId("export-report"))

    const classRow = autoTableMock.mock.calls
      .flatMap((call) => ((call[1] as { body?: string[][] }).body ?? []))
      .find((row) => row[0] === "Grade 10-C")

    expect(classRow).toBeDefined()
    expect(classRow![1]).toBe("—")
    expect(classRow![1]).not.toBe("0")
  })

  it("gives enrolled and scored students their own PDF columns", async () => {
    const user = userEvent.setup()
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    await user.click(screen.getByTestId("export-report"))

    const heads = pdfHeadCells()
    expect(heads).toContain("Students enrolled")
    expect(heads).toContain("With marks")

    const classRow = autoTableMock.mock.calls
      .flatMap((call) => ((call[1] as { body?: string[][] }).body ?? []))
      .find((row) => row[0] === "Grade 10-A")
    expect(classRow).toEqual(["Grade 10-A", "72.4", "30", "12", "120"])
  })

  it("disables Export when the scope has no marks", async () => {
    mockApi({
      scope: { classId: null, year: null },
      totals: { markCount: 0, studentCount: 0, unassignedMarkCount: 0 },
      subjectAverages: [],
      classBreakdown: [],
    })
    renderPage()

    await screen.findByTestId("analytics-empty-state")
    expect(screen.getByTestId("export-report")).toBeDisabled()
  })

  it("disables Export when analytics failed to load", async () => {
    mockApi({ error: "Insufficient permissions" }, [], false, 403)
    renderPage()

    await screen.findByText("Insufficient permissions")
    expect(screen.getByTestId("export-report")).toBeDisabled()
  })
})

describe("PrincipalAnalyticsPage — error handling", () => {
  it("surfaces the API's message instead of an empty page", async () => {
    mockApi({ error: "Insufficient permissions" }, [], false, 403)
    renderPage()

    expect(await screen.findByText("Insufficient permissions")).toBeInTheDocument()
    expect(screen.queryByTestId("analytics-empty-state")).not.toBeInTheDocument()
  })
})
