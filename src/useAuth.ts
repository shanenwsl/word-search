import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
} from "firebase/auth";
import type { User } from "firebase/auth";

import { auth } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

type UserProfile = {
  uid: string;
  name: string;
  hasPlacement: boolean;
  rating: number | null;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        // Always ensure anonymous session exists
        const anon = await signInAnonymously(auth);
        setUser(anon.user);
        setLoading(false);
        return;
      }

      setUser(u);

      // Load or create user profile
      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        const name =
          u.displayName ||
          u.email?.split("@")[0] ||
          "Player";

        const newProfile: UserProfile = {
          uid: u.uid,
          name,
          hasPlacement: false,
          rating: null,
        };

        await setDoc(ref, {
          ...newProfile,
          createdAt: new Date(),
        });

        setProfile(newProfile);
      } else {
        setProfile(snap.data() as UserProfile);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { user, profile, loading };
}
