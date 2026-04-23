import type { NextApiRequest, NextApiResponse } from "next";
import { collection, getCountFromServer } from "firebase/firestore";
import { getDb } from "@/utils/firebase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ count: number } | { message: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const db = getDb();
  const usersRef = collection(db, "Educators360");
  const snapshot = await getCountFromServer(usersRef);

  return res.status(200).json({ count: snapshot.data().count });
}

