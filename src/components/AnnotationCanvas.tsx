import { useRef, useState } from "react";
import type { AnnotationShape } from "../api";

/**
 * SVG editor that overlays freehand / ellipse / arrow / text shapes on
 * an input image. Coordinates are normalized 0..1 against the displayed
 * image so the same shapes render correctly at any container size and
 * inside the PDF (which uses the same viewBox).
 *
 * Controlled: parent owns `value` (the shape list) and `onChange`. In
 * `readOnly` mode the editor renders shapes without binding pointer
 * events — used for showing other matches' annotations passively.
 */

export type Tool = "pen" | "ellipse" | "arrow" | "text";

const STROKE_COLOR = "#dc2626"; // red-600
const STROKE_WIDTH = 3;
const TEXT_SIZE = 14;

export function AnnotationCanvas({
  src,
  value,
  onChange,
  tool,
  readOnly = false,
}: {
  src: string;
  value: AnnotationShape[];
  onChange?: (next: AnnotationShape[]) => void;
  tool?: Tool;
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<
    | { kind: "pen"; points: [number, number][] }
    | { kind: "ellipse"; start: [number, number]; end: [number, number] }
    | { kind: "arrow"; start: [number, number]; end: [number, number] }
    | null
  >(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; text: string } | null>(null);

  function ptFromEvent(e: React.PointerEvent): [number, number] | null {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || !tool || !onChange) return;
    if (textDraft) return;
    const p = ptFromEvent(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "pen") setDrag({ kind: "pen", points: [p] });
    else if (tool === "ellipse") setDrag({ kind: "ellipse", start: p, end: p });
    else if (tool === "arrow") setDrag({ kind: "arrow", start: p, end: p });
    else if (tool === "text") setTextDraft({ x: p[0], y: p[1], text: "" });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = ptFromEvent(e);
    if (!p) return;
    if (drag.kind === "pen") setDrag({ kind: "pen", points: [...drag.points, p] });
    else setDrag({ ...drag, end: p });
  }

  function onPointerUp() {
    if (!drag || !onChange) {
      setDrag(null);
      return;
    }
    if (drag.kind === "pen") {
      if (drag.points.length >= 2) {
        onChange([
          ...value,
          { kind: "pen", points: drag.points, color: STROKE_COLOR, width: STROKE_WIDTH },
        ]);
      }
    } else if (drag.kind === "ellipse") {
      const [x1, y1] = drag.start;
      const [x2, y2] = drag.end;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      if (rx > 0.01 && ry > 0.01) {
        onChange([
          ...value,
          { kind: "ellipse", cx, cy, rx, ry, color: STROKE_COLOR, width: STROKE_WIDTH },
        ]);
      }
    } else if (drag.kind === "arrow") {
      const [x1, y1] = drag.start;
      const [x2, y2] = drag.end;
      if (Math.hypot(x2 - x1, y2 - y1) > 0.02) {
        onChange([
          ...value,
          { kind: "arrow", x1, y1, x2, y2, color: STROKE_COLOR, width: STROKE_WIDTH },
        ]);
      }
    }
    setDrag(null);
  }

  function commitText() {
    if (!textDraft || !onChange) return;
    const t = textDraft.text.trim();
    if (t) {
      onChange([
        ...value,
        { kind: "text", x: textDraft.x, y: textDraft.y, text: t, color: STROKE_COLOR, size: TEXT_SIZE },
      ]);
    }
    setTextDraft(null);
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none"
      style={{ touchAction: "none" }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="block w-full h-full object-contain bg-stone-50 border border-stone-200 rounded-lg"
      />
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={`absolute inset-0 w-full h-full ${readOnly || !tool ? "pointer-events-none" : "cursor-crosshair"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {value.map((s, i) => (
          <ShapeNode key={i} s={s} />
        ))}
        {drag && drag.kind === "pen" && (
          <ShapeNode
            s={{ kind: "pen", points: drag.points, color: STROKE_COLOR, width: STROKE_WIDTH }}
          />
        )}
        {drag && drag.kind === "ellipse" && (() => {
          const [x1, y1] = drag.start;
          const [x2, y2] = drag.end;
          return (
            <ShapeNode
              s={{
                kind: "ellipse",
                cx: (x1 + x2) / 2,
                cy: (y1 + y2) / 2,
                rx: Math.abs(x2 - x1) / 2,
                ry: Math.abs(y2 - y1) / 2,
                color: STROKE_COLOR,
                width: STROKE_WIDTH,
              }}
            />
          );
        })()}
        {drag && drag.kind === "arrow" && (
          <ShapeNode
            s={{
              kind: "arrow",
              x1: drag.start[0],
              y1: drag.start[1],
              x2: drag.end[0],
              y2: drag.end[1],
              color: STROKE_COLOR,
              width: STROKE_WIDTH,
            }}
          />
        )}
      </svg>
      {textDraft && (
        <input
          autoFocus
          value={textDraft.text}
          onChange={(e) => setTextDraft({ ...textDraft, text: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText();
            if (e.key === "Escape") setTextDraft(null);
          }}
          className="absolute bg-white/95 border border-red-400 rounded px-1 text-xs text-red-700 outline-none"
          style={{
            left: `${textDraft.x * 100}%`,
            top: `${textDraft.y * 100}%`,
            transform: "translate(-2px, -2px)",
            minWidth: 80,
          }}
          placeholder="text…"
        />
      )}
    </div>
  );
}

function ShapeNode({ s }: { s: AnnotationShape }) {
  const sw = (w: number) => Math.max(0.003, w * 0.0025);
  if (s.kind === "pen") {
    if (s.points.length < 2) return null;
    const d = s.points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
    return (
      <path d={d} stroke={s.color} strokeWidth={sw(s.width)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    );
  }
  if (s.kind === "ellipse") {
    return (
      <ellipse
        cx={s.cx}
        cy={s.cy}
        rx={Math.max(0, s.rx)}
        ry={Math.max(0, s.ry)}
        stroke={s.color}
        strokeWidth={sw(s.width)}
        fill="none"
      />
    );
  }
  if (s.kind === "arrow") {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = 0.04;
    const hx1 = s.x2 - ux * head - uy * head * 0.5;
    const hy1 = s.y2 - uy * head + ux * head * 0.5;
    const hx2 = s.x2 - ux * head + uy * head * 0.5;
    const hy2 = s.y2 - uy * head - ux * head * 0.5;
    return (
      <g>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={sw(s.width)} strokeLinecap="round" />
        <polygon points={`${s.x2},${s.y2} ${hx1},${hy1} ${hx2},${hy2}`} fill={s.color} />
      </g>
    );
  }
  if (s.kind === "text") {
    return (
      <text
        x={s.x}
        y={s.y}
        fill={s.color}
        fontSize={0.04}
        fontFamily="ui-sans-serif, system-ui"
        dominantBaseline="hanging"
      >
        {s.text}
      </text>
    );
  }
  return null;
}
