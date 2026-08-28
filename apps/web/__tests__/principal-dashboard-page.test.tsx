import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PrincipalDashboardPage from "@/app/(main)/principal/dashboard/page"

/** Radix Select drives pointer APIs jsdom does not implement. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

/**
 * Story: Principal Dashboard rebuild to match the supplied UI mockup.
 *
 * The dashboard now sources its stats from `GET /api/principals/me/dashboard`
 * (year/term/grade/class-scoped) instead of `GET /api/analytics/school`, and
 * gained a fifth "Reports Pending" card plus Academic Year/Term/Grade/Class
 * filters and a per-grade performance chart.
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

const populated = {
  scope: { year: 2026, term: 2, gradeLevel: null, classId: null, subjectId: null },
  filters: {
    years: [2026, 2025],
    grades: [9, 10],
    classes: [
      { id: 1, name: "Grade 9-A", gradeLevel: 9 },
      { id: 2, name: "Grade 10-A", gradeLevel: 10 },
    ],
  },
  totals: { studentCount: 101, activeStudentCount: 95 },
  marksCompletion: { percent: 82, classesPending: 3, classCount: 6 },
  reportsPending: 3,
  schoolAverage: { current: 69.7, previousTerm: 68.1, deltaPercent: 1.6 },
  gradePerformance: [
    { gradeLevel: 9, average: 71.2, studentCount: 40, markCount: 200 },
    { gradeLevel: 10, average: 68.4, studentCount: 61, markCount: 300 },
  ],
}

function mockApi(dashboard: unknown, ok = true, status = 200) {
  apiFetchMock.mockImplementation((url: string) => {
    if (url === "/api/certificates/eligible-count") {
      return Promise.resolve(jsonResponse({ count: 6 }))
    }
    if (url === "/api/subjects") {
      return Promise.resolve(
        jsonResponse([
          { id: "1", name: "Mathematics" },
          { id: "2", name: "Science" },
        ]),
      )
    }
    return Promise.resolve(jsonResponse(dashboard, ok, status))
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("PrincipalDashboardPage — stat cards (populated)", () => {
  it("renders Total Students with the active-student caption", async () => {
    mockApi(populated)
    renderPage()

    expect(await screen.findByText("101")).toBeInTheDocument()
    expect(screen.getByText("Active 95")).toBeInTheDocument()
  })

  it("renders Marks Completion percent and pending-class count", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("101")
    expect(screen.getByText("82%")).toBeInTheDocument()
    expect(screen.getByText("3 classes pending")).toBeInTheDocument()
  })

  it("renders School Average with a positive delta from the previous term", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("101")
    expect(screen.getByText("69.7%")).toBeInTheDocument()
    expect(screen.getByText(/1\.6% from Term 1/)).toBeInTheDocument()
  })

  it("renders Cert Requests from the eligible-count endpoint, linking to the certificates page", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("101")
    expect(await screen.findByText("6")).toBeInTheDocument()
    expect(screen.getByText("Pending Review")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Cert Requests/ })).toHaveAttribute(
      "href",
      "/principal/certificates",
    )
  })

  it("renders Reports Pending from the dashboard response", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("101")
    expect(screen.getByText("Missing term marks")).toBeInTheDocument()
  })

  it("requests the principal dashboard endpoint with no query params on first load", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("101")
    expect(apiFetchMock).toHaveBeenCalledWith("/api/principals/me/dashboard")
  })
})

describe("PrincipalDashboardPage — loading and error states", () => {
  it("shows five skeleton stat cards while loading", () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getAllByTestId("stat-card-skeleton")).toHaveLength(5)
  })

  it("shows a destructive alert on error", async () => {
    mockApi(null, false, 403)
    renderPage()

    expect(await screen.findByText("Failed to load the principal dashboard")).toBeInTheDocument()
  })
})

describe("PrincipalDashboardPage — filters", () => {
  it("re-requests the dashboard with the chosen year when Academic Year changes", async () => {
    mockApi(populated)
    renderPage()
    await screen.findByText("101")

    const user = userEvent.setup()
    await user.click(screen.getByLabelText("Academic Year"))
    await user.click(await screen.findByRole("option", { name: "2025" }))

    expect(apiFetchMock).toHaveBeenCalledWith("/api/principals/me/dashboard?year=2025")
  })

  it("re-requests the dashboard with the chosen grade when Grade changes", async () => {
    mockApi(populated)
    renderPage()
    await screen.findByText("101")

    const user = userEvent.setup()
    await user.click(screen.getByLabelText("Grade"))
    await user.click(await screen.findByRole("option", { name: "Grade 9" }))

    expect(apiFetchMock).toHaveBeenCalledWith("/api/principals/me/dashboard?gradeLevel=9")
  })

  it("re-requests the dashboard with the chosen subject when the chart's Subject filter changes", async () => {
    mockApi(populated)
    renderPage()
    await screen.findByText("101")

    const user = userEvent.setup()
    await user.click(await screen.findByLabelText("Subject"))
    await user.click(await screen.findByRole("option", { name: "Mathematics" }))

    expect(apiFetchMock).toHaveBeenCalledWith("/api/principals/me/dashboard?subjectId=1")
  })
})

describe("PrincipalDashboardPage — Quick Actions", () => {
  it("links every quick action to its destination page", async () => {
    mockApi(populated)
    renderPage()

    await screen.findByText("101")
    expect(screen.getByRole("link", { name: /View Analytics/ })).toHaveAttribute(
      "href",
      "/principal/analytics",
    )
    expect(screen.getByRole("link", { name: /Search Student \/ Alumni/ })).toHaveAttribute(
      "href",
      "/principal/search-students",
    )
    expect(screen.getByRole("link", { name: /Create Class/ })).toHaveAttribute(
      "href",
      "/admin/classes?create=1",
    )
    expect(screen.getByRole("link", { name: /Issue New Certificate/ })).toHaveAttribute(
      "href",
      "/principal/issue-certificate",
    )
    expect(screen.getByRole("link", { name: /View Pending Marks/ })).toHaveAttribute(
      "href",
      "/principal/pending-marks",
    )
    expect(screen.getByRole("link", { name: /Generate School Report/ })).toHaveAttribute(
      "href",
      "/principal/analytics",
    )
  })
})
