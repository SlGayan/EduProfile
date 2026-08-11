import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AppSidebar } from "@/components/app-sidebar"

/**
 * Closes Story 8.4 subtask 6.5.
 *
 * This one cannot be verified by fetching the page's HTML at all: AppSidebar
 * server-renders the TEACHER nav by default and only swaps to the student nav
 * client-side, from localStorage. Rendering it directly in jsdom is the only
 * way to assert the student entry short of a real browser.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/student/activities",
}))

// getCurrentUser reads localStorage, which the vitest setup stubs empty — it
// returns null, so the `role` prop is what decides the nav. Mocked explicitly
// so the test does not depend on that indirection.
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => null,
}))

describe("AppSidebar — student navigation (subtask 6.5)", () => {
  it("shows My Activities linking to /student/activities", () => {
    render(<AppSidebar role="student" />)

    const link = screen.getByRole("link", { name: /my activities/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/student/activities")
  })

  it("keeps the existing student entries alongside it", () => {
    render(<AppSidebar role="student" />)

    expect(screen.getByRole("link", { name: /my profile/i })).toHaveAttribute(
      "href",
      "/student/profile",
    )
    expect(screen.getByRole("link", { name: /my marks/i })).toHaveAttribute(
      "href",
      "/student/marks",
    )
  })

  it("does not leak My Activities into the teacher nav", () => {
    render(<AppSidebar role="teacher" />)

    expect(screen.queryByRole("link", { name: /my activities/i })).not.toBeInTheDocument()
  })

  it("does not leak My Activities into the admin or principal nav", () => {
    const { unmount } = render(<AppSidebar role="admin" />)
    expect(screen.queryByRole("link", { name: /my activities/i })).not.toBeInTheDocument()
    unmount()

    render(<AppSidebar role="principal" />)
    expect(screen.queryByRole("link", { name: /my activities/i })).not.toBeInTheDocument()
  })
})
