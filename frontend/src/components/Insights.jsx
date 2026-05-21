import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChartBar, X, Lightning, Trophy } from "@phosphor-icons/react";
import { api } from "../lib/api";
import ExerciseIcon from "./ExerciseIcon";

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_LABELS_FULL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export default function Insights({ open, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    (async () => {
      try {
        const { data } = await api.get("/insights/me");
        setData(data);
      } catch (e) { /* ignore */ }
    })();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          data-testid="insights-overlay"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.aside
            className="relative w-full sm:max-w-lg h-full bg-[#0A0A0A] border-l border-[#222] flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
            data-testid="insights-panel"
          >
            <header className="flex items-center justify-between p-5 md:p-6 border-b border-[#1A1A1A] sticky top-0 bg-[#0A0A0A] z-10">
              <div className="flex items-center gap-2">
                <ChartBar size={22} weight="duotone" className="text-[#CCFF00]" />
                <h2 className="font-anton text-2xl tracking-tight">POWER INSIGHTS</h2>
              </div>
              <button onClick={onClose} className="text-[#8A8A8A] hover:text-white" data-testid="close-insights">
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
              {!data ? (
                <p className="text-[#555] text-sm uppercase tracking-widest">Loading...</p>
              ) : data.weeks_tracked === 0 ? (
                <div className="border border-dashed border-[#222] p-8 text-center">
                  <p className="text-[#555] text-sm uppercase tracking-widest mb-2">Noch keine Per-Tag-Daten</p>
                  <p className="text-[10px] uppercase tracking-widest text-[#444]">Logge Fortschritt im „Mo–So" Modus, um Insights zu erhalten</p>
                </div>
              ) : (
                <>
                  <div className="border border-[#1A1A1A] bg-[#121212] p-4 flex items-center gap-3">
                    <Lightning size={20} weight="fill" className="text-[#CCFF00]" />
                    <p className="text-[11px] uppercase tracking-widest text-[#8A8A8A]">
                      Insights basieren auf <span className="text-white font-anton text-base mx-1">{data.weeks_tracked}</span> protokollierten Wochen
                    </p>
                  </div>

                  {data.exercises.map((ex) => (
                    <ExerciseInsight key={ex.key} ex={ex} />
                  ))}
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ExerciseInsight({ ex }) {
  // Defensive: Sicherstellen dass by_weekday existiert und ein Array ist
  const byWeekday = Array.isArray(ex.by_weekday) ? ex.by_weekday : [0, 0, 0, 0, 0, 0, 0];
  const maxVal = Math.max(...byWeekday, 1);
  
  // Defensive: Sicherstellen dass share_per_day existiert
  const sharePerDay = Array.isArray(ex.share_per_day) ? ex.share_per_day : [0, 0, 0, 0, 0, 0, 0];
  
  // Defensive: Sicherstellen dass consistency existiert
  const consistency = Array.isArray(ex.consistency) ? ex.consistency : [0, 0, 0, 0, 0, 0, 0];

  return (
    <div className="border border-[#1A1A1A] bg-[#121212] p-5 space-y-5" data-testid={`insight-${ex.key}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: ex.color }}>
          <ExerciseIcon icon={ex.icon} size={18} />
          <h3 className="font-anton text-xl tracking-tight">{ex.name}</h3>
        </div>
        <div className="text-right">
          <p className="font-anton text-2xl" style={{ color: ex.color }}>
            {ex.avg_per_week}{ex.unit ? <span className="text-xs text-[#555] ml-1">{ex.unit}/Woche</span> : <span className="text-xs text-[#555] ml-1">avg/W</span>}
          </p>
        </div>
      </div>

      {/* Power Day callout */}
      {ex.power_day !== null && ex.power_day !== undefined && (
        <div className="flex items-stretch gap-2 text-[11px]">
          <div className="flex-1 border border-[#CCFF00]/40 bg-[#CCFF00]/[0.05] px-3 py-2" data-testid={`power-day-${ex.key}`}>
            <div className="flex items-center gap-1.5 text-[#CCFF00] uppercase tracking-widest text-[9px] mb-1">
              <Trophy size={11} weight="fill" /> Power-Day
            </div>
            <p className="font-anton text-base text-white leading-none">{DAY_LABELS_FULL[ex.power_day] || "—"}</p>
            <p className="text-[10px] text-[#888] mt-1">{sharePerDay[ex.power_day] || 0}% deiner Gesamtleistung</p>
          </div>
          {ex.weakest_day !== null && ex.weakest_day !== undefined && ex.weakest_day !== ex.power_day && (
            <div className="flex-1 border border-[#444] px-3 py-2" data-testid={`weak-day-${ex.key}`}>
              <div className="flex items-center gap-1.5 text-[#888] uppercase tracking-widest text-[9px] mb-1">
                Schwacher Tag
              </div>
              <p className="font-anton text-base text-white leading-none">{DAY_LABELS_FULL[ex.weakest_day] || "—"}</p>
              <p className="text-[10px] text-[#666] mt-1">{sharePerDay[ex.weakest_day] || 0}% Anteil</p>
            </div>
          )}
        </div>
      )}

      {/* Bar chart Mo-So */}
      <div>
        <p className="text-[9px] uppercase tracking-[0.25em] text-[#555] mb-3">Verteilung (Total)</p>
        <div className="flex items-end justify-between gap-1.5 h-28" data-testid={`distribution-${ex.key}`}>
          {DAY_LABELS.map((day, i) => {
            const v = byWeekday[i] || 0;
            const hasData = v > 0;
            const pct = hasData
              ? Math.max(8, maxVal > 0 ? (v / maxVal) * 100 : 0)
              : 3;
            const isPower = i === ex.power_day;
            const unitLower = (ex.unit || "").toLowerCase();
            const isDistance = unitLower.includes("km") || unitLower === "m" || unitLower.includes("mi");
            const label = hasData ? (isDistance ? Number(v).toFixed(1) : Math.round(v)) : "—";
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className={`text-[9px] font-anton leading-none tabular-nums ${hasData ? (isPower ? "text-white" : "text-[#AAA]") : "text-[#333]"}`}>
                  {label}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full transition-all"
                    style={{
                      height: `${pct}%`,
                      background: hasData ? (isPower ? ex.color : `${ex.color}AA`) : "#222",
                      boxShadow: isPower && hasData ? `0 0 12px ${ex.color}` : "none",
                    }}
                    title={`${day}: ${v}${ex.unit ? ` ${ex.unit}` : ""}`}
                  />
                </div>
                <span className={`text-[9px] uppercase tracking-widest ${isPower && hasData ? "text-white" : "text-[#555]"}`}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Consistency */}
      <div>
        <p className="text-[9px] uppercase tracking-[0.25em] text-[#555] mb-2">Trainings-Konsistenz</p>
        <div className="grid grid-cols-7 gap-1.5">
          {consistency.map((c, i) => (
            <div key={i} className="text-center">
              <div
                className="h-1.5 mb-1"
                style={{
                  background: c >= 70 ? "#00FF66" : c >= 40 ? ex.color : c >= 20 ? "#444" : "#1A1A1A",
                  opacity: c >= 20 ? 1 : 0.4,
                }}
              />
              <p className="text-[9px] text-[#666] uppercase tracking-widest leading-none">{DAY_LABELS[i]}</p>
              <p className="text-[10px] text-white font-anton mt-0.5">{c}%</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#555] mt-2">% der Wochen mit Aktivität an diesem Tag</p>
      </div>
    </div>
  );
}
