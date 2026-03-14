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
  targetRole?: string;
};

type ScoreResult = {
  score: number;
  items: AnalysisItem[];
  suggestions: AnalysisItem[];
};

const WEIGHTS = {
  headline: 20,
  summary: 25,
  experience: 25,
  skills: 20,
  engagement: 10,
};

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

const clip = (value: string, max = 140) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const normalizeRoleKeywords = (targetRole?: string) =>
  (targetRole || "")
    .split(/[\s,/|]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 2);

const buildHeadlineRewrite = (targetRole: string, skills: string[]) => {
  const skillSnippet = skills.slice(0, 3).join(", ");
  const rolePart = targetRole ? targetRole : "Target Role";
  return skillSnippet ? `${rolePart} | ${skillSnippet}` : rolePart;
};

const buildSummaryRewrite = (targetRole: string, skills: string[]) => {
  const rolePart = targetRole ? targetRole : "Target Role";
  const skillSnippet = skills.slice(0, 4).join(", ");
  const skillLine = skillSnippet ? `Key strengths: ${skillSnippet}.` : "";
  return `${rolePart} with proven impact in [domain/industry]. Focused on [core responsibilities] and measurable outcomes (e.g., [metric 1], [metric 2]). ${skillLine} Seeking to deliver results aligned with ${rolePart} requirements.`;
};

const buildExperienceRewrite = (targetRole: string) =>
  `Reframe each role to highlight ${targetRole || "target role"}-relevant responsibilities and outcomes. Example: "Delivered [result] by applying [skill/tool], improving [metric] by [X%]."`;

const buildSkillsRewrite = (targetRole: string) =>
  `Prioritize skills aligned to ${targetRole || "your target role"} and remove unrelated skills. Group by categories (e.g., tools, methods, domain knowledge).`;

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

const scoreHeadline = (
  headline: string,
  targetRole: string,
  roleKeywords: string[],
  skills: string[]
): ScoreResult => {
  const roleLabel = targetRole || "your target role";
  const matchCount = countMatches(headline, roleKeywords);
  const hasHeadline = Boolean(headline.trim());
  const rewrite = buildHeadlineRewrite(roleLabel, skills);
  return {
    score: 72,
    items: [
      ...(hasHeadline && matchCount > 0
        ? [
            {
              type: "positive" as const,
              text: `Includes some ${roleLabel} keywords in the headline.`,
              scoreImpact: 3,
            },
          ]
        : []),
      {
        type: "negative",
        text: `Headline does not clearly position you for ${roleLabel}.`,
        scoreImpact: 2,
      },
      {
        type: "suggestion",
        text: `Replace: "${clip(headline || "current headline")}" -> "${rewrite}"`,
      },
      {
        type: "suggestion",
        text: `Add 2-3 ${roleLabel} keywords recruiters search for.`,
        scoreImpact: 4,
      },
    ],
    suggestions: [],
  };
};

const scoreSummary = (
  summary: string,
  targetRole: string,
  roleKeywords: string[],
  skills: string[]
): ScoreResult => {
  const roleLabel = targetRole || "your target role";
  const matchCount = countMatches(summary, roleKeywords);
  const rewrite = buildSummaryRewrite(roleLabel, skills);
  return {
    score: 74,
    items: [
      ...(summary.trim() && matchCount > 0
        ? [
            {
              type: "positive" as const,
              text: `Summary mentions ${roleLabel} keywords and responsibilities.`,
              scoreImpact: 3,
            },
          ]
        : []),
      {
        type: "negative",
        text: `Summary lacks clear alignment to ${roleLabel} and measurable outcomes.`,
        scoreImpact: 2,
      },
      {
        type: "suggestion",
        text: `Replace: "${clip(summary || "current summary")}" -> "${rewrite}"`,
      },
      {
        type: "suggestion",
        text: "Quantify achievements and focus on role-relevant impact.",
        scoreImpact: 4,
      },
    ],
    suggestions: [],
  };
};

const scoreExperience = (experience: string, targetRole: string): ScoreResult => {
  const roleLabel = targetRole || "your target role";
  const rewrite = buildExperienceRewrite(roleLabel);
  return {
    score: 72,
    items: [
      ...(experience.trim()
        ? [
            {
              type: "positive" as const,
              text: "Experience section is present and can be aligned to the target role.",
              scoreImpact: 3,
            },
          ]
        : []),
      {
        type: "negative",
        text: `Experience does not emphasize ${roleLabel}-specific outcomes and impact.`,
        scoreImpact: 2,
      },
      {
        type: "suggestion",
        text: rewrite,
      },
      {
        type: "suggestion",
        text: "Add 1-2 measurable outcomes per role that map directly to the target role.",
        scoreImpact: 4,
      },
    ],
    suggestions: [],
  };
};

const scoreSkills = (skills: string[], targetRole: string): ScoreResult => {
  const roleLabel = targetRole || "your target role";
  const rewrite = buildSkillsRewrite(roleLabel);
  return {
    score: 71,
    items: [
      ...(skills.length
        ? [
            {
              type: "positive" as const,
              text: "Skills section is present.",
              scoreImpact: 3,
            },
          ]
        : []),
      {
        type: "negative",
        text: `Skills are not clearly tailored to ${roleLabel}.`,
        scoreImpact: 2,
      },
      {
        type: "suggestion",
        text: rewrite,
      },
      {
        type: "suggestion",
        text: `Add 8-12 role-specific skills aligned with ${roleLabel}.`,
        scoreImpact: 3,
      },
    ],
    suggestions: [],
  };
};

const scoreEngagement = (targetRole: string): ScoreResult => {
  const roleLabel = targetRole || "your target role";
  return {
    score: 68,
    items: [
      {
        type: "negative",
        text: "Limited activity or engagement evidence provided.",
        scoreImpact: 1,
      },
      {
        type: "suggestion",
        text: `Post or share content related to ${roleLabel} to build credibility and visibility.`,
      },
      {
        type: "suggestion",
        text: "Engage weekly with relevant groups, comments, and industry discussions.",
        scoreImpact: 3,
      },
    ],
    suggestions: [],
  };
};

const buildBenchmarkSection = (
  summary: string,
  experience: string,
  skills: string[],
  targetRole: string
) => {
  const roleLabel = targetRole || "your target role";
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
      {
        type: "suggestion",
        text: `Ensure the top skills directly map to ${roleLabel} requirements.`,
        scoreImpact: 2,
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

  const roleKeywords = normalizeRoleKeywords(input.targetRole);

  const headlineResult = scoreHeadline(headline, input.targetRole ?? "", roleKeywords, skills);
  const summaryResult = scoreSummary(summary, input.targetRole ?? "", roleKeywords, skills);
  const experienceResult = scoreExperience(experience, input.targetRole ?? "");
  const skillsResult = scoreSkills(skills, input.targetRole ?? "");
  const engagementResult = scoreEngagement(input.targetRole ?? "");

  const suggestions: AnalysisItem[] = [
    {
      type: "suggestion",
      text: `Optimize your headline with ${input.targetRole || "target role"} keywords to match recruiter searches.`,
      scoreImpact: 4,
    },
    {
      type: "suggestion",
      text: "Update your About section with quantifiable achievements and role-relevant responsibilities.",
      scoreImpact: 4,
    },
    {
      type: "suggestion",
      text: `Add recent activity that signals expertise in ${input.targetRole || "your target role"}.`,
      scoreImpact: 3,
    },
    {
      type: "suggestion",
      text: "Enhance skills section by adding missing role-specific skills and organizing for clarity.",
      scoreImpact: 3,
    },
    {
      type: "suggestion",
      text: "Include measurable outcomes in experience entries to demonstrate impact relevant to the target role.",
      scoreImpact: 4,
    },
  ];

  const sections: AnalysisSection[] = [
    { title: "Headline", icon: "HL", color: "blue", items: headlineResult.items },
    { title: "Summary / About", icon: "SUM", color: "yellow", items: summaryResult.items },
    { title: "Experience", icon: "EXP", color: "blue", items: experienceResult.items },
    { title: "Skills", icon: "SK", color: "green", items: skillsResult.items },
    { title: "Activity & Engagement", icon: "ENG", color: "purple", items: engagementResult.items },
    buildBenchmarkSection(summary, experience, skills, input.targetRole ?? ""),
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
