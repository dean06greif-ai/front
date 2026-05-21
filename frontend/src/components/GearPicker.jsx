import React, { useEffect, useRef, useCallback, useState } from "react";

/**
 * GearPicker (kompakt, dezent).
 * - Werte 1..10, 10 oben, 1 unten
 * - Mini-Format: passt rechts neben einen Input
 * - Hover: die Zähne animieren sich von alleine (subtle spin)
 * - Bedienbar: Scroll, Drag, Mausrad, Click, Tastatur ↑/↓
 * - navigator.vibrate beim Snap (Mobile)
 */
export default function GearPicker({ value = 10, onChange, color = "#CCFF00", testid = "gear" }) {
  const VALUES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const ITEM_H = 18;                 // kompakte Zahnhöhe
  const VISIBLE = 3;                 // 3 sichtbare Items
  const HEIGHT = ITEM_H * VISIBLE;
  const scrollerRef = useRef(null);
  const lastEmittedRef = useRef(value);
  const dragRef = useRef({ active: false, startY: 0, startScroll: 0 });
  const [hover, setHover] = useState(false);

  const clamp = (n) => Math.max(1, Math.min(10, n));

  const scrollToValue = useCallback((scrollTop) => {
    const idx = Math.round(scrollTop / ITEM_H);
    return VALUES[Math.max(0, Math.min(VALUES.length - 1, idx))];
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = VALUES.indexOf(clamp(value));
    if (idx < 0) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    lastEmittedRef.current = clamp(value);
  }, [value]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = scrollToValue(el.scrollTop);
    if (next !== lastEmittedRef.current) {
      lastEmittedRef.current = next;
      if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
      onChange?.(next);
    }
  }, [onChange, scrollToValue]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const el = scrollerRef.current;
    if (!el) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    el.scrollTo({ top: el.scrollTop + dir * ITEM_H, behavior: "smooth" });
  }, []);

  const onMouseDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { active: true, startY: e.clientY, startScroll: el.scrollTop };
    document.body.style.cursor = "ns-resize";
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current.active) return;
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollTop = dragRef.current.startScroll - (e.clientY - dragRef.current.startY);
    };
    const onUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      document.body.style.cursor = "";
      const el = scrollerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      el.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onKeyDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (e.key === "ArrowUp")   { e.preventDefault(); el.scrollTo({ top: Math.max(0, el.scrollTop - ITEM_H), behavior: "smooth" }); }
    if (e.key === "ArrowDown") { e.preventDefault(); el.scrollTo({ top: el.scrollTop + ITEM_H, behavior: "smooth" }); }
  };

  return (
    <div
      className="relative select-none"
      style={{ width: 38, height: HEIGHT }}
      data-testid={`${testid}-wrapper`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Inline keyframes für Hover-Spin der seitlichen Zähne */}
      <style>{`
        @keyframes gp-spin-${testid} {
          0%   { background-position: 0 0; }
          100% { background-position: 0 ${ITEM_H}px; }
        }
        .gp-hide-${testid}::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Linke Zähne */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 left-0 pointer-events-none"
        style={{
          width: 3,
          backgroundImage: `repeating-linear-gradient(to bottom, ${color}66 0 2px, transparent 2px 6px)`,
          animation: hover ? `gp-spin-${testid} 700ms linear infinite` : "none",
          opacity: hover ? 0.9 : 0.4,
          transition: "opacity 200ms",
        }}
      />
      {/* Rechte Zähne */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 right-0 pointer-events-none"
        style={{
          width: 3,
          backgroundImage: `repeating-linear-gradient(to bottom, ${color}66 0 2px, transparent 2px 6px)`,
          animation: hover ? `gp-spin-${testid} 700ms linear infinite reverse` : "none",
          opacity: hover ? 0.9 : 0.4,
          transition: "opacity 200ms",
        }}
      />

      {/* Center-Marker > < */}
      <div
        aria-hidden
        className="absolute left-0 right-0 z-20 pointer-events-none flex items-center justify-between"
        style={{ top: ITEM_H, height: ITEM_H, paddingLeft: 3, paddingRight: 3 }}
      >
        <span style={{ color, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>&gt;</span>
        <span style={{ color, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>&lt;</span>
      </div>

      {/* Fade oben + unten */}
      <div aria-hidden className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
           style={{ height: ITEM_H, background: "linear-gradient(to bottom, #0A0A0A 0%, rgba(10,10,10,0) 100%)" }} />
      <div aria-hidden className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
           style={{ height: ITEM_H, background: "linear-gradient(to top, #0A0A0A 0%, rgba(10,10,10,0) 100%)" }} />

      {/* Scroll-Container */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Wöchentliche Steigerung in Prozent"
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={clamp(value)}
        data-testid={`${testid}-scroller`}
        className={`absolute inset-0 overflow-y-scroll outline-none cursor-ns-resize gp-hide-${testid}`}
        style={{
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ height: ITEM_H }} />
        {VALUES.map((n) => {
          const active = n === clamp(value);
          return (
            <div
              key={n}
              data-testid={`${testid}-item-${n}`}
              style={{
                height: ITEM_H,
                scrollSnapAlign: "center",
                scrollSnapStop: "always",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Anton, Impact, sans-serif",
                fontSize: active ? 13 : 11,
                fontWeight: 700,
                color: active ? color : "#555",
                textShadow: active ? `0 0 6px ${color}88` : "none",
                transition: "color 120ms, font-size 120ms",
                userSelect: "none",
              }}
            >
              {n}
            </div>
          );
        })}
        <div style={{ height: ITEM_H }} />
      </div>
    </div>
  );
}
