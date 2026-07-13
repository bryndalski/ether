import { useCallback, useRef } from "react";

export type ResizeAxis = "x" | "y";

interface UseDragResizeOptions {
  /** Which axis the handle drags along: "x" for width, "y" for height. */
  axis: ResizeAxis;
  /** Current committed value (px or %), used as the drag origin. */
  value: number;
  /** Translate a pointer delta (px) into the next value; caller clamps. */
  toValue: (startValue: number, deltaPx: number) => number;
  /** Commit a new value (store setter). */
  onChange: (next: number) => void;
  /** Double-click resets to the default. */
  onReset: () => void;
}

interface DragResizeApi {
  /** Spread onto the handle element. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onDoubleClick: () => void;
    role: "separator";
    "aria-orientation": "vertical" | "horizontal";
    tabIndex: 0;
  };
  /** True while a drag is in progress (for a handle "active" style). */
}

/**
 * Pointer-driven resize for a panel edge. The value is committed straight to the
 * store setter on every move — the store writes a single CSS-consumed number, so
 * only the panel reading that value re-renders, never the whole tree. Pointer
 * capture keeps the drag alive outside the handle; double-click resets.
 */
export function useDragResize({
  axis,
  value,
  toValue,
  onChange,
  onReset,
}: UseDragResizeOptions): DragResizeApi["handleProps"] {
  const startRef = useRef({ pointer: 0, value: 0 });

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const current = axis === "x" ? event.clientX : event.clientY;
      const deltaPx = current - startRef.current.pointer;
      onChange(toValue(startRef.current.value, deltaPx));
    },
    [axis, toValue, onChange],
  );

  const onPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      startRef.current = {
        pointer: axis === "x" ? event.clientX : event.clientY,
        value,
      };
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [axis, value, onPointerMove, onPointerUp],
  );

  return {
    onPointerDown,
    onDoubleClick: onReset,
    role: "separator",
    "aria-orientation": axis === "x" ? "vertical" : "horizontal",
    tabIndex: 0,
  };
}
