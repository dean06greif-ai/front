import React from "react";
import { PersonSimpleRun, PersonSimpleBike, PersonSimpleSwim, Barbell } from "@phosphor-icons/react";

// Stick-figure SVG icons (currentColor). Sized via parent w-/h-/text-color classes.
const Stroke = ({ children, size = 24 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const PushupSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head (now on right side - mirrored) */}
    <circle cx="27" cy="13" r="2" />
    {/* Body diagonal: head -> hips -> heels (mirrored) */}
    <line x1="25" y1="13" x2="12" y2="17" />
    <line x1="12" y1="17" x2="3" y2="20" />
    {/* Straight arm down to ground */}
    <line x1="23" y1="14" x2="21" y2="24" />
    {/* Second (further) arm */}
    <line x1="18" y1="15" x2="16" y2="24" />
    {/* Heel tick */}
    <line x1="3" y1="20" x2="3" y2="24" />
  </Stroke>
);

const PullupSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Bar */}
    <line x1="3" y1="5" x2="29" y2="5" />
    {/* Hands gripping (small ticks) */}
    <line x1="11" y1="3" x2="11" y2="7" />
    <line x1="21" y1="3" x2="21" y2="7" />
    {/* Arms bent up */}
    <polyline points="11,5 13,11 16,14" />
    <polyline points="21,5 19,11 16,14" />
    {/* Body */}
    <line x1="16" y1="14" x2="16" y2="23" />
    {/* Head */}
    <circle cx="16" cy="11.5" r="1.8" />
    {/* Legs slightly bent */}
    <polyline points="16,23 13,28" />
    <polyline points="16,23 19,28" />
  </Stroke>
);

const DipSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head */}
    <circle cx="16" cy="5" r="2.5" />
    {/* Forward-leaning body: neck -> hips at bar */}
    <polyline points="15,7.5 13,12 10,18" />
    {/* Both arms bent BEHIND body - elbow points back-up-right (behind the lean) */}
    <polyline points="14,10 21,14 14,18" />
    <polyline points="13,11 20,15 13,18" />
    {/* Horizontal bar at hip level */}
    <line x1="3" y1="18" x2="23" y2="18" />
    {/* Legs hanging below bar, bent at knee */}
    <polyline points="10,18 13,24 10,29" />
  </Stroke>
);

const SquatSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Head (side view, facing right) */}
    <circle cx="20" cy="6" r="2.5" />
    {/* Body leaning forward */}
    <line x1="19" y1="8.5" x2="14" y2="16" />
    {/* Arm extended forward for balance */}
    <line x1="17" y1="11" x2="28" y2="11" />
    {/* Thigh: hip -> knee (going forward/down) */}
    <line x1="14" y1="16" x2="22" y2="22" />
    {/* Shin: knee -> ankle (going back/down) */}
    <line x1="22" y1="22" x2="16" y2="28" />
    {/* Foot tick */}
    <line x1="14" y1="28" x2="19" y2="28" />
  </Stroke>
);

const HandstandSvg = ({ size = 24 }) => (
  <Stroke size={size}>
    {/* Hand ticks (kleine Markierungen — keine Bodenlinie) */}
    <line x1="9" y1="27" x2="9" y2="29" />
    <line x1="23" y1="27" x2="23" y2="29" />
    {/* Straight arms from hands up to shoulders */}
    <line x1="9" y1="29" x2="14" y2="19" />
    <line x1="23" y1="29" x2="18" y2="19" />
    {/* Head — face pointing DOWN (between shoulders) */}
    <circle cx="16" cy="22" r="2.2" />
    {/* Body going straight UP from shoulders to hips */}
    <line x1="16" y1="19" x2="16" y2="9" />
    {/* Legs straight up, slightly spread */}
    <line x1="16" y1="9" x2="12" y2="3" />
    <line x1="16" y1="9" x2="20" y2="3" />
  </Stroke>
);

const BikeSvg = ({ size = 24 }) => (
  <PersonSimpleBike size={size} weight="bold" />
);

const SwimSvg = ({ size = 24 }) => (
  <PersonSimpleSwim size={size} weight="bold" />
);

const RunSvg = ({ size = 24 }) => (
  <PersonSimpleRun size={size} weight="bold" />
);

const REGISTRY = {
  run: RunSvg,
  handstand: HandstandSvg,
  pushup: PushupSvg,
  pullup: PullupSvg,
  dip: DipSvg,
  squat: SquatSvg,
  bike: BikeSvg,
  swim: SwimSvg,
};

// Backwards-compat: alte Daten mit icon "sprint" oder "hspu" werden auf "handstand" gemappt
const ALIASES = {
  sprint: "handstand",
  hspu: "handstand",
};

export const ICON_KEYS = Object.keys(REGISTRY);

export default function ExerciseIcon({ icon = "pushup", size = 20, className = "" }) {
  const resolved = ALIASES[icon] || icon;
  const Cmp = REGISTRY[resolved] || REGISTRY.pushup;
  return <span className={className}><Cmp size={size} /></span>;
}
