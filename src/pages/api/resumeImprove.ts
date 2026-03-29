import type { NextApiRequest, NextApiResponse } from "next";
import { OpenAIRequestError } from "@/utils/openai";
import type { ResumeTemplate } from "@/types/resume"; // Add the correct import path for ResumeTemplate

type AiResumeResult = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  rewriteSummary: string;
  keywords: string[];
  parsedResume: {
    name: string;
    title: string;
    location: string;
    email: string;
    phone: string;
    photo?: string;
    summary: string;
    skills: { name: string; rating: number }[];
    languages: string[];
    experiences: { role: string; company: string; dates: string; bullets: string[] }[];
    education: { school: string; degree: string; dates: string }[];
    projects: { name: string; dates: string; summary: string; tech: string }[];
  };
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const buildPrompt = (userResume: string, targetJob?: string, jobDescription?: string) => {
  const targetLine = targetJob ? `Target job: ${targetJob}` : "Target job: Not provided";
  const jobDescLine = jobDescription
    ? `Job description:\n${jobDescription}`
    : "Job description: Not provided";

  return [
    "You are an expert resume coach.",
    "Analyze the resume text and provide improvement feedback.",
    "Use the target job to tailor the rewritten profile summary. If the target job is provided, rewriteSummary must be aligned to that role while remaining truthful to the resume content.",
    "Extract and populate the parsedResume strictly from the resume content. Do not omit sections that exist; use empty strings only if truly missing.",
    "For experiences: split each distinct company/role/date range into its own item. Do NOT merge multiple jobs into one. If dates or companies change, start a new experience entry. Please treat the following companies as distinct, even if they have similar job roles or overlapping dates",
    "Return STRICT JSON only, no extra text, using this schema:",
    `{
  "score": 0-100,
  "summary": "2-3 sentence overview",
  "strengths": ["item1","item2","item3"],
  "improvements": ["item1","item2","item3","item4"],
  "suggestions": ["item1","item2","item3","item4"],
  "rewriteSummary": "Improved professional summary (80-140 words)",
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8"],
  "parsedResume": {
    "name": "",
    "title": "",
    "location": "",
    "email": "",
    "phone": "",
    "photo": "",
    "summary": "",
    "skills": [{"name":"","rating":3}],
    "languages": [],
    "experiences": [{"role":"","company":"","dates":"","bullets":[""]}],
    "education": [{"school":"","degree":"","dates":""}],
    "projects": [{"name":"","dates":"","summary":"","tech":""}]
  }
}`,
    "User resume:",
    userResume.slice(0, 6000),
    "",
    targetLine,
    jobDescLine,
  ].join("\n");
};

interface ResumeTemplate {
  name: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  photo?: string;
  summary: string;
  skills: { name: string; rating: number }[];
  languages: string[];
  experiences: { role: string; company: string; dates: string; bullets: string[] }[];
  education: { school: string; degree: string; dates: string }[];
  projects: { name: string; dates: string; summary: string; tech: string }[];
}

const emptyState = (template: any): ResumeTemplate => {
  return {
    name: '',
    title: '',
    location: '',
    email: '',
    phone: '',
    photo: '',
    summary: '',
    skills: [],
    languages: [],
    experiences: [],
    education: [],
    projects: [],
    ...template,  // Spread to include the template structure, if required
  };
};

const templates = [
  {
    name: '',
    title: '',
    location: '',
    email: '',
    phone: '',
    photo: '',
    summary: '',
    skills: [],
    languages: [],
    experiences: [],
    education: [],
    projects: [],
  },
];

// Safely handle strings (returns an empty string if the value is not a string)
const safeString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''; // If it's a string, trim it; otherwise return an empty string
};

// Safely handle arrays (returns an empty array if the value is not an array)
const safeArray = <T>(value: unknown): T[] => {
  return Array.isArray(value) ? value : []; // If it's an array, return it; otherwise return an empty array
};

const normalizeParsedResume = (parsed?: ResumeTemplate): ResumeTemplate | null => {
  if (!parsed) return null;

  // Process experiences, ensuring clear separation of roles and companies
  const experiences = safeArray(parsed.experiences)
    .map((exp: any) => ({
      role: safeString(exp?.role),
      company: safeString(exp?.company),  // Ensure company names are separate
      dates: safeString(exp?.dates),
      bullets: safeArray(exp?.bullets).map((bullet) => safeString(bullet)).filter(Boolean),
    }))
    .filter((exp) => exp.role || exp.company || exp.dates || exp.bullets.length > 0);

  // Ensure that experiences with different companies are treated separately
  const distinctExperiences = experiences.filter((exp, index, self) => {
    const companyRoleCombination = `${exp.company} ${exp.role}`;
    const previousCompanyRoleCombination = `${self[index - 1]?.company} ${self[index - 1]?.role}`;

    // If the combination of company and role is different, treat it as a separate experience
    return companyRoleCombination !== previousCompanyRoleCombination;
  });

  const normalized: ResumeTemplate = {
    ...emptyState(templates[0]),
    experiences: distinctExperiences, // Return the separate experiences
  };

  return normalized;
};

const callGemini = async (prompt: string) => {
  if (!GEMINI_API_KEY) {
    throw new OpenAIRequestError(500, "Missing GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini error response", {
      status: response.status,
      body: errText,
    });
    throw new OpenAIRequestError(response.status, "AI service error.", errText);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!content) {
    throw new OpenAIRequestError(502, "AI service returned an empty response.");
  }
  return content;
};

const parseJson = (text: string): AiResumeResult => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in AI response");
  const parsed = JSON.parse(match[0]) as AiResumeResult;

  // Ensure that experiences with different companies or roles are treated separately
  const distinctExperiences = parsed.parsedResume?.experiences.map((exp: any, index: number) => {
    if (index > 0 && exp.company !== parsed.parsedResume?.experiences[index - 1]?.company) {
      // Treat this experience as a new one
      return {
        ...exp,
        role: safeString(exp?.role),
        company: safeString(exp?.company),
        dates: safeString(exp?.dates),
        bullets: safeArray<string>(exp?.bullets).map(bullet => safeString(bullet)),
      };
    }
    return exp; // Keep merging if it's the same company and role
  });

  parsed.parsedResume.experiences = distinctExperiences;

  return parsed;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AiResumeResult | { message: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const userResume = typeof req.body?.userResume === "string" ? req.body.userResume.trim() : "";
  const targetJob =
    typeof req.body?.targetJob === "string" ? req.body.targetJob.trim() : "";
  const jobDescription =
    typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : "";
  if (!userResume || userResume.replace(/\s/g, "").length < 50) {
    return res.status(400).json({ message: "Resume text is required." });
  }

  try {
    const prompt = buildPrompt(userResume, targetJob, jobDescription);
    const content = await callGemini(prompt);
    const parsed = parseJson(content);
    return res.status(200).json(parsed);
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      console.error("resumeImprove failed", {
        status: error.status,
        details: error.details,
      });
      return res.status(error.status).json({
        message: error.details || error.message,
      });
    }
    console.error("resumeImprove failed", error);
    const message = error instanceof Error ? error.message : "Failed to improve resume.";
    return res.status(500).json({ message });
  }
}
