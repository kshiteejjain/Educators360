import type { NextApiRequest, NextApiResponse } from "next";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/utils/firebase";

type ProfileResponse =
  | { user: Record<string, unknown> | null }
  | { message: string };

function getEmail(req: NextApiRequest) {
  const email =
    req.method === "GET"
      ? req.query.email
      : (req.body as { email?: string }).email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProfileResponse>
) {
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const email = getEmail(req);
  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  const db = getDb();
  const userRef = doc(db, "Educators360", email);

  if (req.method === "GET") {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({ user: snap.data() });
  }

  // PUT: update mobile number (and allow future profile merges)
  const { mobileNumber } = req.body as { mobileNumber?: string };
  const mobileValue = mobileNumber?.trim() ?? "";

  await setDoc(
    userRef,
    {
      mobileNumber: mobileValue,
    },
    { merge: true }
  );

  const snap = await getDoc(userRef);
  return res.status(200).json({ user: snap.data() ?? null });
}

