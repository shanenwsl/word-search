import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

type Entry = {
  uid: string;
  name: string;
  rating: number;
  timeMs: number;
};

type Props = {
  onSelect: (uid: string) => void;
};

const NAVY = "#0a1f44";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function Leaderboard({ onSelect }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, "placements"),
          orderBy("rating", "desc")
        );

        const snap = await getDocs(q);

        const data: Entry[] = snap.docs.map((d) => ({
          uid: d.id,
          name: d.data().name || "Player",
          rating: d.data().rating,
          timeMs: d.data().timeMs,
        }));

        setRows(data);
      } catch (err) {
        console.error("Leaderboard load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <div style={{ padding: 20, textAlign: "center" }}>Loading leaderboard…</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ textAlign: "center", color: NAVY }}>Leaderboard</h2>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: NAVY }}>
            <th>#</th>
            <th>Name</th>
            <th>Rating</th>
            <th>Avg Time</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => {
            const isMe = user?.uid === r.uid;

            return (
              <tr
                key={r.uid}
                onClick={() => onSelect(r.uid)}
                style={{
                  cursor: "pointer",
                  background: isMe ? NAVY : i % 2 ? "#f4f6fa" : "white",
                  color: isMe ? "white" : NAVY,
                  fontWeight: isMe ? 700 : 500,
                }}
              >
                <td>{i + 1}</td>
                <td>
                  {r.name}
                  {isMe && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        background: "gold",
                        color: NAVY,
                        padding: "2px 6px",
                        borderRadius: 6,
                        fontWeight: 700,
                      }}
                    >
                      YOU
                    </span>
                  )}
                </td>
                <td>{r.rating}</td>
                <td>{formatTime(r.timeMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
