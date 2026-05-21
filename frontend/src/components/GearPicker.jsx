import React, { useEffect, useRef, useCallback, useState } from "react";

// Konstanten außerhalb der Komponente -> stabile Referenzen
const VALUES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const ITEM_H = 18;   // kompakte Zahnhöhe
const VISIBLE = 3;   // 3 sichtbare Items
const HEIGHT = ITEM_H * VISIBLE;

const clamp = (n) => Math.max(1, Math.min(10, n));

/**
 * GearPicker (kompakt, dezent).
 * - Werte 1..10, 10 oben, 1 unten
 * - Mini-Format: passt rechts neben einen Input
 * - Hover: die Zähne animieren sich von alleine (subtle spin)
 * - Bedienbar: Scroll, Drag, Mausrad, Click, Tastatur Pfeil hoch/runter
 * - navigator.vibrate beim Snap (Mobile)
 */
export default function GearPicker({ value = 10, onChange, color = "#CCFF00", testid = "gear" }) {
  const scrollerRef = useRef(null);
  const lastEmittedRef = useRef(value);
  const dragRef = useRef({ active: false, startY: 0, startScroll: 0 });
  const [hover, setHover] = useState(false);

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
      data-testid={testid}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        width: 44,
        height: HEIGHT,
        userSelect: "none",
        outline: "none",
      }}
    >
      <style>{`
        @keyframes gp-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      {/* Center-Marker > < */}
      <div
        style={{
          position: "absolute",
          top: ITEM_H,
          left: 0,
          width: "100%",
          height: ITEM_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pointerEvents: "none",
          color,
          fontSize: 10,
          opacity: 0.7,
          padding: "0 2px",
        }}
      >
        <span>&gt;</span>
        <span>&lt;</span>
      </div>

      {/* Fade oben + unten */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.6) 100%)",
          zIndex: 2,
        }}
      />

      {/* Scroll-Container */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        style={{
          height: HEIGHT,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          cursor: "ns-resize",
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
                lineHeight: `${ITEM_H}px`,
                textAlign: "center",
                fontSize: 12,
                fontWeight: active ? 700 : 400,
                color: active ? color : "rgba(255,255,255,0.55)",
                scrollSnapAlign: "center",
                transition: "color 120ms ease",
                animation: hover ? "gp-spin 6s linear infinite" : "none",
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
