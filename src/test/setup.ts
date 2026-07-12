import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver, which cmdk (via Radix) subscribes to on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom does not implement scrollIntoView, which cmdk calls to keep the active
// item in view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
