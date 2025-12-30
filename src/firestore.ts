import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/* =====================================================
   PLACEMENT (ONE-TIME ONLY)
===================================================== */

export async function savePlacementResult(
  uid: string,
  rating: number,
  timeMs: number,
  name: string
) {
  const ref = doc(db, "placements", uid);
  const snap = await getDoc(ref);

  // 🔒 Placement is ONE-TIME ONLY
  if (snap.exists()) {
    console.log("Placement already locked for user:", uid);
    return;
  }

  await setDoc(ref, {
    name, // username
    rating,
    timeMs,
    createdAt: serverTimestamp(),
  });

  console.log("✅ Placement locked:", { uid, rating, timeMs });
}

/* =====================================================
   PUZZLE PACK ENTRY LOCKING (PER PACK)
   - Enter once
   - No re-entry
===================================================== */

export async function enterPackOnce(
  packId: string,
  uid: string
) {
  const entryId = `${packId}_${uid}`;
  const ref = doc(db, "packEntries", entryId);
  const snap = await getDoc(ref);

  // 🔒 Already entered → BLOCK
  if (snap.exists()) {
    throw new Error("PACK_ALREADY_ENTERED");
  }

  // ✅ First-time entry
  await setDoc(ref, {
    packId,
    uid,
    enteredAt: serverTimestamp(),
    completed: false,
  });

  console.log("✅ Pack entry locked:", { packId, uid });
}

export async function hasEnteredPack(
  packId: string,
  uid: string
): Promise<boolean> {
  const entryId = `${packId}_${uid}`;
  const ref = doc(db, "packEntries", entryId);
  const snap = await getDoc(ref);

  return snap.exists();
}

/* =====================================================
   USER → ACTIVE PACK LOCK (GLOBAL)
   - Can only be set ONCE
   - Leaving forfeits re-entry
===================================================== */

export async function lockUserIntoPack(
  uid: string,
  packId: string,
  packSeed: string
) {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    activePackId: packId,
    activePackSeed: packSeed,
    activePackLocked: true,
    packEnteredAt: serverTimestamp(),
  });

  console.log("✅ User locked into pack:", { uid, packId });
}

/* =====================================================
   OPTIONAL: MARK PACK COMPLETE (FOR LATER)
===================================================== */

export async function markPackComplete(
  packId: string,
  uid: string,
  timeMs: number
) {
  const entryId = `${packId}_${uid}`;
  const ref = doc(db, "packEntries", entryId);

  await setDoc(
    ref,
    {
      completed: true,
      completedAt: serverTimestamp(),
      timeMs,
    },
    { merge: true }
  );
}
