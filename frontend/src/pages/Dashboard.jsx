import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Lightning, SignOut, Gear, Plus, Minus, Pulse, Flame, Trophy, ChartBar } from "@phosphor-icons/react";
import { useAuth } from "../contexts/AuthContext";
import { api, wsUrl } from "../lib/api";
import UserCard from "../components/UserCard";
import ExerciseIcon from "../components/ExerciseIcon";
import BoostRanking from "../components/BoostRanking";
import Insights from "../components/Insights";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [flashing, setFlashing] = useState({});
  const [logging, setLogging] = useState(false);
  const [logMode, setLogMode] = useState("total");
  const [logForm, setLogForm] = useState({});
  const [logDays, setLogDays] = useState({});
  const [showRanking, setShowRanking] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(null); // exercise key being canceled
  const [celebratingUsers, setCelebratingUsers] = useState({}); // {user_id: timestamp}
  const wsRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  const fetchBoard = useCallback(async () => {
    try {
      const { data } = await api.get(`/board`);
      setBoard(data);
      const me = data.users.find((u) => u.user_id === user?.user_id);
      if (me) {
        setLogForm({ ...me.values });
        setLogDays(me.days || {});
      }
    } catch (e) { /* ignore */ }
  }, [user?.user_id]);

  useEffect(() => { if (user) fetchBoard(); }, [user, fetchBoard]);

  // WebSocket
  useEffect(() => {
    if (!user) return;
    let ws;
    let reconnectTimer;
    const connect = () => {
      ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "progress_updated" || msg.type === "boost_applied") {
            setFlashing((p) => ({ ...p, [msg.user_id]: Date.now() }));
            setTimeout(() => setFlashing((p) => { const c = { ...p }; delete c[msg.user_id]; return c; }), 1500);
            fetchBoard();
          } else if (msg.type === "boost_canceled") {
            if (msg.user_id !== user?.user_id) {
              toast(`${msg.user_name} hat den Boost abgebrochen`, { icon: "✖" });
            }
            fetchBoard();
          } else if (msg.type === "week_completed") {
            if (msg.user_id !== user?.user_id) {
              toast.success(`${msg.user_name} hat Woche ${msg.week_number} gerockt! 🔥 Streak: ${msg.streak}`, { duration: 5000 });
            } else {
              toast.success(`WOCHE GESCHAFFT! Streak ${msg.streak} 🔥`, { duration: 5000 });
            }
            setCelebratingUsers((p) => ({ ...p, [msg.user_id]: Date.now() }));
            setTimeout(() => setCelebratingUsers((p) => { const c = { ...p }; delete c[msg.user_id]; return c; }), 3500);
            fetchBoard();
          } else if (msg.type === "streak_ended") {
            if (msg.user_id !== user?.user_id) {
              toast.error(`${msg.user_name}s Streak (${msg.previous_streak}) ist beendet 💀`, { duration: 5000 });
            } else {
              toast.error(`Deine Streak (${msg.previous_streak}) ist beendet 💀`, { duration: 5000 });
            }
            fetchBoard();
          } else if (msg.type === "goals_updated" || msg.type === "profile_updated") {
            fetchBoard();
          }
        } catch (e) { /* ignore */ }
      };
      ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000); };
      ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
    };
    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [user, fetchBoard]);

  const me = board?.users.find((u) => u.user_id === user?.user_id);
  const hasBoostedThisWeek = me?.exercises.some((e) => e.boosted_this_week) || false;

  // Sort: own card always first
  const sortedUsers = useMemo(() => {
    if (!board) return [];
    return [...board.users].sort((a, b) => {
      if (a.user_id === user?.user_id) return -1;
      if (b.user_id === user?.user_id) return 1;
      return 0;
    });
  }, [board, user?.user_id]);

  // Track mobile carousel active index
  const carouselRef = useRef(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const handler = () => {
      if (el.clientWidth === 0) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setCarouselIdx(idx);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [sortedUsers.length]);

  // Heutiger Wochentag-Index: Mo=0, Di=1, ..., So=6
  const getTodayIdx = () => (new Date().getDay() + 6) % 7;

  const handleLogProgress = async () => {
    if (!me) return;
    try {
      const payload = { week_number: me.week_number };
      if (logMode === "days") {
        payload.days = logDays;
      } else {
        // GESAMT-Modus: Differenz zum bisherigen Stand dem HEUTIGEN Tag zuordnen,
        // damit der Wert im Mo–So Tab am richtigen Wochentag erscheint.
        const todayIdx = getTodayIdx();
        const newDays = { ...logDays };
        // Sicherstellen, dass das heutige Tagesobjekt existiert (auch wenn keine Änderung erfolgt)
        newDays[todayIdx] = { ...(logDays[todayIdx] || {}) };

        me.exercises.forEach((ex) => {
          const newTotal = Number(logForm[ex.key]) || 0;
          const prevSum = [0, 1, 2, 3, 4, 5, 6].reduce(
            (acc, di) => acc + (Number(logDays?.[di]?.[ex.key]) || 0),
            0
          );
          const delta = newTotal - prevSum;
          // Keine Änderung -> Tag nicht anfassen
          if (delta === 0) return;

          let updatedToday;
          if (prevSum === 0) {
            // Legacy / noch keine Tagesaufteilung vorhanden:
            // Den vollen Wert dem heutigen Tag zuschreiben.
            updatedToday = newTotal;
          } else {
            const currentToday = Number(logDays?.[todayIdx]?.[ex.key]) || 0;
            updatedToday = currentToday + delta;
          }
          // Nicht negativ werden lassen + auf 2 Nachkommastellen runden (km etc.)
          updatedToday = Math.max(0, Math.round(updatedToday * 100) / 100);
          newDays[todayIdx] = { ...newDays[todayIdx], [ex.key]: updatedToday };
        });

        payload.days = newDays;
        // Optimistisch State aktualisieren, damit der Mo–So Tab sofort den richtigen Tag zeigt
        setLogDays(newDays);
      }
      await api.put("/progress/me", payload);
      toast.success("Fortschritt gespeichert");
      setLogging(false);
      fetchBoard();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen");
    }
  };

  const setDayValue = (dayIdx, exKey, v) => {
    setLogDays((p) => ({ ...p, [dayIdx]: { ...(p[dayIdx] || {}), [exKey]: Number(v) || 0 } }));
  };

  const syncTotalToDays = () => {
    if (!me) return;
    const todayIdx = getTodayIdx();
    const newDays = { ...logDays };
    newDays[todayIdx] = { ...(logDays[todayIdx] || {}) };
    me.exercises.forEach((ex) => {
      const newTotal = Number(logForm[ex.key]) || 0;
      const prevSum = [0, 1, 2, 3, 4, 5, 6].reduce(
        (acc, di) => acc + (Number(logDays?.[di]?.[ex.key]) || 0),
        0
      );
      const delta = newTotal - prevSum;
      if (delta === 0) return;
      let updatedToday;
      if (prevSum === 0) {
        updatedToday = newTotal;
      } else {
        const currentToday = Number(logDays?.[todayIdx]?.[ex.key]) || 0;
        updatedToday = currentToday + delta;
      }
      updatedToday = Math.max(0, Math.round(updatedToday * 100) / 100);
      newDays[todayIdx] = { ...newDays[todayIdx], [ex.key]: updatedToday };
    });
    setLogDays(newDays);
  };

  const handleBoost = async (exercise_key) => {
    try {
      await api.post("/boost", { exercise_key });
      toast.success("BOOST aktiviert! +25% Steigerung", { icon: "🔥" });
      fetchBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Boost fehlgeschlagen");
    }
  };

  const handleCancelBoost = async () => {
    try {
      await api.delete("/boost");
      toast.success("Boost abgebrochen");
      setCancelDialog(null);
      fetchBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Abbrechen fehlgeschlagen");
    }
  };

  if (loading || !user || !board) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-[#CCFF00] font-anton text-3xl tracking-widest animate-pulse">LOADING...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between" data-testid="dashboard-header">
          <div className="flex items-center gap-3">
            <Lightning size={26} weight="fill" className="text-[#CCFF00]" />
            <span className="font-anton text-2xl tracking-widest">TRACKER</span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#00FF66] ml-4 border border-[#1A2A1A] px-2 py-1">
              <Pulse size={10} weight="fill" /> LIVE
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setShowInsights(true)}
              data-testid="open-insights"
              className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] px-3 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <ChartBar size={14} weight="duotone" />
              <span className="hidden md:inline">Insights</span>
            </button>
            <button
              onClick={() => setShowRanking(true)}
              data-testid="open-boost-ranking"
              className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] px-3 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <Trophy size={14} weight="duotone" />
              <span className="hidden md:inline">Boost-Ranking</span>
            </button>
            <button
              onClick={() => navigate("/settings")}
              data-testid="settings-button"
              className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] px-3 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <Gear size={16} weight="duotone" />
              <span className="hidden md:inline">Settings</span>
            </button>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="border border-[#222] hover:border-[#FF3B30] hover:text-[#FF3B30] px-3 md:px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <SignOut size={16} weight="duotone" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-[#1A1A1A] tactical-grid">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div className="md:flex-1 md:min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">/ THE CREW DASHBOARD</p>
            <h1 className="font-anton text-5xl md:text-6xl leading-none tracking-tight mb-3">
              WEEK <span className="text-[#CCFF00] text-glow-lime">{String(me?.week_number || 1).padStart(2, "0")}</span> · GET TO WORK
            </h1>
            <p className="text-[#8A8A8A] max-w-xl leading-relaxed">
              Jede Woche +10%. Boost 1 Übung pro Woche für +25% — der höhere Wert läuft permanent weiter.
            </p>
            {hasBoostedThisWeek && (
              <div className="mt-4 inline-flex items-center gap-2 border border-[#FF8800]/40 bg-[#FF8800]/10 text-[#FF8800] px-3 py-1.5 text-[10px] uppercase tracking-widest" data-testid="boost-used-banner">
                <Flame size={12} weight="fill" /> Boost diese Woche bereits eingesetzt
              </div>
            )}
          </div>
          {/* Mobile: grid-cols-3 -> erste 3 in voller Größe in Reihe 1, weitere wrappen darunter.
              PC (md+): flex-row, alle Ziele in einer einzigen Reihe rechts neben dem Text. */}
          <div
            className="grid grid-cols-3 gap-3 md:flex md:flex-row md:flex-nowrap md:gap-3 md:shrink-0"
            data-testid="hero-goals-strip"
          >
            {me?.exercises.map((ex) => (
              <div
                key={ex.key}
                className="border border-[#222] bg-[#121212] p-3 md:p-4 relative md:w-[120px]"
                data-testid={`hero-goal-${ex.key}`}
              >
                <p className="text-[9px] md:text-[10px] uppercase tracking-wider md:tracking-widest text-[#8A8A8A] mb-1 flex items-center gap-1 truncate pr-3 md:pr-0">
                  <ExerciseIcon icon={ex.icon} size={12} /> {ex.name}
                </p>
                <p className="font-anton text-3xl leading-none" style={{ color: ex.color }}>
                  {Math.round(ex.goal * 100) / 100}<span className="text-base text-[#555] ml-1">{ex.unit}</span>
                </p>
                {ex.boosted_this_week && (
                  <Flame size={14} weight="fill" className="absolute top-1 right-1 md:top-2 md:right-2 text-[#FF8800]" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#1A1A1A] bg-[#0E0E0E]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {!logging ? (
            <button
              onClick={() => setLogging(true)}
              data-testid="open-log-progress"
              className="w-full md:w-auto bg-[#CCFF00] text-black font-bold uppercase tracking-widest py-4 px-8 flex items-center justify-center gap-2 hover:bg-[#D4FF33] glow-lime transition-all hover:-translate-y-0.5"
            >
              <Plus size={18} weight="bold" /> Fortschritt eintragen
            </button>
          ) : (
            <div className="border border-[#CCFF00] bg-[#0A0A0A] p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-anton text-2xl tracking-tight">LOG WEEK {me?.week_number} PROGRESS</h3>
                <div className="flex items-center gap-2">
                  <div className="flex border border-[#222]">
                    <button onClick={() => setLogMode("total")} data-testid="log-mode-total" className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${logMode === "total" ? "bg-[#CCFF00] text-black" : "text-[#888] hover:text-white"}`}>Gesamt</button>
                    <button onClick={() => { if (logMode === "total") syncTotalToDays(); setLogMode("days"); }} data-testid="log-mode-days" className={`px-3 py-1.5 text-[10px] uppercase tracking-widest ${logMode === "days" ? "bg-[#CCFF00] text-black" : "text-[#888] hover:text-white"}`}>Mo–So</button>                  
                  </div>
                  <button onClick={() => setLogging(false)} className="text-[#8A8A8A] hover:text-white text-xs uppercase tracking-widest" data-testid="close-log-progress">Abbrechen</button>
                </div>
              </div>
              {logMode === "total" ? (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A]" data-testid="gesamt-day-hint">
                    Neue Werte werden dem heutigen Tag (<span className="text-[#CCFF00]">{["Mo","Di","Mi","Do","Fr","Sa","So"][getTodayIdx()]}</span>) zugeordnet.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {me?.exercises.map((ex) => (
                      <NumInput
                        key={ex.key}
                        label={`${ex.name}${ex.unit ? ` (${ex.unit})` : ""}`}
                        value={logForm[ex.key] || 0}
                        step={ex.unit === "km" ? 0.1 : ex.goal > 100 ? 5 : 1}
                        onChange={(v) => setLogForm((f) => ({ ...f, [ex.key]: v }))}
                        testid={`input-${ex.key}`}
                        color={ex.color}
                        icon={ex.icon}
                        goal={ex.goal}
                        unit={ex.unit}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto" data-testid="days-grid">
                  <table className="w-full text-xs md:text-sm border-collapse">
                    <thead>
                      <tr className="text-[9px] md:text-[10px] uppercase tracking-wider md:tracking-widest text-[#555]">
                        <th className="text-left py-2 pr-1 md:pr-3">Übung</th>
                        {["Mo","Di","Mi","Do","Fr","Sa","So"].map((d, i) => (
                          <th key={i} className="px-0.5 md:px-1 text-center" data-testid={`day-header-${i}`}>{d}</th>
                        ))}
                        <th className="px-1 md:px-2 text-right">Σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {me?.exercises.map((ex) => {
                        const sum = [0,1,2,3,4,5,6].reduce((acc, di) => acc + (Number(logDays?.[di]?.[ex.key]) || 0), 0);
                        return (
                          <tr key={ex.key} className="border-t border-[#1A1A1A]">
                            <td className="py-2 pr-1 md:pr-3">
                              <div className="flex items-center gap-1 md:gap-1.5" style={{ color: ex.color }}>
                                <ExerciseIcon icon={ex.icon} size={12} className="hidden md:inline shrink-0" />
                                <span className="text-[9px] md:text-[11px] uppercase tracking-wider md:tracking-widest leading-tight">
                                  {ex.name}{ex.unit ? ` (${ex.unit})` : ""}
                                </span>
                              </div>
                            </td>
                            {[0,1,2,3,4,5,6].map((di) => (
                              <td key={di} className="px-0.5 md:px-1 py-1">
                                <input
                                  type="number"
                                  step={ex.unit === "km" ? 0.1 : 1}
                                  value={Number(logDays?.[di]?.[ex.key]) === 0 ? "" : (logDays?.[di]?.[ex.key] ?? "")}
                                  placeholder="0"
                                  onChange={(e) => setDayValue(di, ex.key, e.target.value)}
                                  className="w-full bg-[#0A0A0A] border border-[#222] focus:border-[#CCFF00] outline-none text-center text-white py-1 px-0.5 md:py-1.5 md:px-1 font-anton text-xs md:text-base placeholder:text-[#555]"
                                />
                              </td>
                            ))}
                            <td className="px-1 md:px-2 text-right font-anton text-sm md:text-lg whitespace-nowrap" style={{ color: ex.color }} data-testid={`sum-${ex.key}`}>
                              {Math.round(sum * 100) / 100}
                              <span className="text-[9px] md:text-[10px] text-[#555] ml-1">/ {ex.goal}{ex.unit ? ` ${ex.unit}` : ""}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                onClick={handleLogProgress}
                data-testid="save-progress-button"
                className="w-full bg-[#CCFF00] text-black font-bold uppercase tracking-widest py-4 hover:bg-[#D4FF33] glow-lime transition-all"
              >
                Speichern & Crew benachrichtigen
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-anton text-3xl tracking-tight">THE CREW</h2>
          <span className="text-xs uppercase tracking-widest text-[#8A8A8A]" data-testid="crew-count">{board.users.length} ATHLETES</span>
        </div>
        {board.users.length === 0 ? (
          <div className="border border-dashed border-[#222] p-12 text-center text-[#555] uppercase tracking-widest text-sm">
            Noch keine Crew-Mitglieder
          </div>
        ) : (
          <>
            {/* Mobile portrait: horizontal swipe carousel (< md). Desktop: grid */}
            <div
              ref={carouselRef}
              className="flex lg:grid lg:grid-cols-2 xl:grid-cols-3 gap-12 lg:gap-5 overflow-x-auto lg:overflow-visible snap-x-mandatory lg:[scroll-snap-type:none] -mx-6 px-6 lg:mx-0 lg:px-0 pt-8 pb-8 lg:pt-4 lg:pb-4 scrollbar-hide"
              data-testid="crew-list"
            >
              {sortedUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="flex-none w-[85vw] lg:w-auto snap-item lg:[scroll-snap-align:none]"
                >
                  <UserCard
                    entry={u}
                    isMe={u.user_id === user.user_id}
                    flash={!!flashing[u.user_id]}
                    canBoost={true}
                    onBoost={handleBoost}
                    onCancelBoost={(exKey) => setCancelDialog(exKey)}
                    hasBoostedThisWeek={hasBoostedThisWeek}
                    celebrating={!!celebratingUsers[u.user_id]}
                  />
                </div>
              ))}
            </div>
            {/* Page dots indicator (mobile only) */}
            {sortedUsers.length > 1 && (
              <div className="lg:hidden flex justify-center gap-1.5 mt-4" data-testid="carousel-dots">
                {sortedUsers.map((u, idx) => (
                  <div
                    key={u.user_id}
                    className={`h-1 transition-all ${idx === carouselIdx ? "w-8 bg-[#CCFF00]" : "w-2 bg-[#333]"}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <BoostRanking open={showRanking} onClose={() => setShowRanking(false)} />
      <Insights open={showInsights} onClose={() => setShowInsights(false)} />

      {/* Cancel Boost Confirmation Dialog */}
      {cancelDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setCancelDialog(null)}
          data-testid="cancel-boost-overlay"
        >
          <div
            className="bg-[#121212] border border-[#FF8800] max-w-sm w-full p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
            data-testid="cancel-boost-dialog"
          >
            <div className="flex items-center gap-3">
              <Flame size={28} weight="fill" className="text-[#FF8800]" />
              <h3 className="font-anton text-2xl tracking-tight">BOOST ABBRECHEN?</h3>
            </div>
            <p className="text-sm text-[#8A8A8A] leading-relaxed">
              Dein +25% Boost für diese Woche wird entfernt. Die Crew wird darüber informiert.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelDialog(null)}
                data-testid="cancel-boost-no"
                className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors"
              >
                Nein, behalten
              </button>
              <button
                onClick={handleCancelBoost}
                data-testid="cancel-boost-yes"
                className="flex-1 bg-[#FF3B30] hover:bg-[#FF5040] text-white font-bold uppercase tracking-widest py-3 px-4 transition-all"
              >
                Ja, abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-[#1A1A1A] py-8 text-center text-[10px] uppercase tracking-[0.3em] text-[#444]">
        TRACKER · WEEKLY +10% · BOOST = +25% · STAY DANGEROUS
      </footer>
    </div>
  );
}

function NumInput({ label, value, onChange, step, testid, color, icon, goal, unit }) {
  // Round to step precision to avoid floating-point drift (e.g. 0.1+0.1+0.1=0.30000000000000004)
  const decimals = step < 1 ? 2 : 0;
  const round = (n) => Number(Number(n).toFixed(decimals));
  const dec = () => onChange(Math.max(0, round(Number(value) - step)));
  const inc = () => onChange(round(Number(value) + step));
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color }}>
        {icon && <ExerciseIcon icon={icon} size={12} />} {label}
      </label>
      <div className="flex items-stretch border border-[#222]">
        <button type="button" onClick={dec} className="px-3 bg-[#121212] hover:bg-[#1A1A1A] border-r border-[#222]" data-testid={`${testid}-dec`}>
          <Minus size={16} />
        </button>
         <input
          type="number"
          value={Number(value) === 0 ? "" : value}
          step={step}
          placeholder="0"
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="flex-1 bg-[#0A0A0A] text-white font-anton text-2xl text-center focus:outline-none focus:bg-[#121212] px-2 py-2 w-full min-w-0 placeholder:text-[#555] placeholder:font-anton"
          data-testid={testid}
        />
        <button type="button" onClick={inc} className="px-3 bg-[#121212] hover:bg-[#1A1A1A] border-l border-[#222]" data-testid={`${testid}-inc`}>
          <Plus size={16} />
        </button>
      </div>
      <p className="text-[10px] text-[#444] mt-1 uppercase tracking-widest">Goal: {Math.round(goal * 100) / 100}{unit ? ` ${unit}` : ""}</p>
    </div>
  );
}

