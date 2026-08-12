import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TeacherDashboardPage from "@/app/(main)/teacher/dashboard/page"

/**
 * Story 10.4, Task 1 (AC1).
 *
 * `studentProgress` is scored students, not enrollment (Read This First #1) —
 * the card must say "with marks recorded", never "enrolled".
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
      <TeacherDashboardPage />
    </QueryClientProvider>,
  )
}

const oneClass = [{ id: "3", name: "Grade 10-A" }]
const twoClasses = [
  { id: "3", name: "Grade 10-A" },
  { id: "4", name: "Grade 10-B" },
]

const classAnalytics = {
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
    {
      studentId: 6,
      studentName: "Kamal Silva",
      indexNumber: "S-002",
      marks: [{ subject: "Mathematics", term: 1, year: 2026, marks: 65 }],
    },
  ],
}

function mockApi(
  classes: unknown,
  analytics: unknown,
  classesOk = true,
  classesStatus = 200,
  analyticsOk = true,
  analyticsStatus = 200,
) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/teachers/me/classes")) {
      return Promise.resolve(jsonResponse(classes, classesOk, classesStatus))
    }
    return Promise.resolve(jsonResponse(analytics, analyticsOk, analyticsStatus))
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("TeacherDashboardPage — Your Class card (populated)", () => {
  it("shows the primary class name and the scored-student count", async () => {
    mockApi(oneClass, classAnalytics)
    renderPage()

    expect(await screen.findByText("Grade 10-A")).toBeInTheDocument()
    expect(await screen.findByText("2 students with marks recorded")).toBeInTheDocument()
  })

  it("never labels the count as enrolled", async () => {
    mockApi(oneClass, classAnalytics)
    renderPage()

    await screen.findByText("Grade 10-A")
    expect(screen.queryByText(/enrolled/i)).not.toBeInTheDocument()
  })

  it("requests the resolved class with no query params", async () => {
    mockApi(oneClass, classAnalytics)
    renderPage()

    await screen.findByText("Grade 10-A")
    expect(apiFetchMock).toHaveBeenCalledWith("/api/analytics/class/3")
  })
})

describe("TeacherDashboardPage — multiple classes", () => {
  it("shows the first class plus a +N more note", async () => {
    mockApi(twoClasses, classAnalytics)
    renderPage()

    expect(await screen.findByText("Grade 10-A")).toBeInTheDocument()
    expect(screen.getByText("+1 more")).toBeInTheDocument()
  })
})

describe("TeacherDashboardPage — loading and error states", () => {
  it("shows a skeleton while classes are loading", () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getByTestId("your-class-skeleton")).toBeInTheDocument()
  })

  it("shows a destructive alert when the classes query errors", async () => {
    mockApi([], null, false, 403)
    renderPage()

    expect(await screen.findByText("Failed to load your classes")).toBeInTheDocument()
  })

  it("shows an empty state when the teacher has no classes", async () => {
    mockApi([], null)
    renderPage()

    expect(await screen.findByText("No class assigned yet.")).toBeInTheDocument()
  })
})

describe("TeacherDashboardPage — untouched sections", () => {
  it("still renders Quick Actions and Recent Activity as static content", async () => {
    mockApi(oneClass, classAnalytics)
    renderPage()

    await screen.findByText("Grade 10-A")
    expect(screen.getByText("Quick Actions")).toBeInTheDocument()
    expect(screen.getByText("Recent Activity")).toBeInTheDocument()
    expect(screen.getByText("Updated marks for Math Quiz 3")).toBeInTheDocument()
  })
})
