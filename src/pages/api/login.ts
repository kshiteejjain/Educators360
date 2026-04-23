import type { NextApiRequest, NextApiResponse } from "next";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/utils/firebase";

type LoginRequestBody = {
  email?: string;
  password?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { email, password } = req.body as LoginRequestBody;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  try {
    const db = getDb();
    const userRef = doc(db, "Educators360Users", email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = userSnap.data() as {
      password?: string;
      name?: string;
      email?: string;
      role?: string;
      userId?: string;
    };
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const { password: _removedPassword, ...userData } = user;
    return res.status(200).json({
      message: "Login successful.",
      user: userData,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to login user.";
    console.error("Error logging in user", error);
    return res.status(500).json({ message });
  }
}
