import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TeacherAnalyticsPage from "@/app/(main)/teacher/analytics/page"

/**
 * Story 10.2, AC1 and AC3.
 *
 * Chart internals are not asserted: `ResponsiveContainer` measures 0x0 in
 * jsdom, so a recharts assertion would pass or fail for the wrong reason.
 * These cover data flow, request shape and the empty/error ladder.
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
      <TeacherAnalyticsPage />
    </QueryClientProvider>,
  )
}

/** `/teachers/me/classes` returns ids as STRINGS — the mismatch this normalises. */
const teacherClasses = [{ id: "3", name: "Grade 10-A" }]

const populated = {
  classId: 3,
  className: "Grade 10-A",
  scope: { year: null, term: null },
  subjectAverages: [
    { subjectId: 1, subject: "Mathematics", term: 1, year: 2026, average: 72.4, markCount: 18 },
  ],
  studentProgress: [
    {
      studentId: 5,
      studentName: "Nimal Perera",
      indexNumber: "S-001",
      marks: [{ subject: "Mathematics", term: 1, year: 2026, marks: 81 }],
    },
  ],
}

function mockApi(analytics: unknown, classes: unknown = teacherClasses, ok = true, status = 200) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/teachers/me/classes")) {
      return Promise.resolve(jsonResponse(classes))
    }
    return Promise.resolve(jsonResponse(analytics, ok, status))
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("TeacherAnalyticsPage — teacher with no classes", () => {
  it("explains the situation instead of rendering a broken selector", async () => {
    mockApi(null, [])
    renderPage()

    expect(await screen.findByText("No classes assigned")).toBeInTheDocument()
    expect(screen.getByText(/aren't assigned to any class yet/i)).toBeInTheDocument()
  })

  it("does not request analytics when there is no class to request", async () => {
    mockApi(null, [])
    renderPage()

    await screen.findByText("No classes assigned")
    const calls = apiFetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((url) => url.includes("/api/analytics/"))).toBe(false)
  })
})

describe("TeacherAnalyticsPage — request shape", () => {
  it("normalises the string class id and requests it with no query params", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("Individual progress")).toBeInTheDocument()
    // id "3" (string) must become /class/3 — and .strict() means no stray params.
    expect(apiFetchMock).toHaveBeenCalledWith("/api/analytics/class/3")
  })

  it("never sends an empty or unknown query param", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("Individual progress")
    const analyticsCalls = apiFetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((url) => url.includes("/api/analytics/"))
    for (const url of analyticsCalls) {
      expect(url).not.toMatch(/=(&|$)/)
      expect(url).not.toContain("grade")
    }
  })
})

describe("TeacherAnalyticsPage — empty state (AC3)", () => {
  const emptyScope = {
    classId: 3,
    className: "Grade 10-A",
    scope: { year: null, term: null },
    subjectAverages: [],
    studentProgress: [],
  }

  it("renders the friendly empty block when the class has no marks in scope", async () => {
    mockApi(emptyScope)
    renderPage()

    expect(await screen.findByTestId("analytics-empty-state")).toBeInTheDocument()
    expect(screen.getByText("No marks recorded yet")).toBeInTheDocument()
  })

  it("does not render the chart cards when the scope is empty", async () => {
    mockApi(emptyScope)
    renderPage()

    await screen.findByTestId("analytics-empty-state")
    expect(screen.queryByText("Class averages by subject")).not.toBeInTheDocument()
    expect(screen.queryByText("Individual progress")).not.toBeInTheDocument()
  })
})

describe("TeacherAnalyticsPage — null averages are not charted as zero", () => {
  it("says nothing is chartable when every subject average is null", async () => {
    mockApi({
      ...populated,
      subjectAverages: [
        { subjectId: 1, subject: "Mathematics", term: 1, year: 2026, average: null, markCount: 0 },
      ],
    })
    renderPage()

    // studentProgress is non-empty so the page renders — but the chart must
    // report nothing to plot rather than drawing a bar at zero.
    expect(
      await screen.findByText("No averages to chart for the selected scope."),
    ).toBeInTheDocument()
  })
})

describe("TeacherAnalyticsPage — populated view", () => {
  it("names the class and offers the student selector", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("Individual progress")).toBeInTheDocument()
    // "Grade 10-A" appears in both the class selector and the chart caption.
    expect(screen.getAllByText(/Grade 10-A/).length).toBeGreaterThan(0)
    expect(screen.getByText(/1 mark recorded for Nimal Perera/)).toBeInTheDocument()
    expect(screen.getByText("Class averages by subject")).toBeInTheDocument()
  })
})

describe("TeacherAnalyticsPage — error handling", () => {
  it("surfaces a 403 from the API rather than showing an empty page", async () => {
    mockApi(
      { error: "You do not have permission to view analytics for this class" },
      teacherClasses,
      false,
      403,
    )
    renderPage()

    expect(
      await screen.findByText("You do not have permission to view analytics for this class"),
    ).toBeInTheDocument()
    expect(screen.queryByTestId("analytics-empty-state")).not.toBeInTheDocument()
  })

  it("surfaces a failure to load the class list", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ error: "Teacher profile not found" }, false, 403))
    renderPage()

    expect(await screen.findByText("Teacher profile not found")).toBeInTheDocument()
  })
})
