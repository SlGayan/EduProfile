import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
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

  it("never sends a grade param — no grade column exists", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("Grade 10-A")
    const calls = apiFetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((url) => url.includes("grade"))).toBe(false)
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
