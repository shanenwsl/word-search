import { auth } from "./firebase";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";

export async function createAccount(email: string, password: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const credential = EmailAuthProvider.credential(email, password);
  return linkWithCredential(user, credential);
}
