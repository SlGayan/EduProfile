import { describe, it, expect } from "vitest"
import { extractApiError, formatFileSize } from "../materials"

describe("extractApiError", () => {
  it("returns a plain error string", () => {
    expect(extractApiError({ error: "Class not found" }, "fallback")).toBe("Class not found")
  })

  it("returns the first Zod issue's message when details are present", () => {
    const body = {
      error: "Invalid input",
      details: [{ message: "title is required" }, { message: "classId must be a whole number" }],
    }
    expect(extractApiError(body, "fallback")).toBe("title is required")
  })

  it("falls back to the plain error when details is present but empty", () => {
    const body = { error: "Invalid input", details: [] }
    expect(extractApiError(body, "fallback")).toBe("Invalid input")
  })

  it("returns the fallback for a non-JSON / unexpected body", () => {
    expect(extractApiError(undefined, "fallback")).toBe("fallback")
    expect(extractApiError(null, "fallback")).toBe("fallback")
    expect(extractApiError("plain string body", "fallback")).toBe("fallback")
  })

  it("returns the fallback when neither error nor details are usable", () => {
    expect(extractApiError({}, "fallback")).toBe("fallback")
    expect(extractApiError({ details: [{ notMessage: "x" }] }, "fallback")).toBe("fallback")
  })
})

describe("formatFileSize", () => {
  it("formats bytes under 1KB", () => {
    expect(formatFileSize(500)).toBe("500 B")
  })

  it("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB")
  })

  it("formats megabytes", () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB")
  })

  it("handles the 1KB boundary", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB")
  })

  it("handles the 1MB boundary", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB")
  })
})
