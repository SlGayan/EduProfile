import { describe, it, expect } from "vitest"
import { toDateInputValue, formatDateRange, extractApiError } from "../activities"

describe("toDateInputValue", () => {
  it("converts an API ISO datetime to a YYYY-MM-DD value", () => {
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

  it("renders Ongoing when endDate is an unparseable value", () => {
    expect(formatDateRange("2026-01-15T00:00:00.000Z", "not-a-date")).toBe("2026-01-15 – Ongoing")
  })
})

describe("extractApiError", () => {
  it("returns a plain error string", () => {
    expect(extractApiError({ error: "Not authorized" }, "fallback")).toBe("Not authorized")
  })

  it("prefixes a Zod issue with its field name", () => {
    const body = { error: "Invalid input", details: [{ path: ["activityName"], message: "Must be 255 characters or fewer" }] }
    expect(extractApiError(body, "fallback")).toBe("activityName: Must be 255 characters or fewer")
  })

  it("does not double up when the message already names the field", () => {
    const body = { error: "Invalid input", details: [{ path: ["endDate"], message: "endDate must be on or after startDate" }] }
    expect(extractApiError(body, "fallback")).toBe("endDate must be on or after startDate")
  })

  it("falls back when the body has neither error nor details", () => {
    expect(extractApiError({}, "fallback")).toBe("fallback")
  })

  it("falls back for a non-object body", () => {
    expect(extractApiError(null, "fallback")).toBe("fallback")
    expect(extractApiError(undefined, "fallback")).toBe("fallback")
  })
})
