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

/**
 * Story 10.2, Task 4.1 and 4.2.
 *
 * Same reasoning as above: AppSidebar server-renders the teacher nav and swaps
 * client-side from localStorage, so a fetched HTML page proves nothing about
 * which role sees what. Rendering directly is the only real check.
 */
describe("AppSidebar — Story 10.2 analytics entry", () => {
  it("gives the teacher a link to /teacher/analytics", () => {
    render(<AppSidebar role="teacher" />)

    expect(screen.getByRole("link", { name: /analytics/i })).toHaveAttribute(
      "href",
      "/teacher/analytics",
    )
  })

  it("keeps the existing Class Marks link alongside it", () => {
    render(<AppSidebar role="teacher" />)

    expect(screen.getByRole("link", { name: /class marks/i })).toHaveAttribute(
      "href",
      "/teacher/class-marks",
    )
  })

  // Story 10.2 originally deferred the principal entry to Story 10.4 and this
  // test pinned its absence. That review decision was resolved by taking option
  // (b) — add the entry now — because the page was otherwise reachable only by
  // typing the URL. Repointing the /principal/reports and /admin/reports links
  // remains Story 10.4's job.
  it("gives the principal a link to /principal/analytics", () => {
    render(<AppSidebar role="principal" />)

    expect(screen.getByRole("link", { name: /analytics/i })).toHaveAttribute(
      "href",
      "/principal/analytics",
    )
  })

  it("keeps the principal's other entries alongside it", () => {
    render(<AppSidebar role="principal" />)

    // "Reports" was removed by Story 10.4 — Analytics (asserted above) already
    // covers it, and a link to the same URL twice would be redundant.
    for (const label of [/dashboard/i, /class management/i, /search students/i]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument()
    }
  })

  it("still does not add an analytics entry to the admin nav", () => {
    render(<AppSidebar role="admin" />)

    // ADMINISTRATOR is authorised by the API but blocked from /principal/* by
    // middleware.ts, so an admin has no reachable analytics page. Tracked as an
    // open decision on Story 10.2, deliberately not resolved here.
    expect(screen.queryByRole("link", { name: /analytics/i })).not.toBeInTheDocument()
  })

  it("does not leak the analytics entry into the student nav", () => {
    render(<AppSidebar role="student" />)

    expect(screen.queryByRole("link", { name: /analytics/i })).not.toBeInTheDocument()
  })
})

/**
 * Story 10.4, Task 3.
 *
 * The principal's Reports entry pointed at /principal/reports, a page that
 * never existed — Analytics already covers it, so Reports is removed rather
 * than duplicated. Dashboard, Settings and Reports were removed from the
 * admin nav: /admin/dashboard and /admin/settings point to pages no epic
 * covers, and /admin/reports would have to point at /principal/analytics,
 * which middleware.ts blocks the admin role from reaching.
 */
describe("AppSidebar — Story 10.4 nav cleanup", () => {
  it("gives the principal exactly one link to the reports/analytics URL", () => {
    render(<AppSidebar role="principal" />)

    const matches = screen.getAllByRole("link", { name: /reports|analytics/i })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toHaveAttribute("href", "/principal/analytics")
  })

  it("removes Dashboard, Settings and Reports from the admin nav", () => {
    render(<AppSidebar role="admin" />)

    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /reports/i })).not.toBeInTheDocument()
  })

  it("keeps the admin's remaining entries", () => {
    render(<AppSidebar role="admin" />)

    for (const [label, href] of [
      [/user management/i, "/admin/users"],
      [/class management/i, "/admin/classes"],
      [/search students/i, "/admin/search-students"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href)
    }
  })
})
