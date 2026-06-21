"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Resizable two-pane split (LeetCode-style). Horizontal drag on lg+, stacked on
// mobile. Persists the divider position.
export function SplitPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  const [pct, setPct] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("splitPct");
    if (saved) setPct(Math.min(75, Math.max(25, parseFloat(saved))));
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const p = Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100));
      setPct(p);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("splitPct", String(pct));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pct]);

  function startDrag() {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        style={{ width: `${pct}%` }}
        className="h-[55vh] min-h-0 overflow-hidden border-b border-border max-lg:!w-full lg:h-auto lg:border-b-0 lg:border-r"
      >
        {left}
      </div>

      {/* Drag handle (desktop only) */}
      <div
        onMouseDown={startDrag}
        className="group hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-transparent hover:bg-accent/20 lg:flex"
        title="Drag to resize"
      >
        <div className="h-8 w-0.5 rounded bg-border group-hover:bg-accent" />
      </div>

      <div className="h-[62vh] min-h-0 flex-1 overflow-hidden p-3 lg:h-auto">
        {right}
      </div>
    </div>
  );
}
