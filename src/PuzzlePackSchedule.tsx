import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { enterPackOnce } from "./firestore";
import { useAuth } from "./useAuth";

type Pack = {
  id: string;
  seed: string;
  startAt: Timestamp; // when puzzle becomes playable
  lockAt: Timestamp;  // when entry/registration opens (your naming)
};

type Props = {
  onEnterPack: (packId: string, seed: string, startAtMs: number) => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function getPackState(nowMs: number, lockAtMs: number, startAtMs: number) {
  if (nowMs < lockAtMs) return "REG_COUNTDOWN";        // before reg opens
  if (nowMs >= lockAtMs && nowMs < startAtMs) return "ENTER_WINDOW"; // can enter lobby
  return "CLOSED";                                     // after startAt
}

export default function PuzzlePackSchedule({ onEnterPack }: Props) {
  const { user } = useAuth();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    loadPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPacks() {
    try {
      const q = query(collection(db, "puzzlepacks"), orderBy("startAt", "asc"));
      const snap = await getDocs(q);

      const rows: Pack[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setPacks(rows);
    } catch (err) {
      console.error("Failed to load puzzle packs", err);
      setError("Failed to load puzzle packs");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnter(pack: Pack) {
    if (!user) return;

    const startAtMs = pack.startAt.toMillis();
    const lockAtMs = pack.lockAt.toMillis();

    // must be inside before startAt
    if (Date.now() >= startAtMs) {
      alert("This pack already started. Entry is closed.");
      return;
    }

    // your rules: only allow enter when reg open (>= lockAt)
    if (Date.now() < lockAtMs) {
      alert("Registration is not open yet.");
      return;
    }

    try {
      await enterPackOnce(pack.id, user.uid);
      onEnterPack(pack.id, pack.seed, startAtMs);
    } catch (err: any) {
      if (err?.message === "PACK_ALREADY_ENTERED") {
        alert("You already entered this pack. Re-entry is not allowed.");
      } else {
        console.error(err);
        alert("Failed to enter pack.");
      }
    }
  }

  const upcoming = useMemo(() => {
    // show next 24h-ish or just all
    return packs;
  }, [packs]);

  if (loading) return <div>Loading packs…</div>;
  if (error) return <div>{error}</div>;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <h2>Upcoming Puzzle Packs</h2>

      {upcoming.length === 0 && <div>No puzzle packs scheduled.</div>}

      {upcoming.map((pack) => {
        const startAtMs = pack.startAt.toMillis();
        const lockAtMs = pack.lockAt.toMillis();
        const state = getPackState(nowMs, lockAtMs, startAtMs);

        const regCountdown = formatCountdown(lockAtMs - nowMs);
        const startCountdown = formatCountdown(startAtMs - nowMs);

        return (
          <div
            key={pack.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>Pack {pack.id}</div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Starts: {pack.startAt.toDate().toLocaleString()}
            </div>

            <div style={{ marginTop: 10 }}>
              {state === "REG_COUNTDOWN" && (
                <div>⏳ Registration opens in {regCountdown}</div>
              )}

              {state === "ENTER_WINDOW" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button className="main-button" onClick={() => handleEnter(pack)}>
                    Enter Lobby
                  </button>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    Starts in <strong>{startCountdown}</strong>
                  </div>
                </div>
              )}

              {state === "CLOSED" && <div>🔒 Closed</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
