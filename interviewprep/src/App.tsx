// App.tsx
//
// ── SETUP ──────────────────────────────────────────────────────────────────
//  1. npm install firebase
//  2. Fill in firebase.ts with your Firebase project credentials
//  3. In Firebase Console → Firestore → Rules, set:
//       allow read, write: if true;   ← (dev only; lock down for prod)
//  4. tsconfig.json → "lib": ["dom","es2020","dom.iterable"]
// ───────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import type { CSSProperties } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

import type { Unsubscribe } from "firebase/firestore";


type UserKey    = "varsha" | "rakshak";
type TaskStates = [boolean, boolean, boolean, boolean];
type DayMap     = Record<string, TaskStates>;   // key = day number as string "1"…"90"

interface AppData {
  varsha:    DayMap;
  rakshak:   DayMap;
  startDate: string | null;
}

interface Phase {
  id:    number;
  name:  string;
  sub:   string;
  range: [number, number];
  color: string;
  emoji: string;
}

interface RingProps   { val: number; color: string }
interface GraphProps  { data: AppData; comp: (u: UserKey, d: number) => number }
interface ModalProps  {
  day:      number;
  user:     UserKey;
  uc:       string;
  states:   TaskStates;
  onToggle: (idx: number) => void;
  onClose:  () => void;
}

// Extend CSSProperties to allow CSS custom-properties (--pc, --uc-s …)
type CX = CSSProperties & { [k: `--${string}`]: string | number };

// ─────────────────────────────────────────────
//  FIRESTORE
// ─────────────────────────────────────────────
const PROGRESS_DOC = doc(db, "interview_quest", "progress");

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const VARSHA_C  = "#FF6B9D";
const RAKSHAK_C = "#00D4FF";
const SUCCESS_C = "#00FFB2";

const PHASES: Phase[] = [
  { id:0, name:"Arrays & Hashing",  sub:"OOP",               range:[1,15],  color:"#FF6B6B", emoji:"🎯" },
  { id:1, name:"Sliding Window",    sub:"DBMS",              range:[16,30], color:"#FFA040", emoji:"📊" },
  { id:2, name:"Trees & Recursion", sub:"OS",                range:[31,45], color:"#22D3EE", emoji:"🌳" },
  { id:3, name:"Graphs & Heaps",    sub:"CN",                range:[46,60], color:"#00FFB2", emoji:"🕸️"  },
  { id:4, name:"DP & Greedy",       sub:"System Design+LLD", range:[61,75], color:"#A78BFA", emoji:"⚡" },
  { id:5, name:"Mock Interviews",   sub:"Company Prep",      range:[76,90], color:"#FF6B9D", emoji:"🚀" },
];

const CHECKPOINTS = new Set([7,14,21,28,35,42,49,56,63,70,77,84]);

const getDayTasks = (day: number): string[] =>
  day >= 76
    ? [
        "Mock Interview (DSA / System / HR)",
        "Timed problem solving (45 mins)",
        "Revise weak topics",
        "Company-specific preparation",
      ]
    : [
        "DSA: 2 problems (1 medium + 1 easy/hard)",
        "Core CS / Design: 30 min concept study",
        "Behavioral: Practice 1 question aloud",
        "Revision: Review previous mistakes",
      ];

const phaseOf = (day: number): Phase | undefined =>
  PHASES.find((p) => day >= p.range[0] && day <= p.range[1]);

const EMPTY_DATA: AppData = { varsha: {}, rakshak: {}, startDate: null };

const toFour = (arr: boolean[] | undefined): TaskStates => {
  const a = arr ?? [];
  return [a[0] ?? false, a[1] ?? false, a[2] ?? false, a[3] ?? false];
};

// ─────────────────────────────────────────────
//  CSS
// ─────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Figtree:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#06080F;overflow-x:hidden}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}

.iq{min-height:100vh;font-family:'Figtree',-apple-system,sans-serif;color:#E2E8F5;background:#06080F;
  background-image:radial-gradient(ellipse 55% 40% at 10% 70%,rgba(124,58,237,0.09) 0%,transparent 100%),
  radial-gradient(ellipse 45% 35% at 90% 15%,rgba(0,212,255,0.07) 0%,transparent 100%),
  radial-gradient(ellipse 30% 30% at 50% 50%,rgba(255,107,157,0.04) 0%,transparent 100%);
  padding-bottom:56px}

/* ── HEADER ── */
.iq-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;
  border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(6,8,15,0.92);
  position:sticky;top:0;z-index:100;backdrop-filter:blur(14px)}
.iq-brand{display:flex;align-items:center;gap:9px}
.iq-brand-icon{font-size:20px}
.iq-brand-name{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;
  background:linear-gradient(120deg,#FF6B9D 0%,#A78BFA 50%,#00D4FF 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.iq-hdr-right{display:flex;align-items:center;gap:10px}
.iq-toggle{display:flex;gap:5px;padding:3px;background:rgba(255,255,255,0.04);border-radius:10px}
.iq-ubtn{display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:7px;
  border:1.5px solid transparent;background:transparent;font-family:'Figtree',sans-serif;
  font-size:13px;font-weight:700;cursor:pointer;transition:all 0.22s;color:rgba(255,255,255,0.38)}
.iq-ubtn:hover{color:rgba(255,255,255,0.65)}
.iq-ubtn.v-on{background:rgba(255,107,157,0.13);border-color:rgba(255,107,157,0.45);color:#FF6B9D}
.iq-ubtn.r-on{background:rgba(0,212,255,0.12);border-color:rgba(0,212,255,0.4);color:#00D4FF}
.iq-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

/* ── SYNC BADGE ── */
.iq-sync{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;
  padding:4px 9px;border-radius:20px;border:1px solid}
.iq-sync.live{color:#00FFB2;border-color:rgba(0,255,178,0.25);background:rgba(0,255,178,0.07)}
.iq-sync.syncing{color:#FFA040;border-color:rgba(255,160,64,0.25);background:rgba(255,160,64,0.07)}
.iq-sync.error{color:#FF6B6B;border-color:rgba(255,107,107,0.25);background:rgba(255,107,107,0.07)}
.iq-sync.loading{color:rgba(255,255,255,0.3);border-color:rgba(255,255,255,0.08);background:rgba(255,255,255,0.03)}
.iq-sync-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.iq-sync.live .iq-sync-dot{animation:pulse-dot 2s ease-in-out infinite}
.iq-sync.syncing .iq-sync-dot{animation:spin-dot 0.8s linear infinite}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.6)}}
@keyframes spin-dot{0%{transform:scale(0.5);opacity:0.4}50%{transform:scale(1.2);opacity:1}100%{transform:scale(0.5);opacity:0.4}}

/* ── DATE BANNER ── */
.iq-date-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;
  margin:14px 20px 0;padding:12px 16px;background:rgba(124,58,237,0.07);
  border:1px solid rgba(124,58,237,0.18);border-radius:12px}
.iq-date-txt{font-size:12px;color:rgba(255,255,255,0.55);line-height:1.4}
.iq-date-btn{padding:6px 13px;border-radius:8px;border:1px solid rgba(167,139,250,0.4);
  background:rgba(167,139,250,0.1);color:#A78BFA;font-family:'Figtree',sans-serif;
  font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s;white-space:nowrap}
.iq-date-btn:hover{background:rgba(167,139,250,0.2)}
.iq-date-input{padding:6px 10px;border-radius:8px;border:1px solid rgba(167,139,250,0.35);
  background:rgba(255,255,255,0.04);color:white;font-family:'Figtree',sans-serif;
  font-size:12px;outline:none;cursor:pointer;color-scheme:dark}

/* ── DUAL STREAKS ── */
.iq-streaks{display:flex;gap:10px;padding:14px 20px 0}
.iq-sp{flex:1;display:flex;align-items:center;gap:10px;padding:12px 15px;border-radius:12px;border:1px solid}
.iq-sp-fire{font-size:24px;line-height:1;filter:drop-shadow(0 0 8px rgba(255,150,0,0.6))}
.iq-sp-num{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;line-height:1}
.iq-sp-lbl{font-size:10px;font-weight:700;opacity:0.6;text-transform:uppercase;
  letter-spacing:0.09em;margin-top:2px}

/* ── STATS ── */
.iq-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:14px 20px 0}
.iq-stat{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);
  border-radius:13px;padding:13px 10px;text-align:center;transition:all 0.25s;cursor:default}
.iq-stat:hover{background:rgba(255,255,255,0.04);transform:translateY(-1px)}
.iq-stat-v{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;line-height:1;margin-bottom:4px}
.iq-stat-l{font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);
  text-transform:uppercase;letter-spacing:0.1em}

/* ── PHASE TABS ── */
.iq-phases{display:flex;gap:7px;padding:16px 20px 0;overflow-x:auto;scrollbar-width:none}
.iq-phases::-webkit-scrollbar{display:none}
.iq-ptab{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:10px;
  border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);
  color:rgba(255,255,255,0.38);font-family:'Figtree',sans-serif;cursor:pointer;
  transition:all 0.2s;white-space:nowrap}
.iq-ptab:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.75)}
.iq-ptab.on{border-color:var(--pc);background:var(--pc-bg);color:var(--pc);box-shadow:0 0 18px var(--pc-sh)}
.iq-pn{font-size:12px;font-weight:700}
.iq-ps{font-size:10px;opacity:0.6;margin-top:1px}

/* ── SECTION HEADER ── */
.iq-sec-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 10px}
.iq-sec-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:700}
.iq-sec-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;
  background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.35)}

/* ── DAY GRID ── */
.iq-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:0 20px}
@media(max-width:560px){
  .iq-grid{grid-template-columns:repeat(3,1fr)}
  .iq-stats{grid-template-columns:repeat(2,1fr)}
}
.iq-day{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
  border-radius:12px;padding:11px 7px 9px;cursor:pointer;transition:all 0.22s;
  display:flex;flex-direction:column;align-items:center;gap:5px;
  position:relative;overflow:hidden}
.iq-day:hover{border-color:var(--pc);background:rgba(255,255,255,0.04);
  transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,0.35)}
.iq-day.partial{border-color:var(--uc-s)}
.iq-day.done{border-color:rgba(0,255,178,0.45);background:rgba(0,255,178,0.035)}
.iq-day.today{box-shadow:0 0 0 2px rgba(255,255,255,0.25),0 0 20px rgba(255,255,255,0.07)}
.iq-today-dot{position:absolute;top:5px;right:6px;width:6px;height:6px;border-radius:50%;
  background:white;box-shadow:0 0 6px white;animation:blink 2s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.65)}}
.iq-done-tick{position:absolute;top:4px;right:6px;font-size:9px;color:#00FFB2;font-weight:900}
.iq-dnum{font-size:9px;font-weight:800;color:rgba(255,255,255,0.3);
  text-transform:uppercase;letter-spacing:0.06em}
.iq-bars{width:100%;display:flex;flex-direction:column;gap:2.5px}
.iq-btrack{height:2.5px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden}
.iq-bfill{height:100%;border-radius:2px;transition:width 0.5s ease}

/* ── GRAPH ── */
.iq-graph{margin:18px 20px 0;background:rgba(255,255,255,0.02);
  border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:18px}
.iq-graph-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.iq-graph-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:rgba(255,255,255,0.7)}
.iq-graph-leg{display:flex;gap:14px;font-size:11px;font-weight:700}
.iq-graph-scroll{overflow-x:auto;scrollbar-width:thin;
  scrollbar-color:rgba(255,255,255,0.08) transparent;padding-bottom:3px}

/* ── MODAL ── */
.iq-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(7px);
  display:flex;align-items:flex-end;justify-content:center;z-index:1000;
  padding:16px;animation:iqfade 0.2s ease}
@media(min-width:500px){.iq-overlay{align-items:center}}
@keyframes iqfade{from{opacity:0}to{opacity:1}}
.iq-modal{background:#0D1220;border:1px solid rgba(255,255,255,0.1);border-radius:20px;
  padding:24px;width:100%;max-width:400px;position:relative;
  animation:iqup 0.32s cubic-bezier(0.34,1.56,0.64,1);
  box-shadow:0 32px 80px rgba(0,0,0,0.75);border-top:2px solid var(--pc)}
@keyframes iqup{from{opacity:0;transform:translateY(36px) scale(0.95)}
  to{opacity:1;transform:translateY(0) scale(1)}}
.iq-mclose{position:absolute;top:13px;right:13px;width:29px;height:29px;border-radius:7px;
  border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
  color:rgba(255,255,255,0.4);cursor:pointer;font-size:13px;
  display:flex;align-items:center;justify-content:center;transition:all 0.18s}
.iq-mclose:hover{background:rgba(255,255,255,0.09);color:white}
.iq-m-phase{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:3px}
.iq-m-day{font-family:'Syne',sans-serif;font-size:34px;font-weight:800;color:white;
  line-height:1;margin-bottom:3px}
.iq-m-sub{font-size:12px;color:rgba(255,255,255,0.32);margin-bottom:16px}
.iq-checkpoint{background:rgba(255,183,77,0.09);border:1px solid rgba(255,183,77,0.25);
  border-radius:9px;padding:9px 12px;font-size:12px;color:#FFB74D;
  margin-bottom:14px;font-weight:600;line-height:1.4}
.iq-tasks{display:flex;flex-direction:column;gap:7px}
.iq-task{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:11px;
  border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);
  cursor:pointer;transition:all 0.18s;user-select:none}
.iq-task:hover{background:rgba(255,255,255,0.045);border-color:rgba(255,255,255,0.14)}
.iq-task.tdone{background:rgba(0,255,178,0.04);border-color:rgba(0,255,178,0.2)}
.iq-chk{width:22px;height:22px;border-radius:6px;border:2px solid rgba(255,255,255,0.2);
  display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;
  flex-shrink:0;transition:all 0.24s cubic-bezier(0.34,1.56,0.64,1);color:#06080F}
.iq-chk.on{background:#00FFB2;border-color:#00FFB2;transform:scale(1.12)}
.iq-task-txt{font-size:13px;color:rgba(255,255,255,0.62);line-height:1.4;transition:all 0.15s}
.iq-task.tdone .iq-task-txt{color:rgba(255,255,255,0.85);
  text-decoration:line-through;text-decoration-color:rgba(0,255,178,0.35)}
.iq-mprog{margin-top:16px}
.iq-pbar-track{height:4px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;margin-bottom:9px}
.iq-pbar-fill{height:100%;border-radius:4px;background:#00FFB2;transition:width 0.4s ease}
.iq-plabel{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;text-align:center}

/* ── LOADING SCREEN ── */
.iq-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:100vh;background:#06080F;gap:16px}
.iq-spinner{width:36px;height:36px;border:3px solid rgba(255,255,255,0.07);
  border-top-color:#A78BFA;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.iq-loading-txt{font-family:'Figtree',sans-serif;font-size:13px;color:rgba(255,255,255,0.3)}

/* ── ERROR BANNER ── */
.iq-error-bar{margin:14px 20px 0;padding:12px 16px;background:rgba(255,107,107,0.08);
  border:1px solid rgba(255,107,107,0.22);border-radius:12px;
  font-size:12px;color:#FF6B6B;font-weight:600;line-height:1.4}
`;

// ─────────────────────────────────────────────
//  APP
// ─────────────────────────────────────────────
const App: React.FC = () => {
  const [user,      setUser]      = useState<UserKey>("varsha");
  const [data,      setData]      = useState<AppData>(EMPTY_DATA);
  const [selDay,    setSelDay]    = useState<number | null>(null);
  const [phase,     setPhase]     = useState<number>(0);
  const [pickDate,  setPickDate]  = useState<boolean>(false);
  const [fbStatus,  setFbStatus]  = useState<"loading" | "live" | "syncing" | "error">("loading");
  const [fbError,   setFbError]   = useState<string>("");

  // Debounce timer ref — avoids hammering Firestore on rapid checkbox clicks
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest data in a ref so the debounced writer always sees fresh state
  const dataRef = useRef<AppData>(data);
  dataRef.current = data;

  // ── Firestore real-time listener ──────────────────────────────────────
  useEffect(() => {
    setFbStatus("loading");
    const unsub: Unsubscribe = onSnapshot(
      PROGRESS_DOC,
      (snap) => {
        if (snap.exists()) {
          // Merge remote data — Firestore returns plain objects, cast safely
          const remote = snap.data() as Partial<AppData>;
          setData({
            varsha:    remote.varsha    ?? {},
            rakshak:   remote.rakshak   ?? {},
            startDate: remote.startDate ?? null,
          });
        }
        setFbStatus("live");
        setFbError("");
      },
      (err) => {
        console.error("Firestore error:", err);
        setFbStatus("error");
        setFbError(err.message);
      }
    );
    return () => unsub();
  }, []);

  // ── Debounced Firestore write ─────────────────────────────────────────
  const persist = useCallback((nd: AppData) => {
    setData(nd);                        // optimistic UI update
    setFbStatus("syncing");
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(async () => {
      try {
        await setDoc(PROGRESS_DOC, dataRef.current, { merge: true });
        setFbStatus("live");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Write failed";
        console.error("Firestore write error:", err);
        setFbStatus("error");
        setFbError(msg);
      }
    }, 600); // 600 ms debounce
  }, []);

  // ── Task toggle ───────────────────────────────────────────────────────
  const toggleTask = useCallback(
    (day: number, idx: number) => {
      const nd: AppData = {
        ...data,
        [user]: { ...data[user] },
      };
      const cur = toFour(nd[user][String(day)]);
      cur[idx]  = !cur[idx];
      nd[user][String(day)] = cur;
      persist(nd);
    },
    [data, user, persist]
  );

  const saveStartDate = useCallback(
    (dateStr: string) => {
      persist({ ...data, startDate: dateStr });
      setPickDate(false);
    },
    [data, persist]
  );

  // ── Helpers ───────────────────────────────────────────────────────────
  const comp = useCallback(
    (u: UserKey, d: number): number => {
      const t = data[u]?.[String(d)];
      return t ? t.filter(Boolean).length : 0;
    },
    [data]
  );

  const full = useCallback(
    (u: UserKey, d: number): boolean => comp(u, d) === 4,
    [comp]
  );

  const streak = useCallback(
    (u: UserKey): number => {
      let s = 0;
      let counting = false;
      for (let d = 90; d >= 1; d--) {
        if (full(u, d)) { counting = true; s++; }
        else if (counting) break;
      }
      return s;
    },
    [full]
  );

  const daysComplete  = (u: UserKey) =>
    Array.from({ length: 90 }, (_, i) => i + 1).filter((d) => full(u, d)).length;
  const tasksComplete = (u: UserKey) =>
    Array.from({ length: 90 }, (_, i) => i + 1).reduce((a, d) => a + comp(u, d), 0);

  const todayDay = (): number | null => {
    if (!data.startDate) return null;
    const d =
      Math.floor((Date.now() - new Date(data.startDate).getTime()) / 86_400_000) + 1;
    return d >= 1 && d <= 90 ? d : null;
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const uc      = user === "varsha" ? VARSHA_C : RAKSHAK_C;
  const ucSoft  = user === "varsha" ? "rgba(255,107,157,0.35)" : "rgba(0,212,255,0.3)";
  const ph      = PHASES[phase];
  const todD    = todayDay();
  const taskArr = selDay !== null
    ? toFour(data[user]?.[String(selDay)])
    : ([false,false,false,false] as TaskStates);

  const syncLabel: Record<typeof fbStatus, string> = {
    loading: "Connecting…",
    live:    "Live",
    syncing: "Saving…",
    error:   "Error",
  };

  // ── Loading screen ────────────────────────────────────────────────────
  if (fbStatus === "loading") {
    return (
      <>
        <style>{CSS}</style>
        <div className="iq-loading">
          <div className="iq-spinner" />
          <div className="iq-loading-txt">Connecting to Firebase…</div>
        </div>
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="iq">

        {/* ── HEADER ── */}
        <header className="iq-hdr">
          <div className="iq-brand">
            <span className="iq-brand-icon">⚔️</span>
            <span className="iq-brand-name">Interview Quest</span>
          </div>
          <div className="iq-hdr-right">
            {/* Sync status badge */}
            <div className={`iq-sync ${fbStatus}`}>
              <div className="iq-sync-dot" />
              {syncLabel[fbStatus]}
            </div>

            {/* User toggle */}
            <div className="iq-toggle">
              <button
                className={`iq-ubtn ${user === "varsha" ? "v-on" : ""}`}
                onClick={() => setUser("varsha")}
              >
                <span className="iq-dot" style={{ background: VARSHA_C }} />
                Varsha
              </button>
              <button
                className={`iq-ubtn ${user === "rakshak" ? "r-on" : ""}`}
                onClick={() => setUser("rakshak")}
              >
                <span className="iq-dot" style={{ background: RAKSHAK_C }} />
                Rakshak
              </button>
            </div>
          </div>
        </header>

        {/* ── Firebase error banner ── */}
        {fbStatus === "error" && (
          <div className="iq-error-bar">
            ⚠️ Firebase error: {fbError || "Could not connect. Check your config & Firestore rules."}
          </div>
        )}

        {/* ── DATE BAR ── */}
        <div className="iq-date-bar">
          <div className="iq-date-txt">
            {data.startDate ? (
              <>
                📅 Started{" "}
                {new Date(data.startDate).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                })}
                {todD ? (
                  <> · <strong style={{ color: "white" }}>Today = Day {todD}</strong></>
                ) : (
                  " · Plan complete or future date"
                )}
              </>
            ) : (
              "📅 Set your plan start date to highlight today's day"
            )}
          </div>
          {pickDate ? (
            <input
              type="date"
              className="iq-date-input"
              defaultValue={data.startDate ?? new Date().toISOString().slice(0, 10)}
              onChange={(e) => e.target.value && saveStartDate(e.target.value)}
            />
          ) : (
            <button className="iq-date-btn" onClick={() => setPickDate(true)}>
              {data.startDate ? "Change Date" : "Set Start Date"}
            </button>
          )}
        </div>

        {/* ── DUAL STREAKS ── */}
        <div className="iq-streaks">
          <div
            className="iq-sp"
            style={{ background:"rgba(255,107,157,0.06)", borderColor:"rgba(255,107,157,0.22)", color:VARSHA_C } as CX}
          >
            <span className="iq-sp-fire">🔥</span>
            <div>
              <div className="iq-sp-num">{streak("varsha") || "—"}</div>
              <div className="iq-sp-lbl">Varsha's Streak</div>
            </div>
          </div>
          <div
            className="iq-sp"
            style={{ background:"rgba(0,212,255,0.06)", borderColor:"rgba(0,212,255,0.2)", color:RAKSHAK_C } as CX}
          >
            <span className="iq-sp-fire">🔥</span>
            <div>
              <div className="iq-sp-num">{streak("rakshak") || "—"}</div>
              <div className="iq-sp-lbl">Rakshak's Streak</div>
            </div>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="iq-stats">
          {(
            [
              { v: streak(user),                                    l: "🔥 Streak"  },
              { v: daysComplete(user),                              l: "Days Done"  },
              { v: tasksComplete(user),                             l: "Tasks Done" },
              { v: `${Math.round(daysComplete(user) / 90 * 100)}%`, l: "Progress"  },
            ] as { v: string | number; l: string }[]
          ).map((s, i) => (
            <div className="iq-stat" key={i}>
              <div className="iq-stat-v" style={{ color: uc }}>{s.v}</div>
              <div className="iq-stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {/* ── PHASE TABS ── */}
        <div className="iq-phases">
          {PHASES.map((p, i) => {
            const done = Array.from({ length: 15 }, (_, j) => p.range[0] + j)
              .filter((d) => full(user, d)).length;
            const on   = phase === i;
            return (
              <button
                key={i}
                className={`iq-ptab${on ? " on" : ""}`}
                style={(on ? { "--pc": p.color, "--pc-bg": p.color + "16", "--pc-sh": p.color + "28" } : {}) as CX}
                onClick={() => setPhase(i)}
              >
                <span style={{ fontSize: 16 }}>{p.emoji}</span>
                <div>
                  <div className="iq-pn">{p.name}</div>
                  <div className="iq-ps">{p.sub} · {done}/15</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── SECTION HEADER ── */}
        <div className="iq-sec-hdr">
          <div className="iq-sec-title" style={{ color: ph.color }}>
            {ph.emoji} Days {ph.range[0]}–{ph.range[1]}
          </div>
          <div className="iq-sec-badge">
            {Array.from({ length: 15 }, (_, i) => ph.range[0] + i)
              .filter((d) => full(user, d)).length}/15 complete
          </div>
        </div>

        {/* ── DAY GRID ── */}
        <div className="iq-grid">
          {Array.from({ length: 15 }, (_, i) => {
            const day    = ph.range[0] + i;
            const vc     = comp("varsha",  day);
            const rc     = comp("rakshak", day);
            const uc2    = comp(user,      day);
            const isDone = full(user, day);
            const isToday = todD === day;
            const cls    = `iq-day${isDone ? " done" : uc2 > 0 ? " partial" : ""}${isToday ? " today" : ""}`;
            return (
              <div
                key={day}
                className={cls}
                style={{ "--pc": ph.color, "--uc-s": ucSoft } as CX}
                onClick={() => setSelDay(day)}
              >
                {isToday && <div className="iq-today-dot" />}
                {isDone  && <div className="iq-done-tick">✓</div>}
                <div className="iq-dnum">D{day}</div>
                <Ring val={uc2} color={isDone ? SUCCESS_C : uc} />
                <div className="iq-bars">
                  <div className="iq-btrack">
                    <div className="iq-bfill" style={{ width: `${(vc/4)*100}%`, background: VARSHA_C }} />
                  </div>
                  <div className="iq-btrack">
                    <div className="iq-bfill" style={{ width: `${(rc/4)*100}%`, background: RAKSHAK_C }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── GRAPH ── */}
        <Graph data={data} comp={comp} />

        {/* ── MODAL ── */}
        {selDay !== null && (
          <Modal
            day={selDay}
            user={user}
            uc={uc}
            states={taskArr}
            onToggle={(idx) => toggleTask(selDay, idx)}
            onClose={() => setSelDay(null)}
          />
        )}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────
const Ring: React.FC<RingProps> = ({ val, color }) => {
  const R = 17;
  const C = 2 * Math.PI * R;
  const f = (val / 4) * C;
  return (
    <svg width="42" height="42" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.5" />
      <circle
        cx="21" cy="21" r={R} fill="none"
        stroke={color} strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${f} ${C}`}
        transform="rotate(-90 21 21)"
        style={{ transition: "stroke-dasharray 0.4s ease,stroke 0.3s ease" }}
      />
      <text
        x="21" y="25" textAnchor="middle"
        fill="white" fontSize="10.5" fontWeight="700"
        fontFamily="Syne,sans-serif"
      >
        {val}/4
      </text>
    </svg>
  );
};

const Graph: React.FC<GraphProps> = ({ data: _data, comp }) => {
  const BW = 5, GAP = 1.5, PAIR = BW * 2 + GAP, H = 88;
  const svgW = 90 * (PAIR + 2) + 10;
  return (
    <div className="iq-graph">
      <div className="iq-graph-hdr">
        <div className="iq-graph-title">📈 90-Day Progress — Both Warriors</div>
        <div className="iq-graph-leg">
          <span style={{ color: VARSHA_C }}>● Varsha</span>
          <span style={{ color: RAKSHAK_C }}>● Rakshak</span>
        </div>
      </div>
      <div className="iq-graph-scroll">
        <svg
          width={svgW} height={H + 30}
          viewBox={`0 0 ${svgW} ${H + 30}`}
          style={{ display: "block" }}
        >
          {/* Phase background stripes */}
          {PHASES.map((p, i) => (
            <rect
              key={i}
              x={(p.range[0] - 1) * (PAIR + 2)} y={0}
              width={15 * (PAIR + 2)} height={H}
              fill={p.color} opacity="0.04" rx="2"
            />
          ))}

          {/* Day bars */}
          {Array.from({ length: 90 }, (_, i) => {
            const day = i + 1;
            const x   = i * (PAIR + 2);
            const vc  = comp("varsha",  day);
            const rc  = comp("rakshak", day);
            const vh  = (vc / 4) * H;
            const rh  = (rc / 4) * H;
            return (
              <g key={day}>
                <rect
                  x={x} y={H - Math.max(vh, 2)}
                  width={BW} height={Math.max(vh, 2)}
                  fill={VARSHA_C} opacity={vc > 0 ? 0.88 : 0.1} rx="1.5"
                />
                <rect
                  x={x + BW + GAP} y={H - Math.max(rh, 2)}
                  width={BW} height={Math.max(rh, 2)}
                  fill={RAKSHAK_C} opacity={rc > 0 ? 0.88 : 0.1} rx="1.5"
                />
                {day % 15 === 1 && (
                  <text
                    x={x} y={H + 14}
                    fill="rgba(255,255,255,0.28)"
                    fontSize="8" fontFamily="Figtree,sans-serif"
                  >
                    D{day}
                  </text>
                )}
              </g>
            );
          })}

          {/* Phase emoji footers */}
          {PHASES.map((p, i) => (
            <text
              key={i}
              x={(p.range[0] - 1) * (PAIR + 2) + (15 * (PAIR + 2)) / 2}
              y={H + 26}
              fill="rgba(255,255,255,0.22)"
              fontSize="9" textAnchor="middle"
              fontFamily="Figtree,sans-serif"
            >
              {p.emoji} {p.name.split(" ")[0]}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
};

const Modal: React.FC<ModalProps> = ({ day, user, uc, states, onToggle, onClose }) => {
  const ph    = phaseOf(day);
  const tasks = getDayTasks(day);
  const done  = states.filter(Boolean).length;
  const isCp  = CHECKPOINTS.has(day);
  return (
    <div className="iq-overlay" onClick={onClose}>
      <div
        className="iq-modal"
        style={{ "--pc": ph?.color ?? "#fff" } as CX}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="iq-mclose" onClick={onClose}>✕</button>

        <div className="iq-m-phase" style={{ color: ph?.color }}>{ph?.emoji} {ph?.name}</div>
        <div className="iq-m-day">Day {day}</div>
        <div className="iq-m-sub">
          {ph?.sub} · {user === "varsha" ? "Varsha" : "Rakshak"}
        </div>

        {isCp && (
          <div className="iq-checkpoint">
            ⚡ Weekly Checkpoint — Take a full mock interview, review all mistakes &amp; update resume stories
          </div>
        )}

        <div className="iq-tasks">
          {tasks.map((t, i) => (
            <div
              key={i}
              className={`iq-task${states[i] ? " tdone" : ""}`}
              onClick={() => onToggle(i)}
            >
              <div className={`iq-chk${states[i] ? " on" : ""}`}>
                {states[i] && "✓"}
              </div>
              <span className="iq-task-txt">{t}</span>
            </div>
          ))}
        </div>

        <div className="iq-mprog">
          <div className="iq-pbar-track">
            <div className="iq-pbar-fill" style={{ width: `${(done / 4) * 100}%` }} />
          </div>
          <div className="iq-plabel" style={{ color: done === 4 ? SUCCESS_C : uc }}>
            {done === 4
              ? "🎉 Day Complete! Keep the streak going!"
              : done === 0
              ? "Tap any task to mark it done"
              : `${done}/4 done — keep pushing! 💪`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;