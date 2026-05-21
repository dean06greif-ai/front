import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Fire } from "@phosphor-icons/react";
import ExerciseIcon from "./ExerciseIcon";

function Bar({ value, goal, color, boosted }) {
  const pct = Math.min(100, goal > 0 ? (value / goal) * 100 : 0);
  return (
    <div className="h-2 bg-[#1A1A1A] w-full overflow-hidden border border-[#222] relative">
      <motion.div
        className="h-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}80` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      {boosted && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "repeating-linear-gradient(45deg, transparent 0 6px, rgba(255,136,0,0.12) 6px 12px)"
        }} />
      )}
    </div>
  );
}

function MetricRow({ exercise, value, canBoost, onBoost, onCancelBoost, isMe }) {
  const goal = exercise.goal;
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0;
  const done = pct >= 100;
  const boosted = exercise.boosted_this_week;
  const unit = exercise.unit ? ` ${exercise.unit}` : "";
  return (
    <div className={`space-y-2 ${boosted ? "px-3 -mx-3 py-2 -my-2 border border-[#FF8800]/30 bg-[#FF8800]/[0.04]" : ""}`} data-testid={`metric-${exercise.key}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ExerciseIcon icon={exercise.icon} size={16} className="shrink-0" />
          <span className="text-xs uppercase tracking-[0.2em] text-[#8A8A8A] truncate" style={{ color: boosted ? "#FF8800" : undefined }}>
            {exercise.name}
          </span>
          {boosted && (
            isMe ? (
              <button
                onClick={() => onCancelBoost(exercise.key)}
                data-testid={`boost-cancel-${exercise.key}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#FF8800] text-black text-[9px] font-bold tracking-widest uppercase hover:bg-[#FFA033] transition-colors"
                title="Boost abbrechen"
              >
                <Flame size={10} weight="fill" /> BOOST
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#FF8800] text-black text-[9px] font-bold tracking-widest uppercase" data-testid={`boosted-badge-${exercise.key}`}>
                <Flame size={10} weight="fill" /> BOOST
              </span>
            )
          )}
        </div>
        <div className={`text-xs tracking-widest font-bold ${done ? "text-[#00FF66]" : "text-white"}`}>
          {pct}%{done && " ✓"}
        </div>
      </div>
      <Bar value={value} goal={goal} color={exercise.color} boosted={boosted} />
      <div className="flex items-baseline justify-between font-anton">
        <span className="text-3xl text-white">{Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}{unit}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#555] tracking-wider">/ {Math.round(goal * 100) / 100}{unit}</span>
          {canBoost && (
            <button
              onClick={() => onBoost(exercise.key)}
              data-testid={`boost-button-${exercise.key}`}
              className="ml-2 inline-flex items-center gap-1 px-2 py-1 border border-[#FF8800]/60 text-[#FF8800] hover:bg-[#FF8800] hover:text-black transition-colors text-[10px] uppercase tracking-widest"
              title="Diese Woche +25% statt +10% (1× pro Woche)"
            >
              <Flame size={11} weight="fill" /> Boost
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserCard({ entry, isMe, flash, canBoost, onBoost, onCancelBoost, hasBoostedThisWeek, celebrating }) {
  const { name, picture, week_number, exercises, values, updated_at, email, streak, all_time } = entry;
  const curStreak = streak?.current || 0;

  // Animate streak counter when it increases (count up effect + flame glow)
  const [displayStreak, setDisplayStreak] = useState(curStreak);
  const [glowing, setGlowing] = useState(false);
  const prevStreakRef = useRef(curStreak);

  useEffect(() => {
    const prev = prevStreakRef.current;
    if (curStreak > prev) {
      setGlowing(true);
      let n = prev;
      const interval = setInterval(() => {
        n += 1;
        setDisplayStreak(n);
        if (n >= curStreak) {
          clearInterval(interval);
          setTimeout(() => setGlowing(false), 1500);
        }
      }, 450);
      prevStreakRef.current = curStreak;
      return () => clearInterval(interval);
    }
    setDisplayStreak(curStreak);
    prevStreakRef.current = curStreak;
  }, [curStreak]);
  return (
    <motion.div
      layout
      className={`relative border ${isMe ? "border-[#CCFF00] hover:shadow-[0_0_24px_rgba(204,255,0,0.35)]" : "border-[#222]"} bg-[#121212] p-6 md:p-7 flex flex-col gap-6 transition-all hover:-translate-y-1 ${flash ? "flash-update" : ""}`}
      data-testid={`user-card-${entry.user_id}`}
    >
      {isMe && (
        <div className="absolute top-2 left-2 md:-top-2 md:-left-2 bg-[#CCFF00] text-black text-[10px] font-bold tracking-widest uppercase px-2 py-1 z-10">YOU</div>
      )}
      <div className="flex items-center gap-4">
        {picture ? (
          <img src={picture} alt={name} className="w-12 h-12 object-cover border border-[#333]" />
        ) : (
          <div className="w-12 h-12 bg-[#1A1A1A] border border-[#333] flex items-center justify-center font-anton text-xl">
            {name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-anton text-2xl leading-none truncate">{name}</h3>
          <p className="text-xs text-[#555] truncate mt-1">{email}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-[#555]">Week</p>
          <p className="font-anton text-3xl text-[#CCFF00] leading-none">{String(week_number).padStart(2, "0")}</p>
        </div>
      </div>

      {/* Streak row */}
      <div className="flex items-center gap-3 -mt-2" data-testid={`streak-row-${entry.user_id}`}>
        <div className={`flex items-center gap-1.5 px-2 py-1 border transition-colors ${displayStreak > 0 ? "border-[#FF8800]/60 text-[#FF8800]" : "border-[#222] text-[#555]"}`}>
          <Fire size={14} weight={displayStreak > 0 ? "fill" : "regular"} className={glowing ? "streak-glow" : ""} />
          <span className="font-anton text-lg leading-none">{displayStreak}</span>
          <span className="text-[9px] uppercase tracking-widest">Streak</span>
        </div>
      </div>

      <div className="space-y-5">
        {exercises.map((ex) => (
          <MetricRow
            key={ex.key}
            exercise={ex}
            value={values[ex.key] || 0}
            canBoost={isMe && canBoost && !ex.boosted_this_week && !hasBoostedThisWeek}
            onBoost={onBoost}
            onCancelBoost={onCancelBoost}
            isMe={isMe}
          />
        ))}
      </div>

      {all_time && (
        <div className="border-t border-[#1A1A1A] pt-3" data-testid={`all-time-${entry.user_id}`}>
          <p className="text-[9px] uppercase tracking-[0.25em] text-[#555] mb-2">All-Time Total</p>
          {/* Dynamisches Grid: 3, 4 oder 5 Spalten – alles in einer Zeile.
              Bei 4-5 Zielen werden die Werte etwas enger geschrieben (gap reduziert, Schrift skaliert), Standard-Layout bleibt bei 3 Zielen unverändert. */}
          <div
            className={`grid items-start ${exercises.length >= 5 ? "gap-1.5" : exercises.length === 4 ? "gap-2" : "gap-2"}`}
            style={{ gridTemplateColumns: `repeat(${exercises.length}, minmax(0, 1fr))` }}
          >
            {exercises.map((ex) => (
              <div key={ex.key} className="text-center min-w-0">
                <p
                  className={`font-anton leading-none ${exercises.length >= 5 ? "text-sm md:text-base" : exercises.length === 4 ? "text-base md:text-lg" : "text-lg"} truncate`}
                  style={{ color: ex.color }}
                  title={`${Math.round((all_time[ex.key] || 0) * 100) / 100}${ex.unit ? " " + ex.unit : ""}`}
                >
                  {Math.round((all_time[ex.key] || 0) * 100) / 100}
                </p>
                <p className="text-[9px] uppercase tracking-widest text-[#444] mt-0.5 truncate">{ex.unit || "reps"}</p>
              </div>
            ))}
          </div>
          {updated_at && (
            <p className="text-[10px] uppercase tracking-widest text-[#444] mt-3 pt-3 border-t border-[#1A1A1A]">
              LAST SYNC · {new Date(updated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Celebration overlay */}
      {celebrating && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10" data-testid={`celebration-${entry.user_id}`}>
          <div className="absolute inset-0 bg-[#CCFF00]/10 animate-pulse" />
          <div className="relative font-anton text-4xl md:text-5xl text-[#CCFF00] text-glow-lime tracking-widest animate-bounce">
            WEEK DONE!
          </div>
        </div>
      )}
    </motion.div>
  );
}