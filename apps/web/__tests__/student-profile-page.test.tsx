import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import StudentProfilePage from "@/app/(main)/student/profile/page"

/**
 * Story 12.2 — "Request Update" dialog and pending-status display on
 * /student/profile. Mirrors the mocking pattern used across this repo's other
 * page tests: vi.mock("@/lib/apiFetch") + path/method-based branching.
 */

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
      <StudentProfilePage />
    </QueryClientProvider>,
  )
}

const BASE_PROFILE = {
  id: 1,
  fullName: "Kasun Perera",
  indexNumber: "STU0000",
  dateOfBirth: "2008-01-01",
  nicNumber: "200800000000",
  address: "Test Address",
  phoneNumber: null as string | null,
  olYear: 2024,
  alYear: 2026,
  assignedClass: "Grade 10-A",
  email: "student@edu.com",
}

interface ProfileEditRequestFixture {
  id: string
  requestedPhoneNumber: string | null
  requestedAddress: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  teacherNote: string | null
  createdAt: string
}

function mockApi({
  profile = BASE_PROFILE,
  requests = [] as ProfileEditRequestFixture[],
}: { profile?: typeof BASE_PROFILE; requests?: ProfileEditRequestFixture[] } = {}) {
  let currentRequests = [...requests]
  apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method ?? "GET"
    if (path === "/api/students/me" && method === "GET") {
      return Promise.resolve(jsonResponse(profile))
    }
    if (path === "/api/students/me/profile-requests" && method === "GET") {
      return Promise.resolve(jsonResponse(currentRequests))
    }
    if (path === "/api/students/me/profile-requests" && method === "POST") {
      const body = JSON.parse(options!.body as string)
      const created: ProfileEditRequestFixture = {
        id: "1",
        requestedPhoneNumber: body.phoneNumber ?? null,
        requestedAddress: body.address ?? null,
        status: "PENDING",
        teacherNote: null,
        createdAt: new Date().toISOString(),
      }
      currentRequests = [created, ...currentRequests]
      return Promise.resolve(jsonResponse(created, true, 201))
    }
    return Promise.resolve(jsonResponse(null, false, 404))
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe("StudentProfilePage — Personal Information shows only the approved value", () => {
  it("keeps the pending request's number out of the Personal Information card, even while one is pending", async () => {
    mockApi({
      profile: { ...BASE_PROFILE, phoneNumber: "0710000000" },
      requests: [
        {
          id: "9",
          requestedPhoneNumber: "0729999999",
          requestedAddress: null,
          status: "PENDING",
          teacherNote: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    })
    renderPage()

    // The requested number legitimately appears in the Pending Review alert
    // (per the "visible while awaiting approval" requirement) — the assertion
    // that matters is that it's NOT in the Personal Information card itself.
    const personalInfoHeading = await screen.findByText("Personal Information")
    const personalInfoCard = personalInfoHeading.closest('[data-slot="card"]') as HTMLElement
    expect(within(personalInfoCard).getByText("0710000000")).toBeInTheDocument()
    expect(within(personalInfoCard).queryByText("0729999999")).not.toBeInTheDocument()

    // ...and it does show up in the pending alert, clearly labeled.
    expect(screen.getByText("Requested Phone Number:")).toBeInTheDocument()
    expect(screen.getByText("0729999999")).toBeInTheDocument()
  })
})

describe("StudentProfilePage — submitting a request", () => {
  it("opens the dialog, restricts the phone number to 10 digits, and submits", async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole("button", { name: /request update/i }))

    expect(screen.getByText("Request a Profile Update")).toBeInTheDocument()

    const phoneInput = screen.getByLabelText("Phone Number")
    await user.type(phoneInput, "07a19-999b999999")
    expect(phoneInput).toHaveValue("0719999999")

    await user.click(screen.getByRole("button", { name: /submit request/i }))

    await waitFor(() => {
      const postCall = apiFetchMock.mock.calls.find(
        ([path, options]) => path === "/api/students/me/profile-requests" && (options as RequestInit)?.method === "POST",
      )
      expect(postCall).toBeDefined()
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it("shows the Pending Request alert with the requested value, and disables further submission", async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole("button", { name: /request update/i }))
    await user.type(screen.getByLabelText("Phone Number"), "0719999999")
    await user.click(screen.getByRole("button", { name: /submit request/i }))

    // Dialog closes and the pending alert takes its place.
    await waitFor(() => {
      expect(screen.queryByText("Request a Profile Update")).not.toBeInTheDocument()
    })
    expect(await screen.findByText("Pending Review")).toBeInTheDocument()
    expect(screen.getByText("Requested Phone Number:")).toBeInTheDocument()
    expect(screen.getByText("0719999999")).toBeInTheDocument()

    const trigger = screen.getByRole("button", { name: /request pending/i })
    expect(trigger).toBeDisabled()
  })
})

describe("StudentProfilePage — rejected request", () => {
  it("shows the rejection reason and still allows a new request", async () => {
    mockApi({
      requests: [
        {
          id: "5",
          requestedPhoneNumber: "0711111111",
          requestedAddress: null,
          status: "REJECTED",
          teacherNote: "Please provide a verifiable number.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    })
    renderPage()

    expect(await screen.findByText(/please provide a verifiable number/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /request update/i })).toBeEnabled()
  })
})
