import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import StudentActivitiesPage from "@/app/(main)/student/activities/page"

/**
 * Covers the merged Activities + self-added Certificates list on the student
 * "My Activities" page: both submission types share one review workflow, so
 * they render as one list instead of two separate pages. Renders the real
 * component in jsdom against a mocked API and asserts on the output.
 */

const apiFetchMock = vi.fn()
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

/**
 * The page fires two independent queries (activities, self-added
 * certificates). Routing the mock by URL keeps each test's fixture in the
 * shape the corresponding normalizer actually expects, instead of one array
 * masquerading as both.
 */
function mockEndpoints({
  activities = [],
  certificates = [],
  activitiesOk = true,
  activitiesStatus = 200,
}: {
  activities?: unknown[]
  certificates?: unknown[]
  activitiesOk?: boolean
  activitiesStatus?: number
}) {
  apiFetchMock.mockImplementation((url: string) => {
    if (url === "/api/students/me/activities") {
      return Promise.resolve(jsonResponse(activitiesOk ? activities : { error: "Student profile not found" }, activitiesOk, activitiesStatus))
    }
    if (url === "/api/students/me/student-certificates") {
      return Promise.resolve(jsonResponse(certificates))
    }
    throw new Error(`Unexpected apiFetch call: ${url}`)
  })
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

const oneCertificate = {
  id: "21",
  title: "Intro to Python",
  issuingOrganization: "Coursera",
  category: "Academic",
  issueDate: "2026-02-01T00:00:00.000Z",
  description: null,
  evidenceUrl: "https://example.com/cert",
  fileUrl: null,
  fileType: null,
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("StudentActivitiesPage — empty state", () => {
  it("renders the friendly empty block, not a blank card, when both endpoints return []", async () => {
    mockEndpoints({})
    renderPage()

    expect(await screen.findByText("Nothing recorded yet")).toBeInTheDocument()
  })

  it("shows no results table when there is nothing recorded", async () => {
    mockEndpoints({})
    renderPage()

    await screen.findByText("Nothing recorded yet")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("calls the /me endpoints, not a teacher endpoint", async () => {
    mockEndpoints({})
    renderPage()

    await screen.findByText("Nothing recorded yet")
    expect(apiFetchMock).toHaveBeenCalledWith("/api/students/me/activities")
    expect(apiFetchMock).toHaveBeenCalledWith("/api/students/me/student-certificates")
  })
})

describe("StudentActivitiesPage — populated list", () => {
  it("renders the merged table's columns", async () => {
    mockEndpoints({ activities: [oneActivity] })
    renderPage()

    expect(await screen.findByText("Debate Club")).toBeInTheDocument()
    for (const header of ["Type", "Item", "Category", "Date", "Evidence", "Status", "Actions"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument()
    }
  })

  it("renders an activity row with its values and date range formatted", async () => {
    mockEndpoints({ activities: [oneActivity] })
    renderPage()

    expect(await screen.findByText("Debate Club")).toBeInTheDocument()
    expect(screen.getByText("Club")).toBeInTheDocument()
    expect(screen.getByText("2026-01-15 – 2026-06-15")).toBeInTheDocument()
    expect(screen.getByText("Runner up")).toBeInTheDocument()
    expect(screen.getByText("Activity")).toBeInTheDocument()
  })

  it("shows 'Ongoing' when the activity has no end date", async () => {
    mockEndpoints({ activities: [{ ...oneActivity, endDate: null }] })
    renderPage()

    expect(await screen.findByText("2026-01-15 – Ongoing")).toBeInTheDocument()
  })

  it("renders a certificate row alongside an activity row", async () => {
    mockEndpoints({ activities: [oneActivity], certificates: [oneCertificate] })
    renderPage()

    expect(await screen.findByText("Debate Club")).toBeInTheDocument()
    expect(screen.getByText("Intro to Python")).toBeInTheDocument()
    expect(screen.getByText("Academic")).toBeInTheDocument()
    expect(screen.getByText("Certificate")).toBeInTheDocument()
    expect(screen.getByText("Link")).toBeInTheDocument()
  })

  it("renders submit buttons and no correction actions when nothing needs correction", async () => {
    mockEndpoints({ activities: [oneActivity] })
    renderPage()

    await screen.findByText("Debate Club")
    expect(screen.getByRole("button", { name: /submit activity/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add certificate/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^correct$/i })).not.toBeInTheDocument()
  })

  it("renders a correct button and the teacher's note when an activity needs correction", async () => {
    mockEndpoints({
      activities: [{ ...oneActivity, status: "NEEDS_CORRECTION", teacherNote: "Please provide evidence" }],
    })
    renderPage()

    await screen.findByText("Debate Club")
    expect(screen.getByText(/Note: Please provide evidence/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^correct$/i })).toBeInTheDocument()
  })

  it("renders a correct button when a certificate needs correction", async () => {
    mockEndpoints({
      certificates: [{ ...oneCertificate, status: "NEEDS_CORRECTION", teacherNote: "Add the certificate file" }],
    })
    renderPage()

    await screen.findByText("Intro to Python")
    expect(screen.getByText(/Note: Add the certificate file/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^correct$/i })).toBeInTheDocument()
  })

  it("shows the reviewer name and date once an item has been reviewed", async () => {
    mockEndpoints({
      activities: [{ ...oneActivity, status: "APPROVED", reviewedByName: "Mrs. S. Silva", reviewedAt: "2026-03-01T00:00:00.000Z" }],
    })
    renderPage()

    await screen.findByText("Debate Club")
    expect(screen.getByText(/by Mrs\. S\. Silva on 2026-03-01/i)).toBeInTheDocument()
  })
})

describe("StudentActivitiesPage — error handling", () => {
  it("surfaces the API's message when the student has no profile row", async () => {
    mockEndpoints({ activitiesOk: false, activitiesStatus: 404 })
    renderPage()

    expect(await screen.findByText("Student profile not found")).toBeInTheDocument()
    expect(screen.queryByText("Nothing recorded yet")).not.toBeInTheDocument()
  })
})
