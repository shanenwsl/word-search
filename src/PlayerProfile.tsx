import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

type Props = {
  uid: string;
  onBack: () => void;
};

const NAVY = "#0a1f44";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function PlayerProfile({ uid, onBack }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Load player placement
      const ref = doc(db, "placements", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setData(null);
        setLoading(false);
        return;
      }

      const placement = snap.data();
      setData(placement);

      // Compute rank (all-time)
      const q = query(collection(db, "placements"), orderBy("rating", "desc"));
      const all = await getDocs(q);
      const index = all.docs.findIndex((d) => d.id === uid);
      setRank(index >= 0 ? index + 1 : null);

      setLoading(false);
    }

    load();
  }, [uid]);

  if (loading) {
    return <div style={{ padding: 20, textAlign: "center" }}>Loading profile…</div>;
  }

  if (!data) {
    return (
      <div style={{ padding: 20 }}>
        <button className="main-button" onClick={onBack}>← Back</button>
        <p>User not found.</p>
      </div>
    );
  }

  const isMe = user?.uid === uid;

  return (
    <div style={{ padding: 20 }}>
      <button className="main-button" onClick={onBack}>← Back</button>

      <div
        style={{
          marginTop: 16,
          padding: 20,
          borderRadius: 16,
          background: isMe ? NAVY : "#f4f6fa",
          color: isMe ? "white" : NAVY,
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {data.name}
          {isMe && (
            <span
              style={{
                marginLeft: 10,
                fontSize: 12,
                background: "gold",
                color: NAVY,
                padding: "4px 8px",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              YOU
            </span>
          )}
        </h2>

        <div style={{ marginTop: 12 }}>
          <strong>Rating:</strong> {data.rating}
        </div>

        <div style={{ marginTop: 8 }}>
          <strong>Average time:</strong> {formatTime(data.timeMs)}
        </div>

        {rank && (
          <div style={{ marginTop: 8 }}>
            <strong>Global rank:</strong> #{rank}
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          Joined {data.createdAt?.toDate?.().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
