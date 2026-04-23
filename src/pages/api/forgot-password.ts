import type { NextApiRequest, NextApiResponse } from "next";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDb } from "@/utils/firebase";

type ForgotPasswordRequestBody = {
  email?: string;
  newPassword?: string;
};

const MIN_PASSWORD_LENGTH = 6;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { email, newPassword } = req.body as ForgotPasswordRequestBody;
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const db = getDb();
    const userRef = doc(db, "Educators360Users", normalizedEmail);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (!newPassword) {
      return res.status(200).json({ message: "Account verified." });
    }

    if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    await updateDoc(userRef, { password: newPassword.trim() });
    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process password reset.";
    console.error("Error handling forgot password", error);
    return res.status(500).json({ message });
  }
}
