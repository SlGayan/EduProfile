import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PrincipalDashboardPage from "@/app/(main)/principal/dashboard/page"

/**
 * Story 10.4, Task 2 (AC1).
 *
 * School Average must be a markCount-weighted mean of subjectAverages,
 * skipping null rows — never coerced to 0 (Read This First #2).
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
      <PrincipalDashboardPage />
    </QueryClientProvider>,
  )
}

function mockApi(analytics: unknown, ok = true, status = 200) {
  apiFetchMock.mockImplementation(() => Promise.resolve(jsonResponse(analytics, ok, status)))
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

const populated = {
  scope: { classId: null, year: null },
  totals: { markCount: 240, studentCount: 30, unassignedMarkCount: 0 },
  subjectAverages: [
    { subjectId: 1, subject: "Mathematics", average: 70, markCount: 100 },
    { subjectId: 2, subject: "Science", average: 60, markCount: 140 },
  ],
  classBreakdown: [
    { classId: 1, className: "Grade 10-A", average: 72.4, studentCount: 30, scoredStudentCount: 24, markCount: 120 },
  ],
}

describe("PrincipalDashboardPage — stat cards (populated)", () => {
  it("renders Total Students and Marks Recorded from totals", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("30")).toBeInTheDocument()
    expect(screen.getByText("240")).toBeInTheDocument()
  })

  it("computes a markCount-weighted School Average, not a plain mean", async () => {
    mockApi(populated)
    renderPage()

    // weighted: (70*100 + 60*140) / 240 = 64.2 -> rounds to 64.2
    expect(await screen.findByText("64.2")).toBeInTheDocument()
  })

  it("requests the school analytics endpoint with no query params", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("30")
    expect(apiFetchMock).toHaveBeenCalledWith("/api/analytics/school")
  })

  it("drops the old Total Teachers and Academic Reports cards", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("30")
    expect(screen.queryByText("Total Teachers")).not.toBeInTheDocument()
    expect(screen.queryByText("Academic Reports")).not.toBeInTheDocument()
  })
})

describe("PrincipalDashboardPage — null averages excluded from the weighted mean", () => {
  it("skips a null subject average rather than coercing it to 0", async () => {
    mockApi({
      ...populated,
      subjectAverages: [
        { subjectId: 1, subject: "Mathematics", average: 70, markCount: 100 },
        { subjectId: 2, subject: "Science", average: null, markCount: 0 },
      ],
    })
    renderPage()

    // Only Mathematics counts: weighted average = 70.
    expect(await screen.findByText("70")).toBeInTheDocument()
  })

  it("excludes a null-average row from the weighted denominator even if its markCount is nonzero", async () => {
    mockApi({
      ...populated,
      subjectAverages: [
        { subjectId: 1, subject: "Mathematics", average: 70, markCount: 100 },
        // Defensively malformed (average null with markCount > 0 should not
        // happen per the API contract) — still must not drag the average down.
        { subjectId: 2, subject: "Science", average: null, markCount: 50 },
      ],
    })
    renderPage()

    expect(await screen.findByText("70")).toBeInTheDocument()
  })

  it("renders — when every subject average is null", async () => {
    mockApi({
      ...populated,
      subjectAverages: [{ subjectId: 1, subject: "Mathematics", average: null, markCount: 0 }],
    })
    renderPage()

    expect(await screen.findByText("—")).toBeInTheDocument()
  })
})

describe("PrincipalDashboardPage — unassigned marks note", () => {
  it("shows the unassigned-marks note only when unassignedMarkCount > 0", async () => {
    mockApi({
      ...populated,
      totals: { ...populated.totals, unassignedMarkCount: 5 },
    })
    renderPage()

    expect(await screen.findByText(/5.*not currently in any class/i)).toBeInTheDocument()
  })

  it("does not show the note when unassignedMarkCount is 0", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("30")
    expect(screen.queryByText(/not currently in any class/i)).not.toBeInTheDocument()
  })
})

describe("PrincipalDashboardPage — loading and error states", () => {
  it("shows skeleton stat cards while loading", () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getAllByTestId("stat-card-skeleton")).toHaveLength(3)
  })

  it("shows a destructive alert on error", async () => {
    mockApi(null, false, 403)
    renderPage()

    expect(await screen.findByText("Failed to load school analytics")).toBeInTheDocument()
  })
})

describe("PrincipalDashboardPage — untouched sections", () => {
  it("still renders Recent Activities and Quick Actions as static content", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("30")
    expect(screen.getByText("Recent Activities")).toBeInTheDocument()
    expect(screen.getByText("Quick Actions")).toBeInTheDocument()
    expect(screen.getByText("New academic year started")).toBeInTheDocument()
  })
})
