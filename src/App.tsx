import React, { useEffect, useMemo, useRef, useState } from "react";
import { WORD_BANK } from "./data/wordBank";
import { pickWords } from "./utils/selectWords";
import { createSeededRandom } from "./utils/seededRandom";

/* ================= AUDIO FILES ================= */
import wordFoundSoundFile from "./assets/mixkit-cool-interface-click-tone-2568.wav";
import puzzleCompleteSoundFile from "./assets/mixkit-achievement-bell-600.wav";

/* ================= TYPES ================= */
type Page = "home" | "packs" | "game";
type Vec = { x: number; y: number };
type Cell = { r: number; c: number };

/* ================= CONSTANTS ================= */
const GRID_SIZE = 10;
const WORDS_PER_PUZZLE = 10;
const PACK_SIZE = 5;
const NAVY = "#0a1f44";
const PACKS_PER_DAY = 50;

const COMPLETED_PACKS_KEY = "nwsl_completed_packs_v2";
const STARTED_PACKS_KEY = "nwsl_started_packs_v1";

/* ================= IDB (completed only) ================= */
const IDB_DB = "nwsl";
const IDB_STORE = "kv";
const IDB_KEY = "completedPacks";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(value as any, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/* ================= STORAGE ================= */
async function getStartedPacks(): Promise<Record<string, number>> {
  try {
    const raw = localStorage.getItem(STARTED_PACKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function markPackStarted(seed: string) {
  const packs = await getStartedPacks();
  if (!packs[seed]) {
    packs[seed] = Date.now();
    localStorage.setItem(STARTED_PACKS_KEY, JSON.stringify(packs));
  }
}

async function getCompletedPacks(): Promise<Record<string, number>> {
  try {
    const fromIdb = await idbGet<Record<string, number>>(IDB_KEY);
    if (fromIdb && typeof fromIdb === "object") return fromIdb;
  } catch {}

  try {
    const raw = localStorage.getItem(COMPLETED_PACKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function markPackCompleted(seed: string, timeMs: number): Promise<number> {
  const packs = await getCompletedPacks();
  const prev = packs[seed];
  const best = typeof prev === "number" ? Math.min(prev, timeMs) : timeMs;

  const next = { ...packs, [seed]: best };

  try {
    await idbSet(IDB_KEY, next);
  } catch {}

  try {
    localStorage.setItem(COMPLETED_PACKS_KEY, JSON.stringify(next));
  } catch {}

  return best;
}

/* ================= DATE ================= */
function todayKeyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/* ================= AUDIO ================= */
/* ================= AUDIO ================= */
let audioUnlocked = false;

// 🔊 Sound pools (IMPORTANT)
const WORD_SOUND_POOL = Array.from({ length: 3 }, () => new Audio(wordFoundSoundFile));
const COMPLETE_SOUND_POOL = Array.from({ length: 2 }, () => new Audio(puzzleCompleteSoundFile));

let wordSoundIndex = 0;
let completeSoundIndex = 0;

function unlockAudioSilently() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  [...WORD_SOUND_POOL, ...COMPLETE_SOUND_POOL].forEach((a) => {
    a.muted = true;
    a.currentTime = 0;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      })
      .catch(() => {});
  });
}

function playWordSound() {
  if (!audioUnlocked) return;
  const a = WORD_SOUND_POOL[wordSoundIndex];
  wordSoundIndex = (wordSoundIndex + 1) % WORD_SOUND_POOL.length;
  a.currentTime = 0;
  a.play().catch(() => {});
}

function playCompleteSound() {
  if (!audioUnlocked) return;
  const a = COMPLETE_SOUND_POOL[completeSoundIndex];
  completeSoundIndex = (completeSoundIndex + 1) % COMPLETE_SOUND_POOL.length;
  a.currentTime = 0;
  a.play().catch(() => {});
}

/* ================= TIME ================= */
function formatTime(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const h = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(h).padStart(
    2,
    "0"
  )}`;
}

/* ================= PUZZLE HELPERS ================= */
function gridContainsWord(grid: string[][], word: string) {
  const dirs: Cell[] = [
    { r: 0, c: 1 },
    { r: 0, c: -1 },
    { r: 1, c: 0 },
    { r: -1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: -1 },
    { r: -1, c: 1 },
    { r: -1, c: -1 },
  ];
  const rev = word.split("").reverse().join("");

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      for (const d of dirs) {
        let okF = true;
        let okR = true;

        for (let i = 0; i < word.length; i++) {
          const rr = r + d.r * i;
          const cc = c + d.c * i;

          if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) {
            okF = false;
            okR = false;
            break;
          }
          if (grid[rr][cc] !== word[i]) okF = false;
          if (grid[rr][cc] !== rev[i]) okR = false;
        }

        if (okF || okR) return true;
      }
    }
  }
  return false;
}

function generatePuzzleGuaranteed(words: string[], seed: string) {
  const rng = createSeededRandom(seed);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const dirs: Cell[] = [
    { r: 0, c: 1 },
    { r: 0, c: -1 },
    { r: 1, c: 0 },
    { r: -1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: -1 },
    { r: -1, c: 1 },
    { r: -1, c: -1 },
  ];

  for (let a = 0; a < 40; a++) {
    const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
    let fail = false;

    for (const w of words) {
      let placed = false;

      for (let t = 0; t < 600 && !placed; t++) {
        const d = dirs[Math.floor(rng() * dirs.length)];
        const r = Math.floor(rng() * GRID_SIZE);
        const c = Math.floor(rng() * GRID_SIZE);

        let ok = true;
        for (let i = 0; i < w.length; i++) {
          const rr = r + d.r * i;
          const cc = c + d.c * i;
          if (
            rr < 0 ||
            rr >= GRID_SIZE ||
            cc < 0 ||
            cc >= GRID_SIZE ||
            (grid[rr][cc] && grid[rr][cc] !== w[i])
          ) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        for (let i = 0; i < w.length; i++) {
          grid[r + d.r * i][c + d.c * i] = w[i];
        }
        placed = true;
      }

      if (!placed) {
        fail = true;
        break;
      }
    }

    if (fail) continue;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!grid[r][c]) {
          grid[r][c] = letters[Math.floor(rng() * letters.length)];
        }
      }
    }

    if (words.every((w) => gridContainsWord(grid, w))) return grid;
  }

  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill("X"));
}

/** Optional: feedback link */
const FEEDBACK_URL = "https://forms.gle/HqB58mpCepuhvK8UA";

/* ================= APP ================= */
export default function App() {
  const [page, setPage] = useState<Page>("home");

  // which pack user selected today
  const [packSeedIndex, setPackSeedIndex] = useState(0);

  // completed packs { seed: bestTimeMs }
  const [completedPacks, setCompletedPacks] = useState<Record<string, number>>({});

  // started packs { seed: startedAtMs }
  const [startedPacks, setStartedPacks] = useState<Record<string, number>>({});

  // Pack progress
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [packComplete, setPackComplete] = useState(false);

  // 3-2-1 countdown overlay (blocks interaction)
  const [countdown, setCountdown] = useState(3);
  const [gameReady, setGameReady] = useState(false);

  // Timer
  const packStart = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Word finding state
  const [found, setFound] = useState<Set<string>>(new Set());
  const [lockedLines, setLockedLines] = useState<{ a: Vec; b: Vec }[]>([]);
  const [liveLine, setLiveLine] = useState<{ start: Vec; end: Vec } | null>(null);

  // Selection refs
  const gridRef = useRef<HTMLDivElement>(null);
  const startCell = useRef<Cell | null>(null);
  const dirLock = useRef<Cell | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const lastClient = useRef<{ x: number; y: number } | null>(null);

  const dayKeyRef = useRef(todayKeyLocal());

  function dailyPackSeeds(count: number, day: string) {
    return Array.from({ length: count }, (_, i) => `daily-${day}-pack-${i + 1}`);
  }

  const dailySeeds = useMemo(() => dailyPackSeeds(PACKS_PER_DAY, dayKeyRef.current), []);

  const activePackSeed = dailySeeds[packSeedIndex % dailySeeds.length];

  // Load started packs on boot
  useEffect(() => {
    (async () => {
      const packs = await getStartedPacks();
      setStartedPacks(packs);
    })();
  }, []);

  // Refresh started packs when entering packs page
  useEffect(() => {
    if (page !== "packs") return;
    (async () => {
      const packs = await getStartedPacks();
      setStartedPacks(packs);
    })();
  }, [page]);

  // Load completed packs on boot
  useEffect(() => {
    (async () => {
      const packs = await getCompletedPacks();
      setCompletedPacks(packs);
    })();
  }, []);

  // Refresh completed packs when entering packs page
  useEffect(() => {
    if (page !== "packs") return;
    (async () => {
      const packs = await getCompletedPacks();
      setCompletedPacks(packs);
    })();
  }, [page]);

  useEffect(() => {
    try {
      localStorage.setItem("__test", "1");
      localStorage.removeItem("__test");
    } catch {
      alert("⚠️ Private Browsing detected.\nProgress will not save.\nPlease use normal Safari mode.");
    }
  }, []);

  /* ================= Words / Grid ================= */
  const words = useMemo(() => {
    const puzzleSeed = `${activePackSeed}-${puzzleIndex}`;
    return pickWords(WORD_BANK, WORDS_PER_PUZZLE, GRID_SIZE, puzzleSeed);
  }, [activePackSeed, puzzleIndex]);

  const grid = useMemo(() => {
    const gridSeed = `${activePackSeed}-${puzzleIndex}-grid`;
    return generatePuzzleGuaranteed(words, gridSeed);
  }, [words, activePackSeed, puzzleIndex]);

  /* ================= Disable pull-to-refresh / selection (game only) ================= */
  useEffect(() => {
    if (page !== "game") return;

    const prevent = (e: TouchEvent) => e.preventDefault();
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.addEventListener("touchmove", prevent, { passive: false });

    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
      document.removeEventListener("touchmove", prevent);
    };
  }, [page]);

  /* ================= Global cleanup so the line never gets stuck ================= */
  useEffect(() => {
    const clear = () => {
      setLiveLine(null);
      startCell.current = null;
      startPoint.current = null;
      dirLock.current = null;
    };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, []);

  /* ================= Start game: countdown overlay ================= */
  useEffect(() => {
    if (page !== "game") return;

    // reset per entry
    setPackComplete(false);
    setPuzzleIndex(0);
    setFound(new Set());
    setLockedLines([]);
    setLiveLine(null);
    setElapsedMs(0);
    packStart.current = null;

    // countdown
    setGameReady(false);
    setCountdown(3);

    const cd = window.setInterval(() => {
      setCountdown((c) => {
        if (c === 1) {
          window.clearInterval(cd);

          // ✅ commit attempt ONLY when countdown finishes
          (async () => {
            await markPackStarted(activePackSeed);
            const packs = await getStartedPacks();
            setStartedPacks(packs);
          })();

          setGameReady(true);
          packStart.current = null; // timer effect sets it
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => window.clearInterval(cd);
  }, [page, activePackSeed]);

  /* ================= Timer (runs only when gameReady and not complete) ================= */
  useEffect(() => {
    if (page !== "game") return;
    if (!gameReady) return;
    if (packComplete) return;

    if (!packStart.current) packStart.current = performance.now();

    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - (packStart.current || 0));
    }, 30);

    return () => window.clearInterval(id);
  }, [page, gameReady, packComplete, puzzleIndex]);

  /* ================= Advance puzzles / complete pack ================= */
  useEffect(() => {
    if (page !== "game") return;
    if (!gameReady) return;
    if (packComplete) return;
    if (found.size !== words.length || !words.length) return;

    // finished a puzzle
    if (puzzleIndex < PACK_SIZE - 1) {
      setPuzzleIndex((i) => i + 1);
      setFound(new Set());
      setLockedLines([]);
      setLiveLine(null);
      startCell.current = null;
      startPoint.current = null;
      dirLock.current = null;
    } else {
      // finished the whole PACK
      setPackComplete(true);
      playCompleteSound();
      navigator.vibrate?.(30);

      (async () => {
        const best = await markPackCompleted(activePackSeed, elapsedMs);
        setCompletedPacks((p) => ({ ...p, [activePackSeed]: best }));
      })();
    }
  }, [found, words.length, puzzleIndex, page, gameReady, packComplete, activePackSeed, elapsedMs]);

  /* ================= Geometry ================= */
  function rect() {
    return gridRef.current!.getBoundingClientRect();
  }

  function center(c: Cell): Vec {
    const r = rect();
    return {
      x: (c.c + 0.5) * (r.width / GRID_SIZE),
      y: (c.r + 0.5) * (r.height / GRID_SIZE),
    };
  }
  
  function cellFromClient(x: number, y: number): Cell | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;

    const cellEl = el.closest(".cell") as HTMLElement | null;
    if (!cellEl) return null;

    const r = Number(cellEl.dataset.r);
    const c = Number(cellEl.dataset.c);

    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    return { r, c };
  }

  /* ================= Pointer handlers ================= */
    function onDown(e: React.PointerEvent) {
    if (page !== "game") return;
    if (!gameReady) return;
    if (packComplete) return;

    unlockAudioSilently();

    const c = cellFromClient(e.clientX, e.clientY);
    if (!c) return;

    startCell.current = c;
    startPoint.current = { x: e.clientX, y: e.clientY };
    lastClient.current = { x: e.clientX, y: e.clientY };
    dirLock.current = null;

    const r = rect();
    setLiveLine({
      start: center(c),
      end: { x: e.clientX - r.left, y: e.clientY - r.top },
    });
  }

  function onMove(e: React.PointerEvent) {
    if (page !== "game") return;
    if (!gameReady) return;
    if (!startCell.current || packComplete) return;
        lastClient.current = { x: e.clientX, y: e.clientY };

    const r = rect();
    
    // Direction lock in PIXELS (more reliable than grid-cell deltas)
    if (!dirLock.current && startPoint.current) {
      const dx = e.clientX - startPoint.current.x;
      const dy = e.clientY - startPoint.current.y;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      const MIN_PIXELS = 10;
      if (adx < MIN_PIXELS && ady < MIN_PIXELS) {
        setLiveLine({
          start: center(startCell.current),
          end: { x: e.clientX - r.left, y: e.clientY - r.top },
        });
        return;
      }

      const DIAGONAL_SLOP = 0.38;
      const AXIS_DOMINANCE = 2.4;

      const min = Math.min(adx, ady);
      const max = Math.max(adx, ady);

      if (min / max >= DIAGONAL_SLOP) {
        dirLock.current = { r: Math.sign(dy), c: Math.sign(dx) };
      } else if (ady >= adx * AXIS_DOMINANCE) {
        dirLock.current = { r: Math.sign(dy), c: 0 };
      } else if (adx >= ady * AXIS_DOMINANCE) {
        dirLock.current = { r: 0, c: Math.sign(dx) };
      }
    }

    setLiveLine({
      start: center(startCell.current),
      end: { x: e.clientX - r.left, y: e.clientY - r.top },
    });
  }
  
    function onUp() {
    try {
      if (page !== "game") return;
      if (!gameReady) return;
      if (packComplete) return;
      if (!startCell.current) return;
      if (!lastClient.current) return;

      const sr = startCell.current.r;
      const sc = startCell.current.c;

      const lift = lastClient.current;
      const liftCell = cellFromClient(lift.x, lift.y);

      // Determine direction from drag (8 directions)
      let stepR = 0;
      let stepC = 0;

      if (startPoint.current) {
        const dx = lift.x - startPoint.current.x;
        const dy = lift.y - startPoint.current.y;

        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        // ignore tiny drags/taps
        if (adx < 8 && ady < 8) return;

        if (ady > adx * 2) {
          stepR = Math.sign(dy);
          stepC = 0;
        } else if (adx > ady * 2) {
          stepR = 0;
          stepC = Math.sign(dx);
        } else {
          stepR = Math.sign(dy);
          stepC = Math.sign(dx);
        }
      } else if (liftCell) {
        stepR = Math.sign(liftCell.r - sr);
        stepC = Math.sign(liftCell.c - sc);
      }

      if (stepR === 0 && stepC === 0) return;

      // 🔥 Forgiveness knob (increase to be looser)
      const END_TOL = 1; // 1 = normal, 2 = very forgiving, 3 = super forgiving

      function liftCloseTo(end: Cell, tol: number) {
        if (!liftCell) return true;
        const d = Math.max(Math.abs(liftCell.r - end.r), Math.abs(liftCell.c - end.c));
        return d <= tol;
      }

      for (const w of words) {
        if (found.has(w)) continue;

        const end: Cell = { r: sr + stepR * (w.length - 1), c: sc + stepC * (w.length - 1) };

        // end must be on grid
        if (end.r < 0 || end.r >= GRID_SIZE || end.c < 0 || end.c >= GRID_SIZE) continue;

        // allow lift to be near endpoint (forgiving)
        if (!liftCloseTo(end, END_TOL)) continue;

        const cells: Cell[] = Array.from({ length: w.length }, (_, i) => ({
          r: sr + stepR * i,
          c: sc + stepC * i,
        }));

        const forward = cells.map((c) => grid[c.r][c.c]).join("");
        const backward = cells.slice().reverse().map((c) => grid[c.r][c.c]).join("");

        if (forward !== w && backward !== w) continue;

        // ✅ MATCH — line uses true endpoints (fixes “found but no line”)
        playWordSound();
        navigator.vibrate?.(12);

        setFound((p) => new Set(p).add(w));
        setLockedLines((p) => [...p, { a: center(cells[0]), b: center(cells[cells.length - 1]) }]);

        return;
      }
    } finally {
      setLiveLine(null);
      startCell.current = null;
      startPoint.current = null;
      lastClient.current = null;
      dirLock.current = null;
    }
  }

  /* ================= UI actions ================= */
  function playAgain() {
    setPackSeedIndex((i) => (i + 1) % dailySeeds.length);
    setPage("game");
  }

  /* ================= RENDER ================= */
  if (page === "home") {
    return (
      <div className="app" style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(10,31,68,0.2)",
            color: NAVY,
            background: "rgba(255,255,255,0.85)",
          }}
        >
          Private Alpha — Progress may reset
        </div>

        {FEEDBACK_URL && (
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              fontSize: 12,
              color: NAVY,
              textDecoration: "underline",
              opacity: 0.85,
            }}
          >
            Feedback
          </a>
        )}

        <div className="center-content">
          <h1 className="title">NWSL</h1>
          <h2 className="subtitle">National Word Search League</h2>

          <button className="main-button" onClick={() => setPage("packs")}>
            PLAY
          </button>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75, color: NAVY }}>
            Friday test build: no accounts, no ratings, no leaderboards.
          </div>
        </div>
      </div>
    );
  }

  if (page === "packs") {
    return (
      <div className="app">
        <button className="back-button" onClick={() => setPage("home")}>
          ← Home
        </button>

        <div className="center-content">
          <h2 style={{ marginBottom: 12 }}>Today’s Puzzle Packs</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>All players see the same packs today</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12,
              maxWidth: 420,
            }}
          >
            {dailySeeds.map((seed, i) => {
              const timeMs = completedPacks[seed];
              const started = typeof startedPacks[seed] === "number";
              const completed = Number.isFinite(timeMs);
              const locked = started && !completed;

              return (
                <button
                  key={seed}
                  className="main-button"
                  disabled={completed || locked}
                  style={{
                    padding: "12px 0",
                    opacity: completed || locked ? 0.4 : 1,
                    cursor: completed || locked ? "not-allowed" : "pointer",
                  }}
                  onClick={() => {
                    if (completed || locked) return;
                    setPackSeedIndex(i);
                    setPage("game");
                  }}
                >
                  {completed
                    ? `Pack ${i + 1} ✓ ${formatTime(timeMs)}`
                    : locked
                    ? `Pack ${i + 1} 🔒 In Progress`
                    : `Pack ${i + 1}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // GAME
  return (
    <div className="game-page">
      <button className="back-button" onClick={() => setPage("packs")}>
        ← Packs
      </button>

      {!gameReady && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      userSelect: "none",
      WebkitUserSelect: "none",
    }}
  >
    <div style={{ textAlign: "center", maxWidth: 320 }}>
      <div
        style={{
          fontSize: 14,
          color: NAVY,
          opacity: 0.85,
          marginBottom: 14,
          lineHeight: 1.4,
        }}
      >
        Once this puzzle pack starts, leaving will lock it for today.
      </div>

      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: NAVY,
          lineHeight: 1,
        }}
      >
        {countdown === 0 ? "GO!" : countdown}
      </div>
    </div>
  </div>
)}


      <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: NAVY, opacity: 0.7 }}>
        Private Alpha — Progress may reset
      </div>

      <div style={{ textAlign: "center", marginBottom: 6, color: NAVY, fontWeight: 600 }}>
        Puzzle {puzzleIndex + 1}/{PACK_SIZE}
      </div>

      <div
        ref={gridRef}
        className="grid-wrap"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <svg className="line-layer">
          {lockedLines.map((l, i) => (
            <line
              key={i}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke={NAVY}
              strokeWidth="1.5"
              strokeOpacity="0.35"
              strokeLinecap="round"
            />
          ))}
          {liveLine && (
            <line
              x1={liveLine.start.x}
              y1={liveLine.start.y}
              x2={liveLine.end.x}
              y2={liveLine.end.y}
              stroke={NAVY}
              strokeWidth="1.5"
              strokeOpacity="0.35"
              strokeLinecap="round"
            />
          )}
        </svg>

        <div className="grid">
  {grid.map((row, r) => (
    <React.Fragment key={r}>
      {row.map((ch, c) => (
        <div
          key={`${r}-${c}`}
          className="cell"
          data-r={r}
          data-c={c}
        >
          {ch}
        </div>
      ))}
    </React.Fragment>
  ))}
</div> {/* ← closes .grid */}
</div> {/* ← 🔥 THIS closes .grid-wrap */}

<div className="words-grid">

        {Array.from({ length: 25 }).map((_, i) => {
          const w = words[i] ?? "";
          return (
            <div key={i} className={`word-slot ${w && found.has(w) ? "found" : ""}`}>
              {w}
            </div>
          );
        })}
      </div>

      <div className="timer-under">{formatTime(elapsedMs)}</div>

      {packComplete && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Puzzle Pack Complete</h2>
            <p style={{ fontSize: 18, marginBottom: 12 }}>Time: {formatTime(elapsedMs)}</p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="main-button" onClick={playAgain}>
                Next Pack
              </button>

              <button className="main-button" onClick={() => setPage("packs")}>
                Back to Packs
              </button>

              <button className="main-button" onClick={() => setPage("home")}>
                Home
              </button>
            </div>

            {FEEDBACK_URL && (
              <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8 }}>
                <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
                  Send feedback
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
