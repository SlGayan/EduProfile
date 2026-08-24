import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import StudentActivitiesPage from "@/app/(main)/student/activities/page"

/**
 * Closes Story 8.4 subtasks 6.3 and 6.4, which are otherwise only verifiable
 * by eye in a browser. These render the real component in jsdom against a
 * mocked API and assert on the output.
 *
 * NOTE: this is the first component test in this repo — the four pre-existing
 * test files all cover pure functions in lib/. It verifies rendering logic,
 * not real-browser layout.
 */

const apiFetchMock = vi.fn()
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <StudentActivitiesPage />
    </QueryClientProvider>,
  )
}

const oneActivity = {
  id: "11",
  activityName: "Debate Club",
  activityType: "Club",
  description: "Weekly debate practice",
  startDate: "2026-01-15T00:00:00.000Z",
  endDate: "2026-06-15T00:00:00.000Z",
  achievements: "Runner up",
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("StudentActivitiesPage — empty state (AC2, subtask 6.3)", () => {
  it("renders the friendly empty block, not a blank card, when the API returns []", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([]))
    renderPage()

    expect(await screen.findByText("No activities recorded yet")).toBeInTheDocument()
    expect(
      screen.getByText(/haven't submitted any extracurricular activities/i),
    ).toBeInTheDocument()
  })

  it("shows no results table when there are no activities", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([]))
    renderPage()

    await screen.findByText("No activities recorded yet")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("calls the /me endpoint, not a teacher endpoint", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([]))
    renderPage()

    await screen.findByText("No activities recorded yet")
    expect(apiFetchMock).toHaveBeenCalledWith("/api/students/me/activities")
  })
})

describe("StudentActivitiesPage — populated list (AC1, subtask 6.4)", () => {
  it("renders the four specified columns", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([oneActivity]))
    renderPage()

    expect(await screen.findByText("Debate Club")).toBeInTheDocument()
    for (const header of ["Activity", "Type", "Dates", "Achievements"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument()
    }
  })

  it("renders the activity's values, with the date range formatted", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([oneActivity]))
    renderPage()

    expect(await screen.findByText("Debate Club")).toBeInTheDocument()
    expect(screen.getByText("Club")).toBeInTheDocument()
    expect(screen.getByText("2026-01-15 – 2026-06-15")).toBeInTheDocument()
    expect(screen.getByText("Runner up")).toBeInTheDocument()
  })

  it("renders an em dash when achievements is null", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([{ ...oneActivity, achievements: null }]))
    renderPage()

    expect(await screen.findByText("Debate Club")).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows 'Ongoing' when the activity has no end date", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([{ ...oneActivity, endDate: null }]))
    renderPage()

    expect(await screen.findByText("2026-01-15 – Ongoing")).toBeInTheDocument()
  })

  it("renders submit activity button and conditionally renders correction actions", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([oneActivity]))
    renderPage()

    await screen.findByText("Debate Club")
    expect(screen.getByRole("button", { name: /submit activity/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /correct/i })).not.toBeInTheDocument()
  })

  it("renders correct button when status is NEEDS_CORRECTION", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse([{ ...oneActivity, status: "NEEDS_CORRECTION", teacherNote: "Please provide evidence" }]))
    renderPage()

    await screen.findByText("Debate Club")
    expect(screen.getByText(/Note: Please provide evidence/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /correct/i })).toBeInTheDocument()
  })
})

describe("StudentActivitiesPage — error handling", () => {
  it("surfaces the API's message when the student has no profile row", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ error: "Student profile not found" }, false, 404),
    )
    renderPage()

    expect(await screen.findByText("Student profile not found")).toBeInTheDocument()
    expect(screen.queryByText("No activities recorded yet")).not.toBeInTheDocument()
  })
})
