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

/* ================= IDB (iOS-safe persistence) ================= */
const IDB_DB = "nwsl";
const IDB_STORE = "kv";
const IDB_KEY = "completedPacks";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
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
const STARTED_PACKS_KEY = "nwsl_started_packs_v1";
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
    packs[seed] = Date.now(); // lock moment
    localStorage.setItem(STARTED_PACKS_KEY, JSON.stringify(packs));
  }
}

// Primary: IndexedDB (iOS safe). Secondary: localStorage (best-effort).
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

// Best time only (lower ms = better)
async function markPackCompleted(seed: string, timeMs: number): Promise<number> {
  const packs = await getCompletedPacks();
  const prev = packs[seed];
  const best = typeof prev === "number" ? Math.min(prev, timeMs) : timeMs;

  const next = { ...packs, [seed]: best };

  // Save to IDB (primary)
  try {
    await idbSet(IDB_KEY, next);
  } catch {}

  // Also try localStorage (secondary)
  try {
    localStorage.setItem(COMPLETED_PACKS_KEY, JSON.stringify(next));
  } catch {}

  return best;
}

/* ================= DATE / SEEDS ================= */
function todayKeyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Optional: put your real feedback link here for Friday */
const FEEDBACK_URL = "https://forms.gle/HqB58mpCepuhvK8UA";

/* ================= AUDIO ================= */
let audioUnlocked = false;
const wordFoundSound = new Audio(wordFoundSoundFile);
const puzzleCompleteSound = new Audio(puzzleCompleteSoundFile);

// Silent “warm up” to satisfy iOS/Chrome gesture requirement
function unlockAudioSilently() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  [wordFoundSound, puzzleCompleteSound].forEach((a) => {
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

function playSound(a: HTMLAudioElement) {
  if (!audioUnlocked) return;
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

/* ================= APP ================= */
export default function App() {
  const [page, setPage] = useState<Page>("home");

  // which pack user selected today
  const [packSeedIndex, setPackSeedIndex] = useState(0);

  // completed packs { seed: bestTimeMs }
  const [completedPacks, setCompletedPacks] = useState<Record<string, number>>({});

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

  const dayKeyRef = useRef(todayKeyLocal());

  function dailyPackSeeds(count: number, day: string) {
    return Array.from({ length: count }, (_, i) => `daily-${day}-pack-${i + 1}`);
  }

  const dailySeeds = useMemo(() => dailyPackSeeds(PACKS_PER_DAY, dayKeyRef.current), []);

  // Load completed packs on boot (FIX: await the async function)
  useEffect(() => {
    (async () => {
      const packs = await getCompletedPacks();
      setCompletedPacks(packs);
    })();
  }, []);

  // Refresh completed packs whenever user enters packs page (keeps UI correct on iPhone/PWA)
  useEffect(() => {
    if (page !== "packs") return;
    (async () => {
      const packs = await getCompletedPacks();
      setCompletedPacks(packs);
    })();
  }, [page]);

  const activePackSeed = dailySeeds[packSeedIndex % dailySeeds.length];

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
    // 🔒 LOCK PACK ON FIRST ENTRY
  markPackStarted(activePackSeed);
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
      playSound(puzzleCompleteSound);
      navigator.vibrate?.(30);

      // ✅ lock pack + save best time (FIX: async + state update with best time)
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

  function dist(a: Vec, b: Vec) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ================= Pointer handlers ================= */
  function onDown(e: React.PointerEvent) {
    if (page !== "game") return;
    if (!gameReady) return;
    if (packComplete) return;

    // Must be called from a real gesture
    unlockAudioSilently();

    const r = rect();
    const rr = Math.floor(((e.clientY - r.top) / r.height) * GRID_SIZE);
    const cc = Math.floor(((e.clientX - r.left) / r.width) * GRID_SIZE);
    if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return;

    startCell.current = { r: rr, c: cc };
    startPoint.current = { x: e.clientX, y: e.clientY };
    dirLock.current = null;
  }

  function onMove(e: React.PointerEvent) {
    if (page !== "game") return;
    if (!gameReady) return;
    if (!startCell.current || packComplete) return;

    const r = rect();

    // Direction lock in PIXELS (more reliable than grid-cell deltas)
    if (!dirLock.current && startPoint.current) {
      const dx = e.clientX - startPoint.current.x;
      const dy = e.clientY - startPoint.current.y;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      const MIN_PIXELS = 14;
      if (adx < MIN_PIXELS && ady < MIN_PIXELS) {
        // still update live line for feedback
        setLiveLine({
          start: center(startCell.current),
          end: { x: e.clientX - r.left, y: e.clientY - r.top },
        });
        return;
      }

      const DIAGONAL_SLOP = 0.58; // lower = easier diagonal
      const AXIS_DOMINANCE = 2.6; // higher = stricter axis

      const min = Math.min(adx, ady);
      const max = Math.max(adx, ady);

      // DIAGONAL
      if (min / max >= DIAGONAL_SLOP) {
        dirLock.current = { r: Math.sign(dy), c: Math.sign(dx) };
      }
      // VERTICAL
      else if (ady >= adx * AXIS_DOMINANCE) {
        dirLock.current = { r: Math.sign(dy), c: 0 };
      }
      // HORIZONTAL
      else if (adx >= ady * AXIS_DOMINANCE) {
        dirLock.current = { r: 0, c: Math.sign(dx) };
      }
      // otherwise: no lock yet (user hasn’t committed)
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
      if (!startCell.current || !dirLock.current || packComplete) return;

      for (const w of words) {
        if (found.has(w)) continue;

        const cells = Array.from({ length: w.length }, (_, i) => ({
          r: startCell.current!.r + dirLock.current!.r * i,
          c: startCell.current!.c + dirLock.current!.c * i,
        }));

        if (cells.some((c) => c.r < 0 || c.r >= GRID_SIZE || c.c < 0 || c.c >= GRID_SIZE)) {
          continue;
        }

        const text = cells.map((c) => grid[c.r][c.c]).join("");
        const rev = text.split("").reverse().join("");
        if (text !== w && rev !== w) continue;

        // Require finger to be near either end (prevents “ghost finds”)
        const r = rect();
        const fingerPos: Vec = {
          x: liveLine?.end.x ?? center(cells[cells.length - 1]).x,
          y: liveLine?.end.y ?? center(cells[cells.length - 1]).y,
        };

        const startCenter = center(cells[0]);
        const endCenter = center(cells[cells.length - 1]);

        const CELL_RADIUS = r.width / GRID_SIZE / 2;
        const END_TOLERANCE = CELL_RADIUS * 0.99;

        const dStart = dist(fingerPos, startCenter);
        const dEnd = dist(fingerPos, endCenter);

        if (Math.min(dStart, dEnd) > END_TOLERANCE) continue;

        // ✅ FOUND
        playSound(wordFoundSound);
        navigator.vibrate?.(12);

        setFound((p) => new Set(p).add(w));
        setLockedLines((p) => [...p, { a: center(cells[0]), b: center(cells[cells.length - 1]) }]);
        break;
      }
    } finally {
      setLiveLine(null);
      startCell.current = null;
      startPoint.current = null;
      dirLock.current = null;
    }
  }

  /* ================= UI actions ================= */
  function playAgain() {
    // This is “next pack”, not replay same pack
    setPackSeedIndex((i) => (i + 1) % dailySeeds.length);
    setPage("game");
  }

  /* ================= RENDER ================= */
  if (page === "home") {
    return (
      <div className="app" style={{ position: "relative" }}>
        {/* Alpha banner */}
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

        {/* Optional feedback link */}
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

  /* ================= PACK SELECT ================= */
  if (page === "packs") {
    return (
      <div className="app">
        <button className="back-button" onClick={() => setPage("home")}>
          ← Home
        </button>

        <div className="center-content">
          <h2 style={{ marginBottom: 12 }}>Today’s Puzzle Packs</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
            All players see the same packs today
          </div>

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
              const completed = Number.isFinite(timeMs);

              return (
                <button
                  key={seed}
                  className="main-button"
                  disabled={completed}
                  style={{
                    padding: "12px 0",
                    opacity: completed ? 0.4 : 1,
                    cursor: completed ? "not-allowed" : "pointer",
                  }}
                  onClick={() => {
                    if (completed) return;
                    setPackSeedIndex(i);
                    setPage("game");
                  }}
                >
                  {completed ? `Pack ${i + 1} ✓ ${formatTime(timeMs)}` : `Pack ${i + 1}`}
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

      {/* Countdown overlay that blocks everything */}
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
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: NAVY, opacity: 0.8, marginBottom: 10 }}>
              Get ready…
            </div>
            <div style={{ fontSize: 96, fontWeight: 900, color: NAVY, lineHeight: 1 }}>
              {countdown === 0 ? "GO!" : countdown}
            </div>
          </div>
        </div>
      )}

      {/* Alpha banner on game page too */}
      <div
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 12,
          color: NAVY,
          opacity: 0.7,
        }}
      >
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
          {grid.flat().map((c, i) => (
            <div key={i} className="cell">
              {c}
            </div>
          ))}
        </div>
      </div>

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

      {/* Completion modal */}
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
