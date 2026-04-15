import type { NextApiRequest, NextApiResponse } from "next";
import { OpenAIRequestError } from "@/utils/openai";

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
const RESUME_AI_DEBUG = process.env.RESUME_AI_DEBUG === "true";

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
    "For experiences: split each distinct company/role/date range into its own item. Do NOT merge multiple jobs into one. If dates or companies change, start a new experience entry.",
    "CRITICAL: company must contain exactly one employer name per experience item. Never concatenate two employers in one company field (e.g., do not output 'UPEDUCATORS RUH CONTINUUM').",
    "If a line contains role and company together, separate them correctly so role stays in role and employer stays in company.",
    "For the Classic resume template, WORK EXPERIENCE must follow this structure for every experience item: role, company, dates, and exactly 3 bullet points.",
    "For education: keep the existing structure exactly as school, degree, dates.",
    "For education.dates: preserve the score/result in the same single-line pattern used in the resume. If the value is percentage-based, always include the % sign (example: 59.2%). If the value is CGPA-based, keep CGPA exactly as written (example: 9.48 CGPA or 9.6 CGPA). Do not convert CGPA to percentage and do not drop the % sign from percentage marks.",
    "Rewrite each experience bullet in concise resume language. Each bullet should start with a strong action verb, be one sentence, and avoid first-person language, headings, numbering, or filler text.",
    "If the source resume has fewer than 3 bullets for a role, infer truthful, resume-safe bullets from the described responsibilities so that every experience item still has exactly 3 bullets.",
    "Return STRICT JSON only, no extra text, using this schema:",
    `{
  "score": 0-100,
  "summary": "Max 30 words or 250 characters.",
  "strengths": ["item1","item2","item3"],
  "improvements": ["item1","item2","item3","item4"],
  "suggestions": ["item1","item2","item3","item4"],
  "rewriteSummary": "Improved professional summary Max 3-5 lines depending on content of resume.",
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8"],
  "parsedResume": {
    "name": "",
    "title": "",
    "location": "",
    "email": "",
    "phone": "",
    "photo": "",
    "summary": "",
    "skills": [{"name":"","rating":3}, max 6 skills],
    "certifications": [check in additional information section, certification section and if not specified, add 1 certificate based on skills],
    "languages": ["add hindi, english by default if not specified."],
    "experiences": [{"role":"","company":"","dates":"","bullets":["bullet 1","bullet 2","bullet 3"]}],
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

const emptyState = (template: Partial<ResumeTemplate>): ResumeTemplate => {
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

const normalizeToken = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const looksLikeDateLine = (line: string): boolean =>
  /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|PRESENT|DATE|TILL|TO|UNTIL|CURRENT|20\d{2})\b/i.test(
    line
  );

const headerKeywords = [
  "WORK EXPERIENCE",
  "EXPERIENCE",
  "CAREER PROGRESSION",
  "PROFILE",
  "SUMMARY",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "LANGUAGES",
  "PROJECTS",
];

const isLikelyCompanyLine = (line: string): boolean => {
  const clean = line.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 3 || clean.length > 90) return false;
  if (looksLikeDateLine(clean)) return false;
  if (headerKeywords.some((keyword) => normalizeToken(clean) === normalizeToken(keyword))) {
    return false;
  }
  if (/^[\u2022\-*]/.test(clean)) return false;
  if (/\b(HOD|FACILITATOR|TEACHER|TRAINER|MANAGER|ENGINEER|DEVELOPER|LEAD|INTERN)\b/i.test(clean)) {
    return false;
  }
  return /[A-Za-z]/.test(clean) && /[A-Z]/.test(clean);
};

const extractCompanyCandidates = (resumeText: string): string[] => {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const line of lines) {
    if (line.includes(":")) {
      const afterColon = line.split(":").slice(1).join(":").trim();
      if (isLikelyCompanyLine(afterColon)) candidates.push(afterColon);
    }
    if (isLikelyCompanyLine(line)) {
      candidates.push(line);
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalizeToken(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const inferCompanyFromSource = (
  resumeText: string,
  role: string,
  dates: string
): string => {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const normalizedRole = normalizeToken(role);
  const normalizedDates = normalizeToken(dates);

  let anchorIndex = -1;
  if (normalizedDates) {
    anchorIndex = lines.findIndex((line) =>
      normalizeToken(line).includes(normalizedDates)
    );
  }
  if (anchorIndex === -1 && normalizedRole) {
    anchorIndex = lines.findIndex((line) =>
      normalizeToken(line).includes(normalizedRole)
    );
  }
  if (anchorIndex === -1) anchorIndex = 0;

  const start = Math.max(0, anchorIndex - 3);
  const end = Math.min(lines.length - 1, anchorIndex + 2);

  // First pass: prioritize explicit role:company patterns.
  for (let i = start; i <= end; i += 1) {
    const line = lines[i];
    if (line.includes(":")) {
      const afterColon = line.split(":").slice(1).join(":").trim();
      if (isLikelyCompanyLine(afterColon)) return afterColon;
    }
  }

  // Second pass: fallback to standalone company-like lines.
  for (let i = start; i <= end; i += 1) {
    const line = lines[i];
    if (isLikelyCompanyLine(line)) return line;
  }
  return "";
};

const tokenize = (value: string): string[] =>
  normalizeToken(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const overlapCount = (a: string, b: string): number => {
  const aSet = new Set(tokenize(a));
  const bTokens = tokenize(b);
  let count = 0;
  for (const token of bTokens) {
    if (aSet.has(token)) count += 1;
  }
  return count;
};

const fixMergedCompanyName = (
  company: string,
  role: string,
  dates: string,
  resumeText: string
): string => {
  const current = safeString(company);
  if (!current) return current;

  const candidates = extractCompanyCandidates(resumeText);
  const normalizedCurrent = normalizeToken(current);
  const matchedCandidates = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeToken(candidate);
    if (!normalizedCandidate) return false;
    return (
      normalizedCurrent.includes(normalizedCandidate) ||
      overlapCount(current, candidate) >= Math.min(2, tokenize(candidate).length)
    );
  });

  const splitByDelimiters = current
    .split(/\s*(?:\/|\||,|\band\b|\&)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);

  const inferred = inferCompanyFromSource(resumeText, role, dates);
  const normalizedInferred = normalizeToken(inferred);

  if (
    inferred &&
    normalizedInferred &&
    normalizedCurrent !== normalizedInferred &&
    (normalizedCurrent.includes(normalizedInferred) ||
      overlapCount(current, inferred) >= Math.min(2, tokenize(inferred).length))
  ) {
    return inferred;
  }

  const appearsMerged = matchedCandidates.length > 1 || splitByDelimiters.length > 1;
  if (!appearsMerged) return current;
  if (!inferred) return matchedCandidates[0] ?? splitByDelimiters[0] ?? current;

  const inferredFromMatched = matchedCandidates.find(
    (candidate) => normalizeToken(candidate) === normalizedInferred
  );
  if (inferredFromMatched) return inferredFromMatched;

  const inferredFromSplit = splitByDelimiters.find(
    (candidate) => normalizeToken(candidate) === normalizedInferred
  );
  return inferredFromSplit ?? inferred ?? current;
};

const normalizeParsedResume = (parsed?: ResumeTemplate): ResumeTemplate | null => {
  if (!parsed) return null;

  // Process experiences, ensuring clear separation of roles and companies
  const experiences = safeArray<Record<string, unknown>>(parsed.experiences)
    .map((exp: Record<string, unknown>) => ({
      role: safeString(exp?.role),
      company: safeString(exp?.company),  // Ensure company names are separate
      dates: safeString(exp?.dates),
      bullets: safeArray(exp?.bullets)
        .map((bullet) => safeString(bullet))
        .filter(Boolean)
        .slice(0, 3),
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

const parseJson = (text: string, sourceResumeText = ""): AiResumeResult => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in AI response");
  const parsed = JSON.parse(match[0]) as AiResumeResult;

  const rawExperiences = safeArray<Record<string, unknown>>(parsed?.parsedResume?.experiences);
  const normalizedExperiences = rawExperiences
    .map((exp: Record<string, unknown>) => {
      const role = safeString(exp?.role);
      const dates = safeString(exp?.dates);
      return {
        ...exp,
        role,
        company: fixMergedCompanyName(safeString(exp?.company), role, dates, sourceResumeText),
        dates,
        bullets: safeArray<string>(exp?.bullets)
          .map((bullet) => safeString(bullet))
          .filter(Boolean)
          .slice(0, 3),
      };
    })
    .filter((exp) => exp.role || exp.company || exp.dates || exp.bullets.length > 0);

  if (parsed?.parsedResume) {
    parsed.parsedResume.experiences = normalizedExperiences;
  }

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
    if (RESUME_AI_DEBUG) {
      console.info("resumeImprove request", {
        resumeChars: userResume.length,
        targetJobChars: targetJob.length,
        jobDescriptionChars: jobDescription.length,
      });
    }
    const prompt = buildPrompt(userResume, targetJob, jobDescription);
    if (RESUME_AI_DEBUG) {
      console.info("resumeImprove prompt preview", prompt.slice(0, 600));
    }
    const content = await callGemini(prompt);
    if (RESUME_AI_DEBUG) {
      console.info("resumeImprove ai raw preview", content.slice(0, 800));
    }
    const parsed = parseJson(content, userResume);
    if (RESUME_AI_DEBUG) {
      console.info("resumeImprove normalized experiences", parsed?.parsedResume?.experiences);
    }
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
