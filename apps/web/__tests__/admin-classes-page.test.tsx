import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ClassManagementPage from "@/app/(main)/admin/classes/page"

/** Radix Select (and DropdownMenu) drive pointer APIs jsdom does not implement. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
const toastWarning = vi.fn()

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}))

const apiFetchMock = vi.fn()
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ClassManagementPage />
    </QueryClientProvider>,
  )
}

const CLASS = {
  id: 1,
  // `name` is derived by the API from gradeLevel/section (Story 13.1) — the
  // page only ever reads it, so the fixture supplies both.
  name: "Grade 10-A",
  gradeLevel: 10,
  section: "A",
  year: 2025,
  teacherId: null,
  teacher: null,
  _count: { students: 0 },
}

const USERS = [
  { id: 10, email: "teacher1@edu.com", role: "TEACHER", teacher: { id: 100 }, student: null },
  { id: 11, email: "teacher2@edu.com", role: "TEACHER", teacher: { id: 101 }, student: null },
]

const SUBJECTS = [
  { id: "1", name: "Math" },
  { id: "2", name: "Science" },
]

interface MockOptions {
  assignments?: unknown[]
  subjects?: { id: string; name: string }[]
  subjectsOk?: boolean
  onPost?: (body: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }
  onDelete?: (id: string) => { ok: boolean; status: number; body: unknown }
}

function mockApi({
  assignments = [],
  subjects = SUBJECTS,
  subjectsOk = true,
  onPost,
  onDelete,
}: MockOptions) {
  let currentAssignments = [...assignments]

  apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method ?? "GET"

    if (path === "/api/classes") {
      return Promise.resolve(jsonResponse({ classes: [CLASS] }))
    }
    if (path === "/api/users") {
      return Promise.resolve(jsonResponse({ users: USERS }))
    }
    if (path === "/api/subjects") {
      return Promise.resolve(jsonResponse(subjects, subjectsOk, subjectsOk ? 200 : 500))
    }
    if (path === `/api/classes/${CLASS.id}/subject-assignments`) {
      return Promise.resolve(jsonResponse({ assignments: currentAssignments }))
    }
    if (path === "/api/teacher-subject-assignments" && method === "POST") {
      const body = JSON.parse(options!.body as string)
      const result = onPost
        ? onPost(body)
        : {
            ok: true,
            status: 201,
            body: {
              assignment: {
                id: 999,
                teacherId: body.teacherId,
                subjectId: body.subjectId,
                classId: body.classId,
                teacher: {
                  id: body.teacherId,
                  user: { email: USERS.find((u) => u.teacher.id === body.teacherId)!.email },
                },
                subject: { id: body.subjectId, name: subjects.find((s) => Number(s.id) === body.subjectId)?.name },
              },
            },
          }
      if (result.ok) {
        currentAssignments = [...currentAssignments, (result.body as { assignment: unknown }).assignment]
      }
      return Promise.resolve(jsonResponse(result.body, result.ok, result.status))
    }
    if (path.startsWith("/api/teacher-subject-assignments/") && method === "DELETE") {
      const id = path.split("/").pop()!
      const result = onDelete
        ? onDelete(id)
        : { ok: true, status: 200, body: { message: "Assignment successfully deleted" } }
      if (result.ok) {
        currentAssignments = currentAssignments.filter((a) => String((a as { id: number }).id) !== id)
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
  toastWarning.mockReset()
})

async function openAssignmentsModal() {
  const user = userEvent.setup()
  renderPage()

  expect(await screen.findByText("Grade 10-A")).toBeInTheDocument()

  await user.click(screen.getByRole("button", { name: /open menu/i }))
  await user.click(await screen.findByRole("menuitem", { name: /subject teachers/i }))

  expect(await screen.findByText("Subject Teachers — Grade 10-A")).toBeInTheDocument()
  return user
}

describe("Subject Teachers modal — no assignments yet", () => {
  it("shows empty state and an add form still usable", async () => {
    mockApi({ assignments: [] })
    await openAssignmentsModal()

    expect(await screen.findByText("No subject assignments yet.")).toBeInTheDocument()
    expect(screen.getByLabelText("Teacher")).toBeInTheDocument()
    expect(screen.getByLabelText("Subject")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
  })
})

describe("Subject Teachers modal — assignments fetch fails", () => {
  it("shows an inline error message instead of the empty state", async () => {
    apiFetchMock.mockReset()
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/classes") {
        return Promise.resolve(jsonResponse({ classes: [CLASS] }))
      }
      if (path === "/api/users") {
        return Promise.resolve(jsonResponse({ users: USERS }))
      }
      if (path === "/api/subjects") {
        return Promise.resolve(jsonResponse(SUBJECTS))
      }
      if (path === `/api/classes/${CLASS.id}/subject-assignments`) {
        return Promise.resolve(jsonResponse(null, false, 500))
      }
      return Promise.resolve(jsonResponse(null, false, 404))
    })

    await openAssignmentsModal()

    expect(await screen.findByText("Failed to load subject assignments.")).toBeInTheDocument()
    expect(screen.queryByText("No subject assignments yet.")).not.toBeInTheDocument()
  })
})

describe("Subject Teachers modal — existing assignments", () => {
  it("lists teacher email + subject name per row, each with a Remove button", async () => {
    mockApi({
      assignments: [
        {
          id: 5,
          teacherId: 100,
          subjectId: 1,
          classId: 1,
          teacher: { id: 100, user: { email: "teacher1@edu.com" } },
          subject: { id: 1, name: "Math" },
        },
      ],
    })
    await openAssignmentsModal()

    const row = (await screen.findByText("teacher1@edu.com")).closest("tr")!
    expect(within(row).getByText("Math")).toBeInTheDocument()
    expect(within(row).getByRole("button")).toBeInTheDocument()
  })
})

describe("Subject Teachers modal — add valid pair", () => {
  it("adds a new row and shows a success toast", async () => {
    mockApi({ assignments: [] })
    const user = await openAssignmentsModal()

    await user.click(screen.getByLabelText("Teacher"))
    await user.click(await screen.findByRole("option", { name: "teacher1@edu.com" }))
    await user.click(screen.getByLabelText("Subject"))
    await user.click(await screen.findByRole("option", { name: "Math" }))

    await user.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Teacher assigned to subject"))
    expect(await screen.findByText("teacher1@edu.com")).toBeInTheDocument()
    expect(screen.queryByText("No subject assignments yet.")).not.toBeInTheDocument()
  })
})

describe("Subject Teachers modal — add duplicate pair", () => {
  it("does not add a row and shows the API's 409 message via toast.error", async () => {
    mockApi({
      assignments: [],
      onPost: () => ({ ok: false, status: 409, body: { error: "Assignment already exists" } }),
    })
    const user = await openAssignmentsModal()

    await user.click(screen.getByLabelText("Teacher"))
    await user.click(await screen.findByRole("option", { name: "teacher1@edu.com" }))
    await user.click(screen.getByLabelText("Subject"))
    await user.click(await screen.findByRole("option", { name: "Math" }))
    await user.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Assignment already exists"))
    expect(screen.getByText("No subject assignments yet.")).toBeInTheDocument()
  })
})

describe("Subject Teachers modal — add causes soft-cap warning", () => {
  it("still adds the row and shows a warning badge + toast.warning", async () => {
    const warningMsg = "Teacher now has 4 concurrent subject assignments, exceeding the advisory cap of 3."
    mockApi({
      assignments: [],
      onPost: (body) => ({
        ok: true,
        status: 201,
        body: {
          assignment: {
            id: 999,
            teacherId: body.teacherId,
            subjectId: body.subjectId,
            classId: body.classId,
            teacher: { id: body.teacherId, user: { email: "teacher1@edu.com" } },
            subject: { id: body.subjectId, name: "Math" },
          },
          warning: warningMsg,
        },
      }),
    })
    const user = await openAssignmentsModal()

    await user.click(screen.getByLabelText("Teacher"))
    await user.click(await screen.findByRole("option", { name: "teacher1@edu.com" }))
    await user.click(screen.getByLabelText("Subject"))
    await user.click(await screen.findByRole("option", { name: "Math" }))
    await user.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(toastWarning).toHaveBeenCalledWith(warningMsg))
    expect(await screen.findByText(warningMsg)).toBeInTheDocument()
    expect(await screen.findByText("teacher1@edu.com")).toBeInTheDocument()
  })
})

describe("Subject Teachers modal — remove assignment", () => {
  it("removes the row and shows a success toast", async () => {
    mockApi({
      assignments: [
        {
          id: 5,
          teacherId: 100,
          subjectId: 1,
          classId: 1,
          teacher: { id: 100, user: { email: "teacher1@edu.com" } },
          subject: { id: 1, name: "Math" },
        },
      ],
    })
    const user = await openAssignmentsModal()

    expect(await screen.findByText("teacher1@edu.com")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /remove teacher1@edu.com from math/i }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Assignment removed"))
    await waitFor(() => expect(screen.queryByText("teacher1@edu.com")).not.toBeInTheDocument())
    expect(screen.getByText("No subject assignments yet.")).toBeInTheDocument()
  })

  it("shows toast.error and refreshes the list on a 404 (already removed)", async () => {
    mockApi({
      assignments: [
        {
          id: 5,
          teacherId: 100,
          subjectId: 1,
          classId: 1,
          teacher: { id: 100, user: { email: "teacher1@edu.com" } },
          subject: { id: 1, name: "Math" },
        },
      ],
      onDelete: () => ({ ok: false, status: 404, body: { error: "Assignment not found" } }),
    })
    const user = await openAssignmentsModal()

    expect(await screen.findByText("teacher1@edu.com")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /remove teacher1@edu.com from math/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Assignment not found"))
    // List refresh is re-fetched (refetch call happens); with onDelete stubbed to
    // always fail, the row legitimately still exists server-side, so it remains.
    expect(apiFetchMock.mock.calls.filter(
      (c) => c[0] === `/api/classes/${CLASS.id}/subject-assignments`,
    ).length).toBeGreaterThan(1)
  })
})

describe("Subject Teachers modal — subjects fetch fails", () => {
  it("shows an inline failure message while the assignments list still renders", async () => {
    mockApi({
      assignments: [
        {
          id: 5,
          teacherId: 100,
          subjectId: 1,
          classId: 1,
          teacher: { id: 100, user: { email: "teacher1@edu.com" } },
          subject: { id: 1, name: "Math" },
        },
      ],
      subjectsOk: false,
    })
    await openAssignmentsModal()

    expect(await screen.findByText("Failed to load subjects")).toBeInTheDocument()
    expect(screen.getByText("teacher1@edu.com")).toBeInTheDocument()
  })
})
