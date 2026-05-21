import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FloppyDisk, ArrowCounterClockwise, Lightning, Plus, Trash, X, Camera, User, Lock, Flame } from "@phosphor-icons/react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import ExerciseIcon, { ICON_KEYS } from "../components/ExerciseIcon";
import GearPicker from "../components/GearPicker";
import { toast } from "sonner";

// Bevorzugte Icon-Reihenfolge: Run, Pushup, Pullup, Handstand zuerst. Rest in Original-Reihenfolge danach.
const PREFERRED_ICON_ORDER = ["run", "pushup", "pullup", "handstand"];
const ORDERED_ICON_KEYS = (() => {
  const set = new Set(ICON_KEYS);
  const head = PREFERRED_ICON_ORDER.filter((k) => set.has(k));
  const tail = ICON_KEYS.filter((k) => !PREFERRED_ICON_ORDER.includes(k));
  return [...head, ...tail];
})();

// Verbindliche Farbpalette: Position bestimmt Farbe (Ziel 1..5).
// Ziel 4 = Orange (#FF8800), Ziel 5 = Violett (#A855F7) – maximaler Kontrast zu den Standard-Zielen.
const EXERCISE_PALETTE = ["#CCFF00", "#FF3B30", "#00F0FF", "#FF8800", "#A855F7"];
const PROGRESSION_COOLDOWN = 4; // Wochen: Steigerung ab Woche 2 nur alle 4 Wochen änderbar
const BASE_INCREASE = 0.10;     // unused now (per-exercise pct used)
const BOOST_INCREASE = 0.25;

const normalizeColors = (list) =>
  (list || []).map((ex, idx) => ({
    ...ex,
    color: EXERCISE_PALETTE[idx % EXERCISE_PALETTE.length],
    progression_pct: Number.isFinite(Number(ex.progression_pct)) && Number(ex.progression_pct) >= 1
      ? Math.min(10, Math.max(1, Math.round(Number(ex.progression_pct))))
      : 10,
  }));

// Rundung (spiegelt Backend _round_goal):
// km/m/mi -> 0.1 (100m), Reps/sonstiges -> nearest integer (half up)
// Wichtig: nicht auf gerade Zahlen runden -> sonst wird 100 + 25% Boost = 125 fälschlich zu 124
const roundGoal = (value, unit) => {
  const u = (unit || "").toLowerCase();
  if (u.includes("km") || u === "m" || u.includes("mi")) return Math.round(value * 10) / 10;
  return Math.round(value);
};

// Live Progression-Berechnung (spiegelt Backend _compute_progression).
// Verwendet bekannte missed_weeks/effective_boost_weeks aus serverState; rechnet die
// Goal-Werte aus aktuellem base_value & progression_pct neu (für Live-Vorschau).
function computeProgressionLive(exercise, serverEx, currentWeek, futureWeeks = 10) {
  const base = Number(exercise.base_value) || 0;
  const pct = Math.max(1, Math.min(10, Math.round(Number(exercise.progression_pct) || 10)));
  const exIncrease = pct / 100;
  const unit = exercise.unit || "";

  // serverState liefert: missed_weeks, effective_boost_weeks, progression (mit boost-Markern)
  const missedSet = new Set(serverEx?.missed_weeks || []);
  // Bestimme alle Boost-Wochen (nicht nur effektive), damit voided_boost-Markierung erhalten bleibt
  const boostWeeksAll = new Set(
    (serverEx?.progression || [])
      .filter((p) => p.boost)
      .map((p) => p.week)
  );

  const lastWeek = Math.max(currentWeek, 1) + futureWeeks;
  let effIdx = 0;
  let activeBoosts = [];
  const out = [];

  for (let w = 1; w <= lastWeek; w++) {
    const boostThisWeek = boostWeeksAll.has(w);
    if (boostThisWeek) activeBoosts.push(w);

    const rawGoal = base * Math.pow(1 + exIncrease, effIdx) * Math.pow(1 + BOOST_INCREASE, activeBoosts.length);
    const goal = roundGoal(rawGoal, unit);

    let status, voidedBoost = false;
    if (w < currentWeek) {
      if (missedSet.has(w)) {
        status = "missed";
        activeBoosts = activeBoosts.filter((b) => b > w);
        voidedBoost = boostThisWeek;
      } else {
        status = "completed";
        effIdx += 1;
      }
    } else if (w === currentWeek) {
      status = "current";
      effIdx += 1;
    } else {
      status = "future";
      effIdx += 1;
    }
    out.push({ week: w, goal, status, boost: boostThisWeek, voided_boost: voidedBoost });
  }
  return out;
}

export default function Settings() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();

  // --- Profile state ---
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePic, setProfilePic] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const fileRef = useRef(null);

  // --- Goals / Settings state ---
  const [exercises, setExercises] = useState([]);
  const [originalExercises, setOriginalExercises] = useState([]); // Snapshot vom Server, für Diff
  const [startDate, setStartDate] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [state, setState] = useState({}); // {ex_key: {missed_weeks, effective_boost_weeks, current_goal, progression: [...]}}
  const [saving, setSaving] = useState(false);

  // --- Dialoge ---
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showProgressionConfirm, setShowProgressionConfirm] = useState(false); // bestätigt Steigerungs-Festsetzung
  const [progressionDiff, setProgressionDiff] = useState([]); // [{name, oldPct, newPct, color}]

  useEffect(() => {
    if (!loading && !user) navigate("/");
    if (user) {
      setProfileName(user.name || "");
      setProfilePic(user.picture || "");
    }
  }, [user, loading, navigate]);

  // Load remember-me preference
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get("/auth/preferences");
        setRememberMe(!!data.remember_me);
      } catch (err) {
        console.error("Failed to load auth preferences:", err);
      }
    })();
  }, [user]);

  const loadGoals = useCallback(async () => {
    try {
      const { data } = await api.get("/goals/me");
      const exs = normalizeColors(data.exercises || []);
      setExercises(exs);
      setOriginalExercises(JSON.parse(JSON.stringify(exs)));
      setStartDate(data.start_date);
      setCurrentWeek(data.current_week || 1);
      setState(data.state || {});
    } catch (err) {
      console.error("Failed to load goals:", err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadGoals();
  }, [user, loadGoals]);

  // --- Profile handlers ---
  const toggleRememberMe = async (val) => {
    setSavingPrefs(true);
    const prev = rememberMe;
    setRememberMe(val);
    try {
      await api.put("/auth/preferences", { remember_me: val });
      toast.success(val ? "Du bleibst angemeldet" : "Automatische Anmeldung deaktiviert");
    } catch (e) {
      setRememberMe(prev);
      toast.error("Update fehlgeschlagen");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) { toast.error("Bild zu groß (max 500KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setProfilePic(reader.result);
    reader.readAsDataURL(f);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data } = await api.put("/profile", { name: profileName, picture: profilePic });
      setUser({ ...user, name: data.name, picture: data.picture });
      toast.success("Profil aktualisiert");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update fehlgeschlagen");
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Goals handlers ---
  const isStartLocked = currentWeek > 1; // Startwert nur in Woche 1 änderbar

  // Prüft, ob Progression dieser Übung gerade änderbar ist (Cooldown 4 Wochen, in Woche 1 frei)
  const progressionEditable = useCallback((exKey) => {
    if (currentWeek <= 1) return { editable: true, weeksLeft: 0 };
    const orig = originalExercises.find((e) => e.key === exKey);
    const lastChanged = Number(orig?.progression_last_changed_week || 1);
    const weeksSince = currentWeek - lastChanged;
    if (weeksSince >= PROGRESSION_COOLDOWN) return { editable: true, weeksLeft: 0 };
    return { editable: false, weeksLeft: PROGRESSION_COOLDOWN - weeksSince };
  }, [currentWeek, originalExercises]);

  const updateExercise = (idx, patch) => {
    setExercises((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const addExercise = () => {
    if (exercises.length >= 5) { toast.error("Maximal 5 Übungen"); return; }
    const usedKeys = new Set(exercises.map((e) => e.key));
    let n = 1;
    while (usedKeys.has(`ex${n}`)) n++;
    setExercises((prev) => [...prev, {
      key: `ex${n}`,
      name: `Übung ${prev.length + 1}`,
      unit: "",
      icon: "squat",
      color: EXERCISE_PALETTE[prev.length % EXERCISE_PALETTE.length],
      base_value: 10,
      progression_pct: 10,
    }]);
  };

  const removeExercise = (idx) => {
    if (exercises.length <= 3) { toast.error("Mindestens 3 Übungen erforderlich"); return; }
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  // Compute Liste der geänderten progression_pct (für Bestätigungsdialog)
  const computeProgressionChanges = () => {
    const changes = [];
    for (const ex of exercises) {
      const orig = originalExercises.find((o) => o.key === ex.key);
      if (!orig) continue;
      const oldPct = Number(orig.progression_pct) || 10;
      const newPct = Number(ex.progression_pct) || 10;
      if (oldPct !== newPct) {
        changes.push({ key: ex.key, name: ex.name, color: ex.color, oldPct, newPct });
      }
    }
    return changes;
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await api.put("/goals/me", { exercises: normalizeColors(exercises) });
      toast.success("Ziele aktualisiert");
      if (currentWeek === 1) {
        toast.message("Hinweis: Startwerte sind ab Woche 2 nicht mehr veränderbar — nur über 'Programm neu starten' zurücksetzbar.", { duration: 6000 });
      }
      await loadGoals();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update fehlgeschlagen");
    } finally {
      setSaving(false);
      setShowProgressionConfirm(false);
    }
  };

  const save = async () => {
    // Wenn Progression in Woche >1 geändert wurde -> Bestätigungs-Dialog
    const changes = computeProgressionChanges();
    if (currentWeek > 1 && changes.length > 0) {
      setProgressionDiff(changes);
      setShowProgressionConfirm(true);
      return;
    }
    await doSave();
  };

  const resetStart = async () => {
    try {
      const { data } = await api.post("/goals/me/reset-start");
      setStartDate(data.start_date);
      toast.success("Programm wurde zurück auf Woche 1 gesetzt");
      await loadGoals();
    } catch (e) {
      toast.error("Reset fehlgeschlagen");
    } finally {
      setShowResetConfirm(false);
    }
  };

  // Live progression rows: Berechnung lokal, damit Zahnrad-Drehen sofort live in der Tabelle erscheint
  const rows = useMemo(() => {
    if (!exercises.length) return [];
    const perExLive = exercises.map((ex) => computeProgressionLive(ex, state[ex.key], currentWeek, 10));
    const lastWeek = Math.max(...perExLive.map((arr) => arr.length ? arr[arr.length - 1].week : 1));
    const out = [];
    for (let w = 1; w <= lastWeek; w++) {
      const cells = exercises.map((ex, idx) => perExLive[idx].find((p) => p.week === w) || null);
      out.push({ week: w, cells });
    }
    return out;
  }, [exercises, state, currentWeek]);

  // Auto-scroll the progression body so current week is near the top
  const tableScrollRef = useRef(null);
  const currentRowRef = useRef(null);
  useEffect(() => {
    if (!currentRowRef.current || !tableScrollRef.current) return;
    const rowTop = currentRowRef.current.offsetTop;
    tableScrollRef.current.scrollTop = Math.max(0, rowTop - 40);
  }, [rows.length, currentWeek]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lightning size={26} weight="fill" className="text-[#CCFF00]" />
            <span className="font-anton text-2xl tracking-widest">TRACKER</span>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            data-testid="back-to-dashboard"
            className="border border-[#222] hover:border-[#CCFF00] hover:text-[#CCFF00] px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <ArrowLeft size={16} /> Zurück
          </button>
        </div>
      </header>

      {/* Profile section */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">/ PROFILE</p>
        <h1 className="font-anton text-4xl md:text-5xl leading-none tracking-tight mb-8">
          DEIN ACCOUNT
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-6 items-start">
          {/* Profilbild */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {profilePic ? (
                <img src={profilePic} alt="profile" className="w-32 h-32 object-cover border border-[#333]" data-testid="profile-pic-preview" />
              ) : (
                <div className="w-32 h-32 bg-[#121212] border border-[#333] flex items-center justify-center">
                  <User size={48} className="text-[#555]" />
                </div>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                data-testid="upload-pic-button"
                className="absolute -bottom-2 -right-2 bg-[#CCFF00] text-black p-2 hover:bg-[#D4FF33] glow-lime"
              >
                <Camera size={16} weight="bold" />
              </button>

              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" data-testid="upload-pic-input" />
            </div>

            <p className="text-[10px] uppercase tracking-widest text-[#555]">Max 500KB</p>
          </div>

          {/* Profilfelder */}
          <div className="space-y-4">
            <div className="border border-[#222] bg-[#121212] p-5">
              <label className="text-[10px] uppercase tracking-widest text-[#8A8A8A] mb-2 block">Anzeigename</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full bg-transparent border-b-2 border-[#333] focus:border-[#CCFF00] outline-none font-anton text-3xl text-white py-2 transition-colors"
                data-testid="input-display-name"
                maxLength={80}
              />
            </div>

            <div className="border border-[#222] bg-[#121212] p-5">
              <label className="text-[10px] uppercase tracking-widest text-[#8A8A8A] mb-2 block">E-Mail (read-only)</label>
              <p className="font-anton text-xl text-[#555]">{user.email}</p>
            </div>

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              data-testid="save-profile-button"
              className="bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center gap-2 transition-all hover:-translate-y-0.5 glow-lime disabled:opacity-60"
            >
              <FloppyDisk size={16} weight="bold" />
              {savingProfile ? "Speichern..." : "Profil speichern"}
            </button>

            <div className="flex items-center gap-5 border border-[#222] bg-[#121212] p-5 mb-10" data-testid="remember-me-row">
              <button
                type="button"
                role="switch"
                aria-checked={rememberMe}
                onClick={() => toggleRememberMe(!rememberMe)}
                disabled={savingPrefs}
                data-testid="remember-me-toggle"
                className={`relative w-14 h-7 border transition-colors flex-shrink-0 ${rememberMe ? "bg-[#CCFF00] border-[#CCFF00]" : "bg-[#0A0A0A] border-[#333] hover:border-[#555]"} disabled:opacity-60`}
              >
                <span className={`absolute top-0.5 w-5 h-5 transition-all ${rememberMe ? "left-[30px] bg-black" : "left-0.5 bg-[#555]"}`} />
              </button>

              <div className="flex-1">
                <p className="font-anton text-xl tracking-tight">Angemeldet bleiben</p>
                <p className="text-xs text-[#8A8A8A] mt-1 leading-relaxed">
                  {rememberMe ? "Du wirst auf diesem Gerät 30 Tage lang automatisch angemeldet." : "Du wirst beim Schließen des Browsers abgemeldet."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6">
        <div className="border-t border-[#1A1A1A]" />
      </div>

      {/* Exercises */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-[#CCFF00] mb-3">/ ÜBUNGEN & STARTWERTE</p>
        <h2 className="font-anton text-4xl md:text-5xl leading-none tracking-tight mb-3">DEINE ZIELE</h2>
        <p className="text-[#8A8A8A] max-w-xl leading-relaxed mb-4">
          Wähle Übungen, Woche-1-Startwerte und die Steigerung (1–10 %) pro Übung über das Zahnrad. Mit BOOST → +25 % für eine Übung (1×/Woche). Wird das Wochenziel nicht erreicht, pausiert die Steigerung für diese Übung — und Boosts für sie verfallen.
        </p>
        {isStartLocked && (
          <div className="border border-[#FF8800]/40 bg-[#FF8800]/[0.06] text-[#FF8800] px-4 py-2 text-xs uppercase tracking-widest mb-8 inline-flex items-center gap-2" data-testid="start-locked-banner">
            <Lock size={12} weight="bold" /> Startwerte sind ab Woche 2 gesperrt — über „Programm neu starten" zurücksetzbar.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-4">
          {exercises.map((ex, idx) => {
            const progLock = progressionEditable(ex.key);
            return (
              <div key={ex.key} className="border border-[#222] bg-[#121212] p-5 space-y-4 relative" data-testid={`exercise-card-${ex.key}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: ex.color }}>
                    <ExerciseIcon icon={ex.icon} size={14} /> ÜBUNG {idx + 1}
                  </div>
                  {exercises.length > 3 && (
                    <button onClick={() => removeExercise(idx)} data-testid={`remove-exercise-${ex.key}`} className="text-[#555] hover:text-[#FF3B30] transition-colors" title="Entfernen">
                      <Trash size={14} />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={ex.name}
                  onChange={(e) => updateExercise(idx, { name: e.target.value })}
                  className="w-full bg-transparent border-b-2 border-[#333] focus:border-[#CCFF00] outline-none font-anton text-2xl text-white py-1 transition-colors"
                  placeholder="Name"
                  data-testid={`input-name-${ex.key}`}
                />
                <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-start">
                  <div className="relative">
                    <label className="text-[10px] uppercase tracking-widest text-[#555] mb-1 h-4 block flex items-center gap-1">
                      Startwert {isStartLocked && <Lock size={10} weight="bold" className="text-[#FF8800]" />}
                    </label>
                    <input
                      type="number"
                      value={Number(ex.base_value) === 0 ? "" : ex.base_value}
                      step={ex.unit === "km" ? 0.5 : ex.base_value > 100 ? 10 : 1}
                      placeholder="0"
                      disabled={isStartLocked}
                      onChange={(e) => updateExercise(idx, { base_value: Number(e.target.value) || 0 })}
                      onFocus={() => { if (isStartLocked) toast.message('Startwert ist ab Woche 2 unveränderbar. Setze über „Programm neu starten" zurück auf Woche 1.'); }}
                      className={`w-full bg-[#0A0A0A] border outline-none font-anton text-xl text-white px-2 py-1 placeholder:text-[#555] placeholder:font-anton transition-colors ${
                        isStartLocked
                          ? "border-[#1A1A1A] text-[#666] cursor-not-allowed"
                          : "border-[#222] focus:border-[#CCFF00]"
                      }`}
                      data-testid={`input-base-${ex.key}`}
                      title={isStartLocked ? "Startwert ist ab Woche 2 gesperrt" : ""}
                    />
                    {isStartLocked && (
                      <p className="absolute -bottom-4 left-0 text-[9px] tracking-widest text-[#FF8800]/80 leading-tight whitespace-nowrap" data-testid={`base-locked-hint-${ex.key}`}>
                        AB WOCHE 2 GESPERRT
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-[#555] mb-1 h-4 block">Einheit</label>
                    <input
                      type="text"
                      value={ex.unit}
                      onChange={(e) => updateExercise(idx, { unit: e.target.value })}
                      placeholder="km, kg, ..."
                      className="w-full bg-[#0A0A0A] border border-[#222] focus:border-[#CCFF00] outline-none text-base text-white px-2 py-1.5"
                      data-testid={`input-unit-${ex.key}`}
                    />
                  </div>
                  <div className="flex flex-col items-center relative" data-testid={`gear-wrap-${ex.key}`}>
                    <label className="text-[10px] uppercase tracking-widest text-[#555] mb-1 h-4 block flex items-center gap-1 relative z-10">
                      Steigerung {!progLock.editable && <Lock size={10} weight="bold" className="text-[#FF8800]" />}
                    </label>
                    {/* The GearPicker is 54px tall, the input next to it ~36px.
                        We shift the wheel up by 5px (statt -9) so it sits hinter dem Label
                        (z-0) und das Wort "Steigerung" bleibt komplett sichtbar.
                        Der Wheel bleibt damit weiterhin grob in einer Linie mit den
                        Startwert-/Einheit-Boxen. */}
                    <div
                      className={`relative z-0 ${!progLock.editable ? "opacity-50 pointer-events-none" : ""}`}
                      style={{ marginTop: -5 }}
                    >
                      <GearPicker
                        value={Number(ex.progression_pct) || 10}
                        onChange={(n) => updateExercise(idx, { progression_pct: n })}
                        color={ex.color}
                        testid={`gear-${ex.key}`}
                      />
                    </div>
                    {!progLock.editable && (
                      <p className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] tracking-widest text-[#FF8800]/80 text-center leading-tight whitespace-nowrap" data-testid={`gear-locked-hint-${ex.key}`}>
                        {progLock.weeksLeft}W BIS ÄNDERBAR
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[#555] mb-2 block">Icon</label>
                  <div className="grid grid-cols-4 gap-1">
                    {ORDERED_ICON_KEYS.map((k) => (
                      <button
                        key={k}
                        onClick={() => updateExercise(idx, { icon: k })}
                        className={`p-2 flex items-center justify-center border transition-colors ${ex.icon === k ? "border-[#CCFF00] text-[#CCFF00]" : "border-[#222] text-[#666] hover:border-[#444] hover:text-white"}`}
                        data-testid={`icon-${ex.key}-${k}`}
                        title={k}
                      >
                        <ExerciseIcon icon={k} size={18} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-8">
          {exercises.length < 5 && (
            <button
              onClick={addExercise}
              data-testid="add-exercise-button"
              className="border border-dashed border-[#333] hover:border-[#CCFF00] hover:text-[#CCFF00] text-[#888] px-4 py-3 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors w-full md:w-auto"
            >
              <Plus size={14} weight="bold" /> Übung hinzufügen ({exercises.length}/5)
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mb-12">
          <button
            onClick={save}
            disabled={saving}
            data-testid="save-goals-button"
            className="bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold uppercase tracking-widest py-3 px-6 flex items-center gap-2 transition-all hover:-translate-y-0.5 glow-lime disabled:opacity-60"
          >
            <FloppyDisk size={16} weight="bold" /> {saving ? "Speichern..." : "Ziele speichern"}
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            data-testid="reset-start-button"
            className="border border-[#222] hover:border-[#FF3B30] hover:text-[#FF3B30] py-3 px-6 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <ArrowCounterClockwise size={14} /> Programm neu starten (Woche 1)
          </button>
        </div>

        {startDate && (
          <p className="text-xs uppercase tracking-widest text-[#555] mb-8">
            Programm gestartet · {new Date(startDate).toLocaleDateString()}
          </p>
        )}

        {/* Wochen-Progression: immer 10 Wochen sichtbar, vertikal scrollbar (Vergangenheit + Zukunft) */}
        <div className="border border-[#1A1A1A] bg-[#121212] p-4 md:p-6">
          <h3 className="font-anton text-2xl tracking-tight mb-1">WOCHEN-PROGRESSION</h3>
          <p className="text-[10px] md:text-xs uppercase tracking-wider md:tracking-widest text-[#8A8A8A] mb-5">
            Aktuell Woche {currentWeek} · <Flame size={12} weight="fill" className="inline align-middle text-[#FF8800]" /> Boost (+25%) · <X size={10} weight="bold" className="inline align-middle text-[#FF3B30]" /> verpasst → keine Steigerung
          </p>

          {/* Scroll-Container: 10 Zeilen sichtbar (~42px Header + 10 × 38px ≈ 420px). Bei >10 Wochen scrollbar. */}
          <div
            ref={tableScrollRef}
            className="overflow-y-auto overflow-x-auto max-h-[420px] md:max-h-[460px]"
            style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
            data-testid="progression-scroll"
          >
            <table className="w-full text-xs md:text-sm border-collapse" data-testid="progression-table">
              <thead className="sticky top-0 z-10 bg-[#121212]">
                <tr className="text-[9px] md:text-[10px] uppercase tracking-wider md:tracking-widest text-[#555] border-b border-[#1A1A1A]">
                  <th className="py-2 pr-1 md:pr-4 text-left w-16 bg-[#121212]">Woche</th>
                  {exercises.map((ex) => (
                    <th key={ex.key} className="py-2 px-1 md:px-4 truncate text-center bg-[#121212]" style={{ color: ex.color }}>{ex.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-anton">
                {rows.map(({ week, cells }) => {
                  const isCurrent = week === currentWeek;
                  const isPast = week < currentWeek;
                  return (
                    <tr
                      key={week}
                      ref={isCurrent ? currentRowRef : null}
                      className={`border-b border-[#1A1A1A] hover:bg-[#0E0E0E] ${isCurrent ? "bg-[#CCFF00]/[0.06]" : ""} ${isPast ? "opacity-80" : ""}`}
                      data-testid={`progression-row-${week}`}
                      style={{ height: "38px" }}
                    >
                      <td className={`py-2 pr-1 md:pr-4 text-left w-16 ${isCurrent ? "text-[#CCFF00]" : isPast ? "text-[#555]" : "text-[#8A8A8A]"}`}>
                        {String(week).padStart(2, "0")}
                      </td>
                      {cells.map((cell, ci) => {
                        const ex = exercises[ci];
                        if (!cell || !ex) {
                          return <td key={`empty-${ci}`} className="py-2 px-1 md:px-4 text-center text-[#333]">—</td>;
                        }
                        const isKm = (ex.unit || "").toLowerCase().includes("km");
                        const display = isKm ? Number(cell.goal).toFixed(1) : cell.goal;
                        const missed = cell.status === "missed";
                        const boosted = cell.boost && !cell.voided_boost;
                        const voided = cell.voided_boost;
                        return (
                          <td
                            key={ex.key}
                            className={`py-2 px-1 md:px-4 ${missed ? "text-[#FF3B30]" : "text-white"}`}
                            data-testid={`progression-cell-${week}-${ex.key}`}
                          >
                            {/* Grid: [linke leere Spalte | zentrierte Zahl | rechte Spalte mit Einheit + Markern] */}
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
                              <span />
                              <span className={`text-center font-anton tabular-nums ${missed ? "line-through" : ""}`}>
                                {display}
                              </span>
                              <span className="flex items-center gap-1 pl-1 text-[10px] md:text-xs text-[#888] whitespace-nowrap">
                                {ex.unit && <span className="text-[#555]">{ex.unit}</span>}
                                {boosted && <Flame size={11} weight="fill" className="text-[#FF8800]" title="Boost aktiv" />}
                                {voided && <Flame size={11} weight="fill" className="text-[#555]" title="Boost verfallen" />}
                                {missed && <X size={10} weight="bold" className="text-[#FF3B30]" />}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* --- Confirm Dialog: Programm neu starten --- */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setShowResetConfirm(false)}
          data-testid="reset-confirm-overlay"
        >
          <div
            className="bg-[#0E0E0E] border border-[#FF3B30]/50 max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            data-testid="reset-confirm-dialog"
          >
            <h3 className="font-anton text-2xl tracking-tight mb-2">PROGRAMM WIRKLICH ZURÜCKSETZEN?</h3>
            <p className="text-sm text-[#AAA] leading-relaxed mb-2">
              Du startest komplett neu in Woche 1. Alle bisherigen Fortschritte, Boosts und Streaks werden gelöscht.
            </p>
            <p className="text-xs text-[#FF8800] leading-relaxed mb-6">
              Danach kannst du Startwerte & Steigerungen wieder frei festlegen.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                data-testid="reset-confirm-no"
                className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors"
              >
                Nein, behalten
              </button>
              <button
                onClick={resetStart}
                data-testid="reset-confirm-yes"
                className="flex-1 bg-[#FF3B30] hover:bg-[#FF5C52] text-black font-bold py-3 px-4 text-xs uppercase tracking-widest transition-colors"
              >
                Ja, zurücksetzen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Confirm Dialog: Steigerung festsetzen --- */}
      {showProgressionConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setShowProgressionConfirm(false)}
          data-testid="progression-confirm-overlay"
        >
          <div
            className="bg-[#0E0E0E] border border-[#CCFF00]/50 max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            data-testid="progression-confirm-dialog"
          >
            <h3 className="font-anton text-2xl tracking-tight mb-2">STEIGERUNG WIRKLICH FESTSETZEN?</h3>
            <p className="text-sm text-[#AAA] leading-relaxed mb-3">
              Du änderst die wöchentliche Steigerung für folgende Übung(en). Ab Woche 2 ist die Steigerung danach für die nächsten {PROGRESSION_COOLDOWN} Wochen gesperrt.
            </p>
            <ul className="space-y-1 mb-5">
              {progressionDiff.map((d) => (
                <li key={d.key} className="flex items-center justify-between text-sm border border-[#222] bg-[#121212] px-3 py-2" data-testid={`progression-diff-${d.key}`}>
                  <span className="font-anton" style={{ color: d.color }}>{d.name}</span>
                  <span className="font-anton tabular-nums text-[#888]">
                    {d.oldPct}% <span className="text-[#444] mx-1">→</span> <span className="text-white">{d.newPct}%</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setShowProgressionConfirm(false)}
                data-testid="progression-confirm-no"
                className="flex-1 border border-[#222] hover:border-[#444] py-3 px-4 text-xs uppercase tracking-widest transition-colors"
              >
                Nein, behalten
              </button>
              <button
                onClick={doSave}
                disabled={saving}
                data-testid="progression-confirm-yes"
                className="flex-1 bg-[#CCFF00] hover:bg-[#D4FF33] text-black font-bold py-3 px-4 text-xs uppercase tracking-widest transition-colors disabled:opacity-60"
              >
                {saving ? "Speichern..." : "Ja, festsetzen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
