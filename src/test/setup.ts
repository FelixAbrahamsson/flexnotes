import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't implement ResizeObserver; components use it for layout.
globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

// jsdom textareas report 0 scrollHeight; stub it so auto-resize logic is inert.
if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return 0
    },
  })
}

// Unmount React trees between tests to avoid cross-test DOM leakage.
afterEach(() => {
  cleanup()
  vi.clearAllTimers()
})
