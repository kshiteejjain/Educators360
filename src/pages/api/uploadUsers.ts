import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/utils/firebase";

type IncomingUser = {
  userId?: string;
  name?: string;
  email?: string;
  password?: string;
  mobileNumber?: string;
  subject?: string;
  board?: string;
  createdAt?: string;
  registeredAt?: string;
};

const formatTimestampIST = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {} as Record<string, string>);

  const day = String(Number(parts.day ?? "0"));
  const month = parts.month ?? "";
  const year = parts.year ?? "";
  const hour = parts.hour ?? "00";
  const minute = parts.minute ?? "00";
  const second = parts.second ?? "00";

  return `${day} ${month} ${year} at ${hour}:${minute}:${second} UTC+5:30`;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { users } = req.body as { users?: IncomingUser[] };
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ message: "No users provided." });
  }

  const db = getDb();
  const results = { created: 0, skipped: 0 };

  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      results.skipped += 1;
      continue;
    }

    const userRef = doc(db, "Educators360", email);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      results.skipped += 1;
      continue;
    }

    const payload = {
      userId: user.userId?.trim() || randomUUID(),
      name: user.name?.trim() || "User",
      email,
      password: user.password?.trim() || "apple@123",
      role: "student",
      mobileNumber: user.mobileNumber?.trim() || "",
      subject: user.subject?.trim() || "",
      board: user.board?.trim() || "",
      createdAt: user.createdAt?.trim() || formatTimestampIST(),
      registeredAt: user.registeredAt?.trim() || formatTimestampIST(),
    };

    await setDoc(userRef, payload);
    results.created += 1;
  }

  return res.status(200).json(results);
}

