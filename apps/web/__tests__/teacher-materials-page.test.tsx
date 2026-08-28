import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TeacherMaterialsPage from "@/app/(main)/teacher/materials/page"

/** Radix Select drives pointer APIs jsdom does not implement. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

/**
 * Spec 9.3 AC #3: the Class dropdown on /teacher/materials must merge owned
 * classes (GET /api/teachers/me/classes) with subject-assigned classes
 * (GET /api/teachers/me/subject-assignments), deduplicated by class id, and
 * the materials list query must expand to cover both sources too.
 *
 * Mirrors the mocking pattern from teacher-dashboard-page.test.tsx:
 * vi.mock("@/lib/apiFetch") + path-based branching + QueryClientProvider.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
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
      <TeacherMaterialsPage />
    </QueryClientProvider>,
  )
}

interface MockOptions {
  classes?: unknown
  classesOk?: boolean
  subjects?: unknown
  subjectAssignments?: unknown
  subjectAssignmentsOk?: boolean
  materialsByClassId?: Record<string, unknown>
}

function mockApi({
  classes = [],
  classesOk = true,
  subjects = [],
  subjectAssignments = [],
  subjectAssignmentsOk = true,
  materialsByClassId = {},
}: MockOptions) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/teachers/me/classes")) {
      return Promise.resolve(jsonResponse(classes, classesOk, classesOk ? 200 : 500))
    }
    if (path.startsWith("/api/teachers/me/subject-assignments")) {
      return Promise.resolve(
        jsonResponse(subjectAssignments, subjectAssignmentsOk, subjectAssignmentsOk ? 200 : 500),
      )
    }
    if (path.startsWith("/api/subjects")) {
      return Promise.resolve(jsonResponse(subjects))
    }
    if (path.startsWith("/api/materials?classId=")) {
      const id = path.split("=")[1]
      return Promise.resolve(jsonResponse(materialsByClassId[id] ?? []))
    }
    return Promise.resolve(jsonResponse(null, false, 404))
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

async function openClassDropdown() {
  const user = userEvent.setup()
  await user.click(screen.getByLabelText("Class"))
  return user
}

describe("TeacherMaterialsPage — owned classes only (regression)", () => {
  it("shows exactly the owned classes when there are zero subject assignments", async () => {
    mockApi({
      classes: [{ id: "1", name: "Grade 10-A" }],
      subjectAssignments: [],
    })
    renderPage()

    await openClassDropdown()

    expect(await screen.findByRole("option", { name: "Grade 10-A" })).toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(2) // "No class" + Grade 10-A
  })
})

describe("TeacherMaterialsPage — subject-assigned only", () => {
  it("shows the subject-assigned class when the teacher owns no class", async () => {
    mockApi({
      classes: [],
      subjectAssignments: [
        { classId: "5", className: "Grade 9-C", subjectId: "2", subjectName: "Science" },
      ],
    })
    renderPage()

    await openClassDropdown()

    expect(await screen.findByRole("option", { name: "Grade 9-C" })).toBeInTheDocument()
  })

  it("lets the teacher select the subject-assigned class and drives the form to submittable", async () => {
    mockApi({
      classes: [],
      subjectAssignments: [
        { classId: "5", className: "Grade 9-C", subjectId: "2", subjectName: "Science" },
      ],
    })
    renderPage()

    const user = await openClassDropdown()
    await user.click(await screen.findByRole("option", { name: "Grade 9-C" }))

    // Selecting the subject-assigned class satisfies hasTarget on its own.
    expect(screen.queryByText("Select at least one of class or subject.")).not.toBeInTheDocument()

    await user.type(screen.getByLabelText("Title"), "My Material")
    const file = new File(["content"], "notes.pdf", { type: "application/pdf" })
    await user.upload(screen.getByLabelText("File"), file)

    expect(screen.getByRole("button", { name: /upload/i })).toBeEnabled()
  })
})

describe("TeacherMaterialsPage — both, no overlap", () => {
  it("shows the owned class and the subject-assigned class", async () => {
    mockApi({
      classes: [{ id: "1", name: "Grade 10-A" }],
      subjectAssignments: [
        { classId: "2", className: "Grade 10-B", subjectId: "3", subjectName: "Math" },
      ],
    })
    renderPage()

    await openClassDropdown()

    expect(await screen.findByRole("option", { name: "Grade 10-A" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Grade 10-B" })).toBeInTheDocument()
  })
})

describe("TeacherMaterialsPage — both, overlapping", () => {
  it("shows the class exactly once when owned and subject-assigned to the same class", async () => {
    mockApi({
      classes: [{ id: "1", name: "Grade 10-A" }],
      subjectAssignments: [
        { classId: "1", className: "Grade 10-A", subjectId: "3", subjectName: "Math" },
      ],
    })
    renderPage()

    await openClassDropdown()

    expect(await screen.findAllByRole("option", { name: "Grade 10-A" })).toHaveLength(1)
    // "No class" + Grade 10-A, not a duplicate
    expect(screen.getAllByRole("option")).toHaveLength(2)
  })
})

describe("TeacherMaterialsPage — subject-assignments query fails", () => {
  it("still shows owned classes and degrades gracefully instead of blanking the picker", async () => {
    mockApi({
      classes: [{ id: "1", name: "Grade 10-A" }],
      subjectAssignmentsOk: false,
    })
    renderPage()

    await openClassDropdown()

    expect(await screen.findByRole("option", { name: "Grade 10-A" })).toBeInTheDocument()
    expect(
      await screen.findByText(/failed to load subject-assigned classes/i),
    ).toBeInTheDocument()
  })
})

describe("TeacherMaterialsPage — materials list expands to subject-assigned classes", () => {
  it("shows materials uploaded to a subject-assigned class in the uploaded materials list", async () => {
    mockApi({
      classes: [],
      subjectAssignments: [
        { classId: "9", className: "Grade 8-A", subjectId: "4", subjectName: "English" },
      ],
      materialsByClassId: {
        "9": [
          {
            id: "m1",
            title: "Grammar Notes",
            description: null,
            fileUrl: "abc.pdf",
            fileType: "application/pdf",
            classId: "9",
            subjectId: null,
            uploadedBy: { id: "t1", name: "Teacher One" },
            createdAt: "2026-08-20T00:00:00.000Z",
          },
        ],
      },
    })
    renderPage()

    expect(await screen.findByText("Grammar Notes")).toBeInTheDocument()
    // "Grade 8-A" appears twice in the DOM even though the Select is closed:
    // Radix renders a visually-hidden native <select> (with a real <option>
    // per item, for form autofill/submission) alongside the visible trigger,
    // which still shows the "Select class" placeholder since classId is
    // "none". So a plain getByText is ambiguous — scope to the materials
    // table's Class/Subject cell, the only occurrence that reflects this
    // material actually being shown.
    expect(screen.getByRole("cell", { name: "Grade 8-A" })).toBeInTheDocument()
  })
})

describe("TeacherMaterialsPage — both class-list queries fail", () => {
  it("shows only the owned-classes failure message, not the subject-assignments one", async () => {
    mockApi({
      classesOk: false,
      subjectAssignmentsOk: false,
    })
    renderPage()

    expect(await screen.findByText("Failed to load classes.")).toBeInTheDocument()
    expect(
      screen.queryByText(/failed to load subject-assigned classes/i),
    ).not.toBeInTheDocument()
  })
})
