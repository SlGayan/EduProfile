import { describe, it, expect } from "vitest"
import { toDateInputValue, formatDateRange, extractApiError, canManageActivities } from "../activities"

describe("canManageActivities", () => {
  it("allows teachers and admins — the roles the API accepts", () => {
    expect(canManageActivities("teacher")).toBe(true)
    expect(canManageActivities("admin")).toBe(true)
  })

  it("excludes principals, who can search students but would get a 403 here", () => {
    expect(canManageActivities("principal")).toBe(false)
  })

  it("excludes students and logged-out users", () => {
    expect(canManageActivities("student")).toBe(false)
    expect(canManageActivities(undefined)).toBe(false)
    expect(canManageActivities(null)).toBe(false)
  })

  it("does not accept the uppercase Prisma enum spelling", () => {
    expect(canManageActivities("ADMINISTRATOR")).toBe(false)
    expect(canManageActivities("TEACHER")).toBe(false)
  })
})

describe("toDateInputValue", () => {
  it("converts an API ISO datetime to a YYYY-MM-DD input value", () => {
    expect(toDateInputValue("2026-01-15T00:00:00.000Z")).toBe("2026-01-15")
  })

  it("returns an empty string for null", () => {
    expect(toDateInputValue(null)).toBe("")
  })

  it("returns an empty string for an unparseable value", () => {
    expect(toDateInputValue("not-a-date")).toBe("")
  })

  it("is a no-op for a value already in YYYY-MM-DD form", () => {
    expect(toDateInputValue("2026-03-10")).toBe("2026-03-10")
  })
})

describe("formatDateRange", () => {
  it("renders a closed range", () => {
    expect(formatDateRange("2026-01-15T00:00:00.000Z", "2026-06-15T00:00:00.000Z")).toBe(
      "2026-01-15 – 2026-06-15",
    )
  })

  it("renders an open-ended range as Ongoing", () => {
    expect(formatDateRange("2026-01-15T00:00:00.000Z", null)).toBe("2026-01-15 – Ongoing")
  })
})

describe("extractApiError", () => {
  it("returns the plain error string from the API", () => {
    expect(
      extractApiError({ error: "You do not have permission to manage activities for this student" }, "fallback"),
    ).toBe("You do not have permission to manage activities for this student")
  })

  it("surfaces the first Zod issue message instead of the generic 'Invalid input'", () => {
    const body = {
      error: "Invalid input",
      details: [
        { code: "custom", path: ["endDate"], message: "endDate must be on or after startDate" },
      ],
    }
    expect(extractApiError(body, "fallback")).toBe("endDate must be on or after startDate")
  })

  it("falls back when details is present but empty", () => {
    expect(extractApiError({ error: "Invalid input", details: [] }, "fallback")).toBe("Invalid input")
  })

  it("uses the fallback when the body is null (non-JSON response)", () => {
    expect(extractApiError(null, "Failed to load activities")).toBe("Failed to load activities")
  })

  it("uses the fallback when the body has no error field", () => {
    expect(extractApiError({ something: "else" }, "Failed to load activities")).toBe(
      "Failed to load activities",
    )
  })

  it("prefixes the Zod issue with its field path when the path is meaningful", () => {
    const body = {
      error: "Invalid input",
      details: [{ code: "too_big", path: ["activityName"], message: "Must be 255 characters or fewer" }],
    }
    expect(extractApiError(body, "fallback")).toBe("activityName: Must be 255 characters or fewer")
  })
})
