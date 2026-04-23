import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getDb } from "@/utils/firebase";

type RegisterRequestBody = {
  name?: string;
  email?: string;
  mobileNumber?: string;
  city?: string;
  currentRole?: string;
  subject?: string;
  board?: string;
  organizationName?: string;
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

  const {
    name,
    email,
    mobileNumber = "",
    city = "",
    currentRole = "",
    subject = "",
    board = "",
    organizationName = "",
    password = "",
  } = req.body as RegisterRequestBody;

  const normalizedEmail = email?.trim();

  if (
    !normalizedEmail ||
    !name ||
    !mobileNumber.trim() ||
    !city.trim() ||
    !currentRole.trim() ||
    !subject.trim() ||
    !board.trim() ||
    !organizationName.trim() ||
    !password.trim()
  ) {
    return res.status(400).json({
      message:
        "name, email, mobileNumber, city, currentRole, subject, board, organizationName, and password are required.",
    });
  }

  try {
    const db = getDb();
    const userRef = doc(db, "Educators360Users", normalizedEmail);
    const existingUser = await getDoc(userRef);

    if (existingUser.exists()) {
      return res.status(409).json({ message: "Email already exists." });
    }

    await setDoc(userRef, {
      userId: randomUUID(),
      name,
      email: normalizedEmail,
      mobileNumber: mobileNumber.trim(),
      city: city.trim(),
      currentRole: currentRole.trim(),
      subject: subject.trim(),
      board: board.trim(),
      organizationName: organizationName.trim(),
      password: password.trim(),
      createdAt: serverTimestamp(),
      registeredAt: serverTimestamp(),
    });

    return res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register user.";
    console.error("Error registering user", error);
    return res.status(500).json({ message });
  }
}

