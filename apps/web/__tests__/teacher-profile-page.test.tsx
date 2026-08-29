import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TeacherProfilePage from "@/app/(main)/teacher/profile/page"

/**
 * Story 12.2 — teacher self-edit form on /teacher/profile.
 * Mirrors the mocking pattern from teacher-materials-page.test.tsx:
 * vi.mock("@/lib/apiFetch") + path/method-based branching + QueryClientProvider.
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
      <TeacherProfilePage />
    </QueryClientProvider>,
  )
}

interface TeacherProfileFixture {
  id: number
  staffId: string
  displayName: string | null
  phoneNumber: string | null
  address: string | null
  gender: "MALE" | "FEMALE" | "OTHER" | null
  email: string
  role: string
  joinedDate: string
  classes: { id: number; name: string }[]
}

const BASE_PROFILE: TeacherProfileFixture = {
  id: 1,
  staffId: "TCH-0001",
  displayName: null,
  phoneNumber: null,
  address: null,
  gender: null,
  email: "teacher@edu.com",
  role: "TEACHER",
  joinedDate: "2026-01-01T00:00:00.000Z",
  classes: [{ id: 1, name: "Grade 10-A" }],
}

interface MockOptions {
  profile?: TeacherProfileFixture
  onPatch?: (body: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }
}

function mockApi({ profile = BASE_PROFILE, onPatch }: MockOptions = {}) {
  let current = { ...profile }
  apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method ?? "GET"
    if (path === "/api/teachers/me" && method === "GET") {
      return Promise.resolve(jsonResponse(current))
    }
    if (path === "/api/teachers/me" && method === "PATCH") {
      const body = JSON.parse(options!.body as string)
      const result = onPatch ? onPatch(body) : { ok: true, status: 200, body: { ...current, ...body } }
      if (result.ok) {
        current = { ...current, ...(result.body as object) }
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

describe("TeacherProfilePage — read-only Staff Information", () => {
  it("shows 'Not set' for contact fields that have never been saved", async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText("TCH-0001")).toBeInTheDocument()
    expect(screen.getAllByText("Not set")).toHaveLength(4) // Display Name, Phone Number, Gender, Address
  })

  it("pre-fills the edit form with the currently saved values", async () => {
    mockApi({
      profile: { ...BASE_PROFILE, displayName: "Ms. Perera", phoneNumber: "0771234567", address: "12 Lake Road" },
    })
    renderPage()

    expect(await screen.findByDisplayValue("Ms. Perera")).toBeInTheDocument()
    expect(screen.getByDisplayValue("0771234567")).toBeInTheDocument()
    expect(screen.getByDisplayValue("12 Lake Road")).toBeInTheDocument()
  })
})

describe("TeacherProfilePage — phone number input restriction", () => {
  it("strips non-digit characters and caps the phone number input at 10 characters", async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()

    const phoneInput = await screen.findByLabelText("Phone Number")
    await user.type(phoneInput, "07a71-234b5678999")

    expect(phoneInput).toHaveValue("0771234567")
  })
})

describe("TeacherProfilePage — self-edit save flow", () => {
  it("saves immediately and reflects the new values in Staff Information", async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText("TCH-0001")

    await user.type(screen.getByLabelText("Display Name"), "Ms. Perera")
    await user.type(screen.getByLabelText("Phone Number"), "0771234567")
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await screen.findByDisplayValue("Ms. Perera")
    expect(toastSuccess).toHaveBeenCalled()

    const patchCall = apiFetchMock.mock.calls.find(
      ([path, options]) => path === "/api/teachers/me" && (options as RequestInit)?.method === "PATCH",
    )
    expect(patchCall).toBeDefined()
    const body = JSON.parse((patchCall![1] as RequestInit).body as string)
    expect(body).toMatchObject({ displayName: "Ms. Perera", phoneNumber: "0771234567" })

    // Staff Information reads the same query the mutation invalidates, so the
    // saved values must now appear there too — not just pre-filled in the form.
    const staffInfoHeading = screen.getByText("Staff Information")
    const staffInfoCard = staffInfoHeading.closest('[data-slot="card"]') as HTMLElement
    expect(await within(staffInfoCard).findByText("Ms. Perera")).toBeInTheDocument()
    expect(within(staffInfoCard).getByText("0771234567")).toBeInTheDocument()
  })

  it("surfaces a toast error when the save fails", async () => {
    mockApi({
      onPatch: () => ({ ok: false, status: 400, body: { error: "Phone number must be exactly 10 digits" } }),
    })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText("TCH-0001")
    await user.type(screen.getByLabelText("Display Name"), "Ms. Perera")
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Phone number must be exactly 10 digits")
    })
  })
})
