import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PendingRequestsPage from "@/app/(main)/teacher/pending-requests/page"

/**
 * Story 12.2 — the tabbed Pending Requests hub (Activities + Profile
 * Updates), replacing the old /teacher/pending-activities page. Mirrors the
 * mocking pattern used across this repo's other page tests.
 */

/** Radix Dialog/Tabs drive pointer APIs jsdom does not implement. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

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
      <PendingRequestsPage />
    </QueryClientProvider>,
  )
}

const ACTIVITY = {
  id: "11",
  activityName: "Debate Club",
  activityType: "Club",
  description: "Weekly debate practice",
  startDate: "2026-01-15T00:00:00.000Z",
  endDate: null,
  achievements: null,
  status: "PENDING" as const,
  evidenceUrl: null,
  studentName: "Amal Silva",
  admissionNumber: "2019/001",
}

const PROFILE_REQUEST = {
  id: "9",
  studentId: "1",
  requestedPhoneNumber: "0719999999",
  requestedAddress: null,
  status: "PENDING" as const,
  teacherNote: null,
  createdAt: "2026-01-10T00:00:00.000Z",
  studentName: "Kasun Perera",
  admissionNumber: "2019/000",
}

interface MockOptions {
  activities?: typeof ACTIVITY[]
  profileRequests?: typeof PROFILE_REQUEST[]
  onActivityPatch?: (id: string, body: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }
  onProfileRequestPatch?: (id: string, body: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }
}

function mockApi({
  activities = [],
  profileRequests = [],
  onActivityPatch,
  onProfileRequestPatch,
}: MockOptions = {}) {
  let currentActivities = [...activities]
  let currentProfileRequests = [...profileRequests]

  apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method ?? "GET"

    if (path === "/api/teachers/me/pending-activities" && method === "GET") {
      return Promise.resolve(jsonResponse(currentActivities))
    }
    if (path === "/api/teachers/me/profile-requests" && method === "GET") {
      return Promise.resolve(jsonResponse(currentProfileRequests))
    }
    if (path.startsWith("/api/activities/") && path.endsWith("/status") && method === "PATCH") {
      const id = path.split("/")[3]!
      const body = JSON.parse(options!.body as string)
      const result = onActivityPatch
        ? onActivityPatch(id, body)
        : { ok: true, status: 200, body: { ...ACTIVITY, id, ...body } }
      if (result.ok) {
        currentActivities = currentActivities.filter((a) => a.id !== id)
      }
      return Promise.resolve(jsonResponse(result.body, result.ok, result.status))
    }
    if (path.startsWith("/api/teachers/profile-requests/") && method === "PATCH") {
      const id = path.split("/").pop()!
      const body = JSON.parse(options!.body as string)
      const result = onProfileRequestPatch
        ? onProfileRequestPatch(id, body)
        : { ok: true, status: 200, body: { ...PROFILE_REQUEST, id, ...body } }
      if (result.ok) {
        currentProfileRequests = currentProfileRequests.filter((r) => r.id !== id)
      }
      return Promise.resolve(jsonResponse(result.body, result.ok, result.status))
    }

    return Promise.resolve(jsonResponse(null, false, 404))
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe("PendingRequestsPage — tab structure", () => {
  it("shows both tabs with their pending counts, defaulting to Activities", async () => {
    mockApi({ activities: [ACTIVITY], profileRequests: [PROFILE_REQUEST] })
    renderPage()

    expect(await screen.findByRole("tab", { name: /activities \(1\)/i })).toHaveAttribute("data-state", "active")
    expect(screen.getByRole("tab", { name: /profile updates \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText("Debate Club")).toBeInTheDocument()
  })
})

describe("PendingRequestsPage — Activities tab", () => {
  it("approves an activity from the Activities tab", async () => {
    mockApi({ activities: [ACTIVITY] })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText("Debate Club")
    await user.click(screen.getByRole("button", { name: "Approve" }))

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: /^approve$/i }))

    await waitFor(() => {
      const patchCall = apiFetchMock.mock.calls.find(
        ([path, options]) =>
          typeof path === "string" && path.startsWith("/api/activities/") && (options as RequestInit)?.method === "PATCH",
      )
      expect(patchCall).toBeDefined()
    })
    expect(await screen.findByText("All caught up!")).toBeInTheDocument()
  })
})

describe("PendingRequestsPage — Profile Updates tab", () => {
  async function switchToProfileUpdatesTab() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole("tab", { name: /profile updates/i }))
    return user
  }

  it("shows the requested phone number and student in the Profile Updates table", async () => {
    mockApi({ profileRequests: [PROFILE_REQUEST] })
    renderPage()
    await switchToProfileUpdatesTab()

    expect(await screen.findByText("Kasun Perera")).toBeInTheDocument()
    expect(screen.getByText("0719999999")).toBeInTheDocument()
  })

  it("requires a teacherNote before Reject can be submitted, then rejects", async () => {
    mockApi({ profileRequests: [PROFILE_REQUEST] })
    const user = await (async () => {
      renderPage()
      return switchToProfileUpdatesTab()
    })()

    await screen.findByText("Kasun Perera")
    await user.click(screen.getByRole("button", { name: "Reject" }))

    const dialog = await screen.findByRole("dialog")
    const rejectSubmit = within(dialog).getByRole("button", { name: /^reject$/i })
    expect(rejectSubmit).toBeDisabled()

    await user.type(within(dialog).getByLabelText("Teacher Note"), "Please provide a verifiable number.")
    expect(rejectSubmit).toBeEnabled()

    await user.click(rejectSubmit)

    await waitFor(() => {
      const patchCall = apiFetchMock.mock.calls.find(
        ([path, options]) =>
          typeof path === "string" &&
          path.startsWith("/api/teachers/profile-requests/") &&
          (options as RequestInit)?.method === "PATCH",
      )
      expect(patchCall).toBeDefined()
      const body = JSON.parse((patchCall![1] as RequestInit).body as string)
      expect(body).toMatchObject({ status: "REJECTED", teacherNote: "Please provide a verifiable number." })
    })
    expect(await screen.findByText("All caught up!")).toBeInTheDocument()
  })

  it("approves a profile update request without requiring a note", async () => {
    mockApi({ profileRequests: [PROFILE_REQUEST] })
    renderPage()
    const user = await switchToProfileUpdatesTab()

    await screen.findByText("Kasun Perera")
    await user.click(screen.getByRole("button", { name: "Approve" }))

    const dialog = await screen.findByRole("dialog")
    const approveSubmit = within(dialog).getByRole("button", { name: /^approve$/i })
    expect(approveSubmit).toBeEnabled()
    await user.click(approveSubmit)

    await waitFor(() => {
      const patchCall = apiFetchMock.mock.calls.find(
        ([path, options]) =>
          typeof path === "string" &&
          path.startsWith("/api/teachers/profile-requests/") &&
          (options as RequestInit)?.method === "PATCH",
      )
      expect(patchCall).toBeDefined()
      const body = JSON.parse((patchCall![1] as RequestInit).body as string)
      expect(body).toMatchObject({ status: "APPROVED" })
    })
    expect(await screen.findByText("All caught up!")).toBeInTheDocument()
  })
})
