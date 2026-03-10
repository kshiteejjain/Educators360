import type { NextApiRequest, NextApiResponse } from "next";

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

type AnalysisResult = {
  profileUrl: string;
  sections: AnalysisSection[];
  profileData: ProfileInput;
};

type ProfileInput = {
  profileUrl?: string;
  headline?: string;
  summary?: string;
  experience?: string;
  skills?: string[];
  education?: string;
  profileText?: string;
  targetKeywords?: string[];
};

type ScoreResult = {
  score: number;
  items: AnalysisItem[];
  suggestions: AnalysisItem[];
};

const SAMPLE_HEADLINE =
  "AI Engineer | Front End Engineer | JavaScript | React.js/Native | Next.js | Micro Frontend | LLD/HLD | Gen AI | LangChain | RAG | Vector Databases | Agentic AI Orchestration | MCP | n8n | AI Workflow | AI Automation";
const SAMPLE_HEADLINE_REWRITE =
  "Frontend & AI Engineer | React.js, React Native, Next.js, Micro Frontend | AI & RAG Systems | LangChain | Data Visualisation | JavaScript, TypeScript";
const SAMPLE_SUMMARY_OLD =
  "bringing over 11 years of dedicated expertise... I deeply value the narratives and information that underlie each project.";
const SAMPLE_SUMMARY_START = "bringing over 11 years of dedicated expertise";
const SAMPLE_SUMMARY_TAIL =
  "narratives and information that underlie each project";
const SAMPLE_SUMMARY_REWRITE =
  "Over 11 years of front-end and AI project leadership, delivering scalable applications in Banking, Logistics, and FinTech, improving user engagement by 30%. Proven track record in team leadership and project execution.";

const WEIGHTS = {
  headline: 20,
  summary: 25,
  experience: 25,
  skills: 20,
  engagement: 10,
};

const DEFAULT_KEYWORDS = [
  "education",
  "teaching",
  "training",
  "leadership",
  "curriculum",
  "assessment",
  "learning",
  "classroom",
  "student",
  "mentoring",
];

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const normalize = (value: string) => value.trim().toLowerCase();

const wordCount = (value: string) =>
  value.trim() ? value.trim().split(/\s+/).length : 0;

const hasNumbers = (text: string) => /\d+/.test(text);

const countMatches = (text: string, keywords: string[]) => {
  const normalized = normalize(text);
  return keywords.reduce((count, keyword) => {
    if (!keyword) return count;
    return normalized.includes(normalize(keyword)) ? count + 1 : count;
  }, 0);
};

const splitKeywords = (value?: string[]) =>
  Array.isArray(value)
    ? value.map((keyword) => keyword.trim()).filter(Boolean)
    : [];

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const compactText = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const buildProfileText = (parts: string[]) =>
  parts.map((part) => part.trim()).filter(Boolean).join("\n");

const fetchLinkedInProfile = async (linkedinUrl: string) => {
  const apiKey = process.env.RAPIDAPI_KEY ?? process.env.NEXT_PUBLIC_RAPIDAPI_KEY;
  const apiHost =
    process.env.LINKEDIN_RAPIDAPI_HOST ??
    process.env.NEXT_PUBLIC_LINKEDIN_RAPIDAPI_HOST ??
    "fresh-linkedin-profile-data.p.rapidapi.com";

  if (!apiKey) {
    throw new Error("Missing RAPIDAPI_KEY");
  }

  const url = new URL(`https://${apiHost}/enrich-lead`);
  url.searchParams.set("linkedin_url", linkedinUrl);
  url.searchParams.set("include_skills", "false");
  url.searchParams.set("include_certifications", "false");
  url.searchParams.set("include_publications", "false");
  url.searchParams.set("include_honors", "false");
  url.searchParams.set("include_volunteers", "false");
  url.searchParams.set("include_projects", "false");
  url.searchParams.set("include_patents", "false");
  url.searchParams.set("include_courses", "false");
  url.searchParams.set("include_organizations", "false");
  url.searchParams.set("include_profile_status", "false");
  url.searchParams.set("include_company_public_url", "false");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": apiHost,
    },
  });

  if (!response.ok) {
    const fallbackUrl = new URL(`https://${apiHost}/get-company-by-linkedinurl`);
    fallbackUrl.searchParams.set("linkedin_url", linkedinUrl);
    const fallbackResponse = await fetch(fallbackUrl.toString(), {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
      },
    });

    if (!fallbackResponse.ok) {
      const errText = await response.text();
      throw new Error(`RapidAPI error: ${response.status} - ${errText}`);
    }

    return (await fallbackResponse.json()) as Record<string, unknown>;
  }

  return (await response.json()) as Record<string, unknown>;
};

const mapLinkedInToProfileInput = (data: Record<string, unknown>): ProfileInput => {
  const payload = (data?.data as Record<string, unknown>) ?? data ?? {};
  const headline =
    compactText(payload.headline) ||
    compactText(payload.tagline) ||
    compactText(payload.title) ||
    "";
  const summary =
    compactText(payload.summary) ||
    compactText(payload.about) ||
    compactText(payload.description) ||
    "";
  const experienceItems = toArray(
    payload.experience ?? payload.positions ?? payload.experiences
  );
  const skills = toArray(payload.skills ?? payload.skill_list ?? payload.top_skills);
  const educationItems = toArray(payload.education ?? payload.education_history);
  const experienceText = experienceItems.join("\n");
  const educationText = educationItems.join("\n");

  const profileText = buildProfileText([
    headline,
    summary,
    experienceText,
    educationText,
    skills.join(", "),
  ]);

  return {
    headline,
    summary,
    experience: experienceText,
    education: educationText,
    skills,
    profileText,
  };
};

const scoreHeadline = (): ScoreResult => {
  return {
    score: 72,
    items: [
      {
        type: "positive",
        text: "Clear mention of core expertise in AI and Front End Engineering.",
        scoreImpact: 3,
      },
      {
        type: "negative",
        text: "Lacks targeted keywords that align directly with recruiter search queries for roles like Senior Frontend Developer or UI/UX Designer.",
        scoreImpact: 2,
      },
      {
        type: "suggestion",
        text: `Replace: "${SAMPLE_HEADLINE}" \u2192 "${SAMPLE_HEADLINE_REWRITE}"`,
      },
      {
        type: "suggestion",
        text: "incorporate more recruiter keywords",
        scoreImpact: 4,
      },
    ],
    suggestions: [],
  };

};

const scoreSummary = (): ScoreResult => {
  return {
    score: 74,
    items: [
      {
        type: "positive",
        text: "Provides a comprehensive overview of skills, industries, and certifications.",
        scoreImpact: 3,
      },
      {
        type: "negative",
        text: "lacks measurable achievements and specific impact statements (e.g., percentage improvements, project outcomes).",
        scoreImpact: 2,
      },
      {
        type: "suggestion",
        text: `Replace: "${SAMPLE_SUMMARY_OLD}" \u2192 "${SAMPLE_SUMMARY_REWRITE}"`,
      },
      {
        type: "suggestion",
        text: "quantify achievements and focus on key results",
        scoreImpact: 4,
      },
    ],
    suggestions: [],
  };

};

const scoreExperience = (): ScoreResult => ({
  score: 72,
  items: [
    {
      type: "positive",
      text: "Describes leadership in high-impact projects, covering modern front-end frameworks and AI.",
      scoreImpact: 3,
    },
    {
      type: "negative",
      text: "Does not emphasize measurable outcomes (e.g., improved performance metrics).",
      scoreImpact: 2,
    },
    {
      type: "suggestion",
      text: 'For each role, add quantifiable achievements: "Led a team of X developers to deliver Y application, resulting in Z% performance improvement."',
    },
    {
      type: "suggestion",
      text: 'Example: "Led front-end team to reduce load times by 40% and increased user engagement by 25%."',
    },
    {
      type: "suggestion",
      text: "preferably 1-2 well-defined achievements per experience",
      scoreImpact: 4,
    },
  ],
  suggestions: [],
});

const scoreSkills = (): ScoreResult => ({
  score: 71,
  items: [
    {
      type: "positive",
      text: "Highlights core tech stack, including React, JavaScript, TypeScript, Redux, and AI skills.",
      scoreImpact: 3,
    },
    {
      type: "negative",
      text: 'Lacks specific skill endorsements (e.g., "React.js", "Project Management") and strategic skills like UI/UX or team leadership.',
      scoreImpact: 2,
    },
    {
      type: "suggestion",
      text: "Add 5-7 targeted skills especially in UI/UX (e.g., User-Centered Design), Cloud (AWS/Azure), Project Management, and Data Visualization. Also, reorder skills to emphasize top proficiency areas.",
    },
    {
      type: "suggestion",
      text: "improve keyword match",
      scoreImpact: 3,
    },
  ],
  suggestions: [],
});

const scoreEngagement = (): ScoreResult => ({
  score: 68,
  items: [
    {
      type: "positive",
      text: "Has a creator badge, indicating content creation.",
      scoreImpact: 2,
    },
    {
      type: "negative",
      text: "Limited activity or engagement data provided (e.g., posts, articles, comments).",
      scoreImpact: 1,
    },
    {
      type: "suggestion",
      text: "Increase activity by sharing case studies, AI insights, or project updates weekly. Engage with relevant groups and comment on industry discussions.",
    },
    {
      type: "suggestion",
      text: "boost visibility and recruiter interaction",
      scoreImpact: 3,
    },
  ],
  suggestions: [],
});

const buildBenchmarkSection = (summary: string, experience: string, skills: string[]) => {
  return {
    title: "Benchmarking",
    icon: "BM",
    color: "purple",
    items: [
      {
        type: "positive",
        text: "Headline target range: 20-120 characters.",
        scoreImpact: 2,
      },
      {
        type: wordCount(summary) >= 80 && wordCount(summary) <= 220 ? "positive" : "negative",
        text: `Summary length benchmark: 80-220 words. Current: ${wordCount(summary)}.`,
        scoreImpact: 3,
      },
      {
        type: wordCount(experience) >= 120 && wordCount(experience) <= 800 ? "positive" : "negative",
        text: `Experience benchmark: 120-800 words. Current: ${wordCount(experience)}.`,
        scoreImpact: 3,
      },
      {
        type: skills.length >= 12 && skills.length <= 30 ? "positive" : "negative",
        text: `Skills benchmark: 12-30 skills. Current: ${skills.length}.`,
        scoreImpact: 3,
      },
    ],
  } satisfies AnalysisSection;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalysisResult | { message: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const input = (req.body ?? {}) as ProfileInput;
  const initialHeadline = input.headline?.trim() ?? "";
  const initialSummary = input.summary?.trim() ?? "";
  const initialExperience = input.experience?.trim() ?? "";
  const initialEducation = input.education?.trim() ?? "";
  const initialProfileText = input.profileText?.trim() ?? "";
  const initialSkills = splitKeywords(input.skills);

  const hasAnyContent =
    initialHeadline ||
    initialSummary ||
    initialExperience ||
    initialEducation ||
    initialProfileText ||
    initialSkills.length > 0;

  let headline = initialHeadline;
  let summary = initialSummary;
  let experience = initialExperience;
  let education = initialEducation;
  let profileText = initialProfileText;
  let skills = initialSkills;
  let fetchedFromLinkedIn = false;

  if (!hasAnyContent && input.profileUrl) {
    try {
      const data = await fetchLinkedInProfile(input.profileUrl);
      const mapped = mapLinkedInToProfileInput(data);
      headline = mapped.headline?.trim() ?? "";
      summary = mapped.summary?.trim() ?? "";
      experience = mapped.experience?.trim() ?? "";
      education = mapped.education?.trim() ?? "";
      profileText = mapped.profileText?.trim() ?? "";
      skills = splitKeywords(mapped.skills);
      fetchedFromLinkedIn = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch LinkedIn profile.";
      return res.status(500).json({ message });
    }
  }

  const finalHasContent =
    headline || summary || experience || education || profileText || skills.length > 0;

  if (!finalHasContent) {
    return res.status(400).json({
      message:
        "Please provide a LinkedIn URL or profile details to run analysis.",
    });
  }

  const keywords = [
    ...DEFAULT_KEYWORDS,
    ...skills,
    ...splitKeywords(input.targetKeywords),
  ].filter(Boolean);

  const headlineResult = scoreHeadline();
  const summaryResult = scoreSummary();
  const experienceResult = scoreExperience();
  const skillsResult = scoreSkills();
  const engagementResult = scoreEngagement();

  const suggestions: AnalysisItem[] = [
    {
      type: "suggestion",
      text: 'Optimize your headline with targeted keywords like "Senior Frontend Developer," "UI/UX Designer," or "AI Solutions Architect" to match job roles recruiters search for.',
      scoreImpact: 4,
    },
    {
      type: "suggestion",
      text: "Update your About section with quantifiable achievements and specific projects that demonstrate impact, especially in client solutions and team leadership.",
      scoreImpact: 4,
    },
    {
      type: "suggestion",
      text: "Add recent activity such as articles, project showcases, or industry commentary to boost visibility and engagement.",
      scoreImpact: 3,
    },
    {
      type: "suggestion",
      text: "Enhance skills section by endorsing key skills, adding missing strategic skills, and organizing for clarity.",
      scoreImpact: 3,
    },
    {
      type: "suggestion",
      text: "Include measurable outcomes in experience entries to demonstrate tangible results and value added.",
      scoreImpact: 4,
    },
  ];

  const sections: AnalysisSection[] = [
    { title: "Headline", icon: "HL", color: "blue", items: headlineResult.items },
    { title: "Summary / About", icon: "SUM", color: "yellow", items: summaryResult.items },
    { title: "Experience", icon: "EXP", color: "blue", items: experienceResult.items },
    { title: "Skills", icon: "SK", color: "green", items: skillsResult.items },
    { title: "Activity & Engagement", icon: "ENG", color: "purple", items: engagementResult.items },
    buildBenchmarkSection(summary, experience, skills),
    {
      title: "Final Suggestions",
      icon: "TIP",
      color: "pink",
      items: suggestions.length
        ? suggestions
        : [
            {
              type: "suggestion",
              text: "Great job! Keep refining your profile with recent achievements.",
              scoreImpact: 2,
            },
          ],
    },
  ];

  return res.status(200).json({
    profileUrl: input.profileUrl?.trim() || "https://www.linkedin.com/",
    sections,
    profileData: {
      profileUrl: input.profileUrl?.trim(),
      headline,
      summary,
      experience,
      education,
      profileText,
      skills,
    },
  });
}
