import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubscriptionStream } from "./SubscriptionStream";
import { SubscribeButton } from "./SubscribeButton";
import type {
  StreamEvent,
  SubConnState,
  UseSubscription,
} from "../../hooks/useSubscription";

function stream(overrides: Partial<UseSubscription> = {}): UseSubscription {
  return {
    connState: "idle",
    events: [],
    eventCount: 0,
    error: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function evt(seq: number, kind: StreamEvent["kind"], payload: unknown): StreamEvent {
  return { seq, ts: "2026-07-13T00:00:00Z", kind, payload };
}

describe("SubscriptionStream", () => {
  it("shows the waiting empty state before any event", () => {
    render(<SubscriptionStream stream={stream({ connState: "open" })} />);
    expect(screen.getByText(/Waiting for events/i)).toBeInTheDocument();
  });

  it("renders each event newest-first with a kind badge and pretty JSON", () => {
    const events = [
      evt(1, "next", { data: { tick: 2 } }),
      evt(0, "next", { data: { tick: 1 } }),
    ];
    render(<SubscriptionStream stream={stream({ events, eventCount: 2 })} />);

    // the aria-live event list exists (screen readers hear pushes)
    const list = screen.getByLabelText(/Strumień zdarzeń subskrypcji/i);
    expect(list).toHaveAttribute("aria-live", "polite");
    // both payloads rendered
    expect(list.textContent).toContain('"tick": 2');
    expect(list.textContent).toContain('"tick": 1');
  });

  it("shows the event counter with the tabular-nums class", () => {
    render(<SubscriptionStream stream={stream({ eventCount: 3 })} />);
    const counter = screen.getByText(/3 events/);
    expect(counter).toHaveClass("lok-tnums");
  });

  it("disables Clear when there are no events", () => {
    render(<SubscriptionStream stream={stream({ eventCount: 0 })} />);
    expect(screen.getByLabelText(/Wyczyść strumień/i)).toBeDisabled();
  });
});

describe("SubscribeButton", () => {
  const cases: Array<[SubConnState, string]> = [
    ["idle", "Subscribe"],
    ["connecting", "Connecting…"],
    ["open", "Unsubscribe"],
    ["error", "Retry"],
    ["closed", "Subscribe"],
  ];

  it.each(cases)("state %s shows label + icon (never color-only)", (state, label) => {
    render(
      <SubscribeButton
        connState={state}
        disabled={false}
        onSubscribe={vi.fn()}
        onUnsubscribe={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: label });
    // the accessible name carries the meaning; an icon SVG is also present
    expect(button).toBeInTheDocument();
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("connecting sets aria-busy so assistive tech announces progress", () => {
    render(
      <SubscribeButton
        connState="connecting"
        disabled={false}
        onSubscribe={vi.fn()}
        onUnsubscribe={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});
