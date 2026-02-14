import type { NextApiRequest, NextApiResponse } from "next";
import { createChatCompletion, OpenAIRequestError } from "@/utils/openai";

type AssessmentPayload = {
  cvText?: string;
  targetRole?: string;
};

type AssessmentResponse = {
  content: string;
};

const buildPrompt = (cvText: string, targetRole: string) => {
  return [
    "Act as a Senior Educational Consultant and Executive Coach.",
    "Objective: Generate a Psychometric Reflection Test consisting of exactly 12 open-ended, narrative-driven questions. These questions are for the candidate's self-improvement, helping them identify their own strengths, weaknesses, and readiness for a specific target role.",
    "Input Data:",
    `Candidate CV: ${cvText}`,
    `Target Profile: ${targetRole}`,
    "Question Design Guidelines (The 4 Pillars):",
    "The Leadership/Pedagogy Pillar: (Based on role) Focus on NEP 2020, FLN, or Strategic Vision. Ask how they translate theory into classroom/school reality. For teachers ask questions on pedagogy.",
    "The Adaptive Resilience Pillar: Focus on a time they failed or had to pivot. This reveals their Growth Mindset.",
    "The EQ & Cultural Pillar: Focus on empathy, inclusivity, and stakeholder (parent/staff) management.",
    "The Problem-Solving Pillar: Provide a specific what-if scenario common to the Target Profile.",
    "Output Requirement:",
    "Provide 12 thought-provoking questions.",
    "Each question should be followed by a brief Why this matters note. This helps the candidate understand what psychometric trait (e.g., Emotional Intelligence, Strategic Thinking) they are currently testing in themselves.",
    "Tone: Professional, encouraging, and deeply reflective.",
  ].join("\n");
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AssessmentResponse | { message: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { cvText, targetRole } = (req.body ?? {}) as AssessmentPayload;
  const safeCvText = typeof cvText === "string" ? cvText.trim() : "";
  const safeTargetRole = typeof targetRole === "string" ? targetRole.trim() : "";

  if (!safeTargetRole) {
    return res.status(400).json({ message: "targetRole is required." });
  }

  try {
    const prompt = buildPrompt(safeCvText || "Not provided.", safeTargetRole);
    const result = await createChatCompletion(prompt, { temperature: 0.7 });
    return res.status(200).json({ content: result.content });
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      console.error("assessmentBuilder failed", {
        status: error.status,
        details: error.details,
      });
      return res.status(error.status).json({ message: error.message });
    }
    console.error("assessmentBuilder failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to build assessment.";
    return res.status(500).json({ message });
  }
}
