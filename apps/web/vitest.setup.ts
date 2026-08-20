import { beforeEach, vi } from "vitest"

// Mock localStorage - must be defined before any imports
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => {
      const keys = Object.keys(store)
      return keys[index] || null
    },
  }
})()

// Setup localStorage mock globally before any tests run
if (typeof global !== "undefined") {
  Object.defineProperty(global, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
}

// Setup window.localStorage for JSDOM
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
}

// Mock window.matchMedia
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

/**
 * jsdom does not implement ResizeObserver, and recharts ResponsiveContainer
 * constructs one on mount, so any component rendering a chart throws
 * "ResizeObserver is not defined" before a single assertion runs.
 *
 * Added in Story 10.2, the first story in this repo to render a chart. The stub
 * reports no size, which is correct for jsdom: charts mount and their
 * surrounding markup is assertable, but the SVG has no dimensions, so do not
 * write assertions against chart geometry.
 */
if (typeof global !== "undefined" && !("ResizeObserver" in global)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(global, "ResizeObserver", {
    value: ResizeObserverStub,
    writable: true,
    configurable: true,
  })
}

// Clear localStorage before each test
beforeEach(() => {
  localStorageMock.clear()
})
