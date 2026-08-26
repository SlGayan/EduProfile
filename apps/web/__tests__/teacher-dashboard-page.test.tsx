import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TeacherDashboardPage from "@/app/(main)/teacher/dashboard/page"

/**
 * Covers the live-data wiring of GET /api/teachers/me/dashboard onto the
 * Story 12.1 stat-card layout: loading skeleton, error alert, the
 * no-class-assigned empty state, and the four populated stat cards
 * (Total Students, Marks Pending, Class Average, Needs Support).
 *
 * AD-2: certificates are Principal-only — nothing here should ever reference
 * certificate data or render a certificate-related control.
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

const populatedDashboard = {
  classId: 3,
  className: "Grade 10-A",
  studentCount: 14,
  marksPending: 5,
  classAverage: 72.14,
  needsSupport: 2,
  scope: { year: 2026, term: 2 },
}

const noClassDashboard = {
  classId: null,
  className: null,
  studentCount: 0,
  marksPending: 0,
  classAverage: null,
  needsSupport: 0,
  scope: { year: null, term: null },
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("TeacherDashboardPage — populated", () => {
  it("requests the dashboard endpoint and renders the four stat cards", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(populatedDashboard))
    renderPage()

    expect(await screen.findByText("Grade 10-A | Class Teacher | 14 Students")).toBeInTheDocument()
    expect(screen.getByText("Total Students")).toBeInTheDocument()
    expect(screen.getByText("14")).toBeInTheDocument()
    expect(screen.getByText("Marks Pending")).toBeInTheDocument()
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(screen.getByText("Class Average")).toBeInTheDocument()
    expect(screen.getByText("72.14%")).toBeInTheDocument()
    expect(screen.getByText("Needs Support")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith("/api/teachers/me/dashboard")
  })

  it("renders the recorded-term scope as each stat's caption", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(populatedDashboard))
    renderPage()

    await screen.findByText("Grade 10-A | Class Teacher | 14 Students")
    expect(screen.getAllByText("Term 2, 2026").length).toBeGreaterThan(0)
  })

  it("never renders any certificate-related content", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(populatedDashboard))
    renderPage()

    await screen.findByText("Grade 10-A | Class Teacher | 14 Students")
    expect(screen.queryByText(/certificate/i)).not.toBeInTheDocument()
  })

  it("still renders Quick Actions as static content", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(populatedDashboard))
    renderPage()

    await screen.findByText("Grade 10-A | Class Teacher | 14 Students")
    expect(screen.getByText("Quick Actions")).toBeInTheDocument()
    expect(screen.getByText("Add Student")).toBeInTheDocument()
  })
})

describe("TeacherDashboardPage — no marks recorded yet", () => {
  it("shows an em dash for the average and a fallback caption instead of a fabricated scope", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({
        ...populatedDashboard,
        marksPending: 14,
        classAverage: null,
        needsSupport: 0,
        scope: { year: null, term: null },
      }),
    )
    renderPage()

    await screen.findByText("Grade 10-A | Class Teacher | 14 Students")
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getAllByText("No marks recorded yet").length).toBeGreaterThan(0)
  })
})

describe("TeacherDashboardPage — loading and error states", () => {
  it("shows a skeleton while the dashboard is loading", () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getByTestId("teacher-dashboard-skeleton")).toBeInTheDocument()
  })

  it("shows a destructive alert when the dashboard query errors", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ error: "Teacher profile not found" }, false, 403))
    renderPage()

    expect(await screen.findByText("Teacher profile not found")).toBeInTheDocument()
  })

  it("shows an empty state when the teacher has no class assigned", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(noClassDashboard))
    renderPage()

    expect(await screen.findByText("No class assigned")).toBeInTheDocument()
  })
})
