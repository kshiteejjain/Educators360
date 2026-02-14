import type { NextApiRequest, NextApiResponse } from "next";
import { createChatCompletion, OpenAIRequestError } from "@/utils/openai";

type ReportPayload = {
  targetRole?: string;
  cvText?: string;
  pairedResponses?: string;
};

type ReportResponse = {
  report: string;
};

const buildPrompt = (targetRole: string, cvText: string, pairedResponses: string) =>
  [
    "Report",
    "Act as a Senior Career Coach and Educational Psychometrician.",
    "Task: Analyze the provided data to generate a 'Professional Growth & Identity Report.' This report is designed for the candidate’s self-improvement and to help them bridge the gap toward their target role.",
    "Inputs to Analyze:",
    `Target Profile: ${targetRole}`,
    `Candidate CV: ${cvText}`,
    `The Paired Responses: ${pairedResponses}`,
    "Analysis Instructions:",
    "Contextual Mapping: For each Question/Answer pair, look for evidence of the candidate’s mindset, pedagogical depth, and leadership potential relative to the Target Profile.",
    "Read Between the Lines: Don't just analyze what they said, but what they omitted. Are they missing mentions of inclusivity? Is their technology use surface-level?",
    "Report Structure:",
    "1. Professional Identity Profile:",
    "The Persona: A title for their professional style (e.g., 'The Instructional Architect' or 'The Relationship-First Educator').",
    "Core Philosophy: A summary of their underlying belief system about education based on their combined answers.",
    "2. Competency Scorecard (Scale of 1-10):",
    "Pedagogical Maturity: (Understanding of NEP 2020, FLN, and modern methods).",
    "Emotional Intelligence (EQ): (Handling conflict, parent relations, and student empathy).",
    "Operational Readiness: (How prepared they are for the daily demands of the Target Profile).",
    "3. Strengths & 'Superpowers':",
    "Identify 3 specific areas where the candidate’s answers showed mastery or unique talent.",
    "4. Critical Growth Areas (The 'Alignment Gap'):",
    "Identify 2-3 areas where the candidate’s responses suggest they are not yet fully ready for the Target Profile. Be specific—did they lack depth in leadership? Was their behavior management too traditional?",
    "5. Refined Interview Strategy:",
    "Pick the 2 weakest answers from their test and explain how they should have answered them to align better with modern educational standards.",
    "6. Personalized Action Plan:",
    "A '30-Day Development Roadmap' with 3 specific tasks to improve their profile.",
    "Tone: Candid, constructive, and empowering.",
  ].join("\n");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReportResponse | { message: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { targetRole, cvText, pairedResponses } = (req.body ?? {}) as ReportPayload;
  const safeTargetRole = typeof targetRole === "string" ? targetRole.trim() : "";
  const safeCvText = typeof cvText === "string" ? cvText.trim() : "";
  const safePairs = typeof pairedResponses === "string" ? pairedResponses.trim() : "";

  if (!safeTargetRole || !safePairs) {
    return res
      .status(400)
      .json({ message: "targetRole and pairedResponses are required." });
  }

  try {
    const prompt = buildPrompt(safeTargetRole, safeCvText || "Not provided.", safePairs);
    const result = await createChatCompletion(prompt, { temperature: 0.7 });
    return res.status(200).json({ report: result.content });
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      console.error("assessmentReport failed", {
        status: error.status,
        details: error.details,
      });
      return res.status(error.status).json({ message: error.message });
    }
    console.error("assessmentReport failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return res.status(500).json({ message });
  }
}
