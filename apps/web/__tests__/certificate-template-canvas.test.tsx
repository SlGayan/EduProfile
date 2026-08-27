import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CertificateTemplateCanvas } from "@/app/(main)/admin/certificate-templates/certificate-template-canvas"
import type { CertificateTemplate } from "@/lib/certificateTemplates"

/**
 * Regression test for the hydrate-once guard: a background refetch of the
 * template query (e.g. window refocus) must not clobber unsaved edits made
 * on the canvas since the initial load.
 */

const apiFetchMock = vi.fn()
vi.mock("@/lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

const BASE_TEMPLATE: CertificateTemplate = {
  id: 1,
  name: "Original Name",
  layoutData: { canvasWidth: 850, canvasHeight: 600, fields: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { email: "admin@edu.com" },
}

function renderCanvas() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CertificateTemplateCanvas templateId={1} onSaved={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe("CertificateTemplateCanvas — hydrate-once guard", () => {
  it("keeps unsaved edits after a background refetch returns a changed server copy", async () => {
    // React Query's structural sharing reuses the old data reference when a
    // refetch's content is deep-equal to what's cached, so a refetch that
    // returns byte-identical content can't exercise the effect's dependency
    // array at all. Returning a server value that has since changed (e.g.
    // another admin edited it, or the initial load simply completed after
    // the user started typing) is what actually produces a new `data`
    // reference and is the realistic trigger for this bug.
    let callCount = 0
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/certificate-templates/1") {
        callCount += 1
        const name = callCount === 1 ? "Original Name" : "Original Name (server update)"
        return Promise.resolve(jsonResponse({ template: { ...BASE_TEMPLATE, name } }))
      }
      return Promise.resolve(jsonResponse(null, false, 404))
    })

    const client = renderCanvas()
    const nameInput = await screen.findByDisplayValue("Original Name")

    const user = userEvent.setup()
    await user.clear(nameInput)
    await user.type(nameInput, "In-progress edit")
    expect(nameInput).toHaveValue("In-progress edit")

    // Simulate a background refetch (e.g. window refocus) whose response
    // differs from the data the form was originally hydrated from. Wrapped
    // in act() so the resulting state update (if the guard is missing)
    // actually commits before we assert on the rendered input value.
    await act(async () => {
      await client.refetchQueries({ queryKey: ["certificateTemplate", 1], type: "all" })
    })
    await waitFor(() => expect(callCount).toBe(2))
    // The query-observer notification lands in a separate microtask/timer
    // after refetchQueries' own promise resolves, so poll for the settled
    // DOM instead of asserting immediately (which would race a real bug
    // here into a false pass) or sleeping a fixed duration (flaky under
    // load). If the guard regresses, this fails once the retries expire.
    await waitFor(() => {
      expect(screen.getByDisplayValue("In-progress edit")).toBeInTheDocument()
    })
    expect(screen.queryByDisplayValue("Original Name (server update)")).not.toBeInTheDocument()
  })

  it("keeps unsaved field edits after a background refetch returns a changed server copy", async () => {
    const initialField = {
      id: "field-1",
      kind: "text" as const,
      text: "Server text",
      x: 10,
      y: 10,
      width: 170,
      height: 60,
    }
    let callCount = 0
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/certificate-templates/1") {
        callCount += 1
        const fields = callCount === 1 ? [initialField] : [{ ...initialField, text: "Server text (updated)" }]
        return Promise.resolve(
          jsonResponse({ template: { ...BASE_TEMPLATE, layoutData: { ...BASE_TEMPLATE.layoutData, fields } } }),
        )
      }
      return Promise.resolve(jsonResponse(null, false, 404))
    })

    const client = renderCanvas()
    const fieldText = await screen.findByText("Server text")

    const user = userEvent.setup()
    await user.dblClick(fieldText)
    const textarea = await screen.findByDisplayValue("Server text")
    await user.clear(textarea)
    await user.type(textarea, "In-progress field edit")
    await user.tab() // blur commits the edit

    expect(await screen.findByText("In-progress field edit")).toBeInTheDocument()

    await act(async () => {
      await client.refetchQueries({ queryKey: ["certificateTemplate", 1], type: "all" })
    })
    await waitFor(() => expect(callCount).toBe(2))
    await waitFor(() => {
      expect(screen.getByText("In-progress field edit")).toBeInTheDocument()
    })
    expect(screen.queryByText("Server text (updated)")).not.toBeInTheDocument()
  })

  it("re-hydrates from the new template when templateId changes on an already-mounted canvas", async () => {
    const templates: Record<number, CertificateTemplate> = {
      1: { ...BASE_TEMPLATE, id: 1, name: "Template One" },
      2: { ...BASE_TEMPLATE, id: 2, name: "Template Two" },
    }
    apiFetchMock.mockImplementation((path: string) => {
      const match = path.match(/\/api\/certificate-templates\/(\d+)$/)
      if (match) {
        return Promise.resolve(jsonResponse({ template: templates[Number(match[1])] }))
      }
      return Promise.resolve(jsonResponse(null, false, 404))
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <CertificateTemplateCanvas templateId={1} onSaved={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>,
    )
    await screen.findByDisplayValue("Template One")

    rerender(
      <QueryClientProvider client={client}>
        <CertificateTemplateCanvas templateId={2} onSaved={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(await screen.findByDisplayValue("Template Two")).toBeInTheDocument()
  })
})
