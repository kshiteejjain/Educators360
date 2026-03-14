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

type CraftProfileResult = {
  targetRoleSummary: string;
  profileBlueprint: {
    headline: string;
    about: string;
    experienceBullets: string[];
    skills: string[];
    activityIdeas: string[];
  };
  strategicKeywordCloud: string[];
  actionPlan: string[];
};

type AiRequest = {
  profileData: ProfileInput;
  sections: AnalysisSection[];
  targetRole?: string;
};

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const buildAiPrompt = (payload: AiRequest) => {
  const cvText = clip(payload.profileData.cvText || "", 4000);
  const targetRole = clip(payload.targetRole || "", 120) || "Not provided";

  return [
    "You are an expert Personal Branding Consultant and Executive Recruiter.",
    `My desired target role is ${targetRole}.`,
    "I do NOT have a LinkedIn profile yet.",
    "Analyze my RESUME data and target role only, then craft a brand-new professional LinkedIn profile blueprint.",
    "Do NOT score or compare LinkedIn vs CV. Do NOT mention gaps between LinkedIn and CV.",
    "Focus on creating a compelling new profile optimized for recruiters and search.",
    "Structure your response exactly as follows:",
    "1. Target Role Summary: 2-3 sentences describing the role and what recruiters expect.",
    "2. LinkedIn Profile Blueprint:",
    "- Headline (max 120 chars)",
    "- About / Summary (120-200 words)",
    "- Experience Bullet Templates (4-6 bullets that can be adapted to roles)",
    "- Skills (12-16 skills aligned to the target role)",
    "- Featured / Activity ideas (3-5 content ideas to build credibility)",
    "3. Strategic Keyword Cloud: Top 15 keywords for the target role.",
    "4. Action Plan: 5-7 steps the user should follow to publish and iterate the profile.",
    "Use the provided resume data only; do not invent roles, dates, or companies.",
    "Return STRICT JSON only, no extra text, using this schema:",
    `{
  "targetRoleSummary": "2-3 sentences",
  "profileBlueprint": {
    "headline": "headline text",
    "about": "about/summary text",
    "experienceBullets": ["bullet1","bullet2","bullet3","bullet4","bullet5"],
    "skills": ["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8","skill9","skill10","skill11","skill12"],
    "activityIdeas": ["idea1","idea2","idea3","idea4","idea5"]
  },
  "strategicKeywordCloud": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8","keyword9","keyword10","keyword11","keyword12","keyword13","keyword14","keyword15"],
  "actionPlan": ["step1","step2","step3","step4","step5","step6","step7"]
}`,
    `Target role: ${targetRole}`,
    "SOURCE: CV / RESUME DATA",
    cvText || "Not provided",
    "Analysis metadata:",
    JSON.stringify(
      {
        summary: clip(payload.profileData.summary || "", 1200),
        experience: clip(payload.profileData.experience || "", 1800),
        education: clip(payload.profileData.education || "", 600),
        skills: payload.profileData.skills || [],
        profileText: clip(payload.profileData.profileText || "", 2000),
      },
      null,
      2
    ),
  ].join("\n");
};

const parseAiJson = (text: string): CraftProfileResult => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in AI response");
  return JSON.parse(match[0]) as CraftProfileResult;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CraftProfileResult | { message: string }>
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
    const runOnce = async () =>
      createChatCompletion(prompt, { maxTokens: 1200, temperature: 0.3 });
    let result = await runOnce();
    if (result.content && result.content.length < 20) {
      throw new OpenAIRequestError(502, "AI service returned an empty response.");
    }
    const content = result.content;
    const parsed = parseAiJson(content);
    return res.status(200).json(parsed);
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      if (error.status === 504) {
        try {
          const prompt = buildAiPrompt(body);
          const retry = await createChatCompletion(prompt, {
            maxTokens: 1200,
            temperature: 0.3,
          });
          const parsed = parseAiJson(retry.content);
          return res.status(200).json(parsed);
        } catch (retryError) {
          const message =
            retryError instanceof Error
              ? retryError.message
              : "Failed to analyze profile with AI.";
          return res.status(504).json({ message });
        }
      }
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
