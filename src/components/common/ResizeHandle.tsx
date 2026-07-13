import { useDragResize, type ResizeAxis } from "../../hooks/useDragResize";
import "./resize-handle.css";

interface ResizeHandleProps {
  axis: ResizeAxis;
  value: number;
  toValue: (startValue: number, deltaPx: number) => number;
  onChange: (next: number) => void;
  onReset: () => void;
  ariaLabel: string;
}

/** A thin draggable divider (6-8px hit area, hover-highlighted) that resizes an
 *  adjacent panel. Vertical handles (axis="x") show col-resize; horizontal ones
 *  (axis="y") show row-resize. Double-click resets to the panel default. */
export function ResizeHandle({
  axis,
  value,
  toValue,
  onChange,
  onReset,
  ariaLabel,
}: ResizeHandleProps) {
  const handleProps = useDragResize({ axis, value, toValue, onChange, onReset });
  return (
    <div
      className={`lok-resize-handle lok-resize-handle--${axis}`}
      aria-label={ariaLabel}
      {...handleProps}
    >
      <span className="lok-resize-handle__grip" aria-hidden="true" />
    </div>
  );
}
