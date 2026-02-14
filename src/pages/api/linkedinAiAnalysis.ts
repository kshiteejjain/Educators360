import type { NextApiRequest, NextApiResponse } from "next";
import { createChatCompletion, OpenAIRequestError } from "@/utils/openai";

type AnalysisItem = {
  type: "positive" | "negative" | "suggestion";
  text: string;
  scoreImpact?: number;
  suggestion?: string;
};

type AnalysisSection = {
  title: string;
  icon: string;
  color: string;
  items: AnalysisItem[];
};

type ProfileInput = {
  profileUrl?: string;
  headline?: string;
  summary?: string;
  experience?: string;
  skills?: string[];
  education?: string;
  profileText?: string;
  cvText?: string;
  targetKeywords?: string[];
};

type AiAnalysis = {
  aiScore: number;
  scoreRationale: string;
  recommendations: string[];
  modifications: {
    headline?: string;
    about?: string;
    experienceBullets?: string[];
    skills?: string[];
  };
  suggestedKeywords: string[];
  analysisText?: string;
  strategicKeywordCloud?: string[];
  targetRoleInsights?: {
    roleSummary?: string;
    growth?: string;
    marketValue?: string;
    jobInsights?: string[];
  };
};

type AiRequest = {
  profileData: ProfileInput;
  sections: AnalysisSection[];
  targetRole?: string;
};

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const buildAiPrompt = (payload: AiRequest) => {
  const summarySections = payload.sections.map((section) => ({
    title: section.title,
    items: section.items.map((item) => ({
      type: item.type,
      text: item.text,
      suggestion: item.suggestion ?? "",
    })),
  }));

  const linkedinText = clip(
    payload.profileData.profileText ||
      [
        payload.profileData.headline,
        payload.profileData.summary,
        payload.profileData.experience,
        payload.profileData.education,
        payload.profileData.skills?.join(", "),
      ]
        .filter(Boolean)
        .join("\n"),
    4000
  );
  const cvText = clip(payload.profileData.cvText || "", 4000);
  const targetRole = clip(payload.targetRole || "", 120) || "Not provided";

  return [
    "You are an expert Personal Branding Consultant and Executive Recruiter.",
    `My desired target role is ${targetRole}.`,
    "I am providing you with my LinkedIn Profile and my CV.",
    "Please perform a 'Gap & Synthesis Analysis' to optimize my professional brand.",
    "Cross-reference both documents to find the best data, but be critical of where information is lacking.",
    "Structure your response exactly as follows:",
    `1. Profile Score: Current score out of 100 based on alignment with the ${targetRole}.`,
    "2. Section-by-Section Analysis: For each section (Headline, About, Experience, Skills, Activity):",
    "? What's working well: The strongest points found in my LinkedIn profile",
    "? What's missing or weak: Identify specific gaps, lack of metrics, generic language, or missed opportunities for the target role in this specific section.",
    "?? Conflict Check: Note any discrepancies between the CV and LinkedIn (e.g., different titles or dates).",
    "?? Replace / Action Plan: Provide the final, optimized copy I should use. Synthesize the best data from the CV with the best narrative from LinkedIn.",
    "?? Estimated Score Gain: Predicted impact of these changes.",
    `3. Strategic Keyword Cloud: List the top 15 keywords for ${targetRole} that must be added to my profile.`,
    "Use the provided data only; do not invent roles, dates, or companies.",
    "Return STRICT JSON only, no extra text, using this schema:",
    `{
  "aiScore": 0-100,
  "scoreRationale": "2-3 sentences",
  "recommendations": ["item1","item2","item3","item4","item5"],
  "modifications": {
    "headline": "improved headline (max 120 chars)",
    "about": "improved about/summary (120-200 words)",
    "experienceBullets": ["bullet1","bullet2","bullet3","bullet4"],
    "skills": ["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8","skill9","skill10","skill11","skill12"]
  },
  "suggestedKeywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8"],
  "analysisText": "Full response structured exactly as requested above.",
  "strategicKeywordCloud": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8","keyword9","keyword10","keyword11","keyword12","keyword13","keyword14","keyword15"],
  "targetRoleInsights": {
    "roleSummary": "2-3 sentences about the target role",
    "growth": "1-2 sentences about role growth and demand",
    "marketValue": "1-2 sentences about market value and typical hiring demand",
    "jobInsights": ["insight1","insight2","insight3","insight4"]
  }
}`,
    `Target role: ${targetRole}`,
    "SOURCE 1: LINKEDIN PROFILE DATA",
    linkedinText || "Not provided",
    "SOURCE 2: CV / RESUME DATA",
    cvText || "Not provided",
    "Analysis metadata:",
    JSON.stringify(
      {
        headline: clip(payload.profileData.headline || "", 400),
        summary: clip(payload.profileData.summary || "", 1200),
        experience: clip(payload.profileData.experience || "", 1800),
        education: clip(payload.profileData.education || "", 600),
        skills: payload.profileData.skills || [],
        profileText: clip(payload.profileData.profileText || "", 2000),
        analysisSections: summarySections,
      },
      null,
      2
    ),
  ].join("\n");
};

const parseAiJson = (text: string): AiAnalysis => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in AI response");
  return JSON.parse(match[0]) as AiAnalysis;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AiAnalysis | { message: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const body = (req.body ?? {}) as AiRequest;
  if (!body.profileData || !Array.isArray(body.sections)) {
    return res.status(400).json({ message: "profileData and sections are required." });
  }
  if (!body.targetRole || !body.targetRole.trim()) {
    return res.status(400).json({ message: "targetRole is required." });
  }

  try {
    const prompt = buildAiPrompt(body);
    const result = await createChatCompletion(prompt);
    const content = result.content;
    const parsed = parseAiJson(content);
    return res.status(200).json(parsed);
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      console.error("LinkedIn AI analysis failed", {
        status: error.status,
        details: error.details,
      });
      return res.status(error.status).json({ message: error.message });
    }
    console.error("LinkedIn AI analysis failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to analyze profile with AI.";
    return res.status(500).json({ message });
  }
}
