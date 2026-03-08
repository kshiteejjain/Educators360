import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "@/components/Layout/Layout";
import styles from "./LinkedinAnalysis.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";
import { getSession } from "@/utils/authSession";
import { getDb } from "@/utils/firebase";
import { doc, getDoc } from "firebase/firestore";

type AnalysisSection = {
  title: string;
  icon: string;
  color: string;
  items: AnalysisItem[];
};

type AnalysisItem = {
  type: "positive" | "negative" | "suggestion";
  text: string;
  scoreImpact?: number;
  suggestion?: string;
};

type AnalysisResult = {
  profileScore: number;
  profileUrl: string;
  sections: AnalysisSection[];
  profileData: {
    profileUrl?: string;
    headline?: string;
    summary?: string;
    experience?: string;
    skills?: string[];
    education?: string;
    profileText?: string;
    cvText?: string;
  };
  aiAnalysis?: {
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
};

const sectionColorClass = (color: string) => {
  const normalized = color.toLowerCase();
  if (normalized.includes("yellow")) return styles["section-yellow"];
  if (normalized.includes("green")) return styles["section-green"];
  if (normalized.includes("purple")) return styles["section-purple"];
  if (normalized.includes("pink")) return styles["section-pink"];
  return styles["section-blue"];
};

const iconForType = (type: AnalysisItem["type"]) => {
  if (type === "positive") return { label: "✅", className: styles.checkmark };
  if (type === "negative") return { label: "❌", className: styles.cross };
  return { label: "🔄", className: styles.lightBulb };
};

const formatScoreImpact = (value?: number) =>
  typeof value === "number" ? `(+${value} score)` : "";

const toDisplayScore = (aiScore?: number) => {
  if (typeof aiScore !== "number") return { score: 0, max: 80 };
  const scaled = (aiScore / 100) * 80;
  const rounded = Math.round(scaled * 10) / 10;
  return { score: rounded, max: 80 };
};

const sectionIconLabel = (title: string, fallback: string) => {
  const normalized = title.toLowerCase();
  if (normalized.includes("headline")) return "🔹";
  if (normalized.includes("summary") || normalized.includes("about")) return "📝";
  if (normalized.includes("experience")) return "💼";
  if (normalized.includes("skills")) return "🧠";
  if (normalized.includes("activity") || normalized.includes("engagement")) return "📢";
  if (normalized.includes("suggestion")) return "🚀";
  return fallback;
};

const buildCvText = (resumeData: Record<string, unknown>) => {
  const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const toArray = (value: unknown) =>
    Array.isArray(value) ? value : value ? [value] : [];
  const lines: string[] = [];

  const name = toText(resumeData.name);
  const title = toText(resumeData.title);
  const summary = toText(resumeData.summary);
  const location = toText(resumeData.location);
  const email = toText(resumeData.email);
  const phone = toText(resumeData.phone);

  if (name) lines.push(name);
  if (title) lines.push(title);
  if (location) lines.push(location);
  if (email) lines.push(email);
  if (phone) lines.push(phone);
  if (summary) lines.push(summary);

  const skills = toArray(resumeData.skills)
    .map((item) =>
      typeof item === "string"
        ? item
        : toText((item as Record<string, unknown>)?.name)
    )
    .filter(Boolean);
  if (skills.length) lines.push(`Skills: ${skills.join(", ")}`);

  const languages = toArray(resumeData.languages)
    .map((item) => toText(item))
    .filter(Boolean);
  if (languages.length) lines.push(`Languages: ${languages.join(", ")}`);

  const experiences = toArray(resumeData.experiences)
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter(Boolean) as Record<string, unknown>[];
  if (experiences.length) {
    lines.push("Experience:");
    experiences.forEach((exp) => {
      const role = toText(exp.role);
      const company = toText(exp.company);
      const dates = toText(exp.dates);
      const header = [role, company, dates].filter(Boolean).join(" | ");
      if (header) lines.push(`- ${header}`);
      const bullets = toArray(exp.bullets)
        .map((bullet) => toText(bullet))
        .filter(Boolean);
      bullets.forEach((bullet) => lines.push(`  - ${bullet}`));
    });
  }

  const education = toArray(resumeData.education)
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter(Boolean) as Record<string, unknown>[];
  if (education.length) {
    lines.push("Education:");
    education.forEach((edu) => {
      const degree = toText(edu.degree);
      const school = toText(edu.school);
      const dates = toText(edu.dates);
      const entry = [degree, school, dates].filter(Boolean).join(" | ");
      if (entry) lines.push(`- ${entry}`);
    });
  }

  return lines.join("\n");
};

export default function LinkedinAnalysis() {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resumeStatus, setResumeStatus] = useState<"checking" | "present" | "missing">(
    "checking"
  );
  const [resumeCvText, setResumeCvText] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    linkedinUrl?: string;
    targetRole?: string;
  }>({});
  const { withLoader } = useLoader();

  useEffect(() => {
    const session = getSession();
    if (!session?.email) {
      setHasSession(false);
      setResumeStatus("missing");
      return;
    }
    setHasSession(true);

    const fetchProfile = async () => {
      try {
        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem("upeducateJobPrefix");
            const cached = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const cachedResume = cached?.resume;
            if (cachedResume && typeof cachedResume === "object") {
              const resumeRecord = cachedResume as Record<string, unknown>;
              const resumeData =
                resumeRecord?.data && typeof resumeRecord.data === "object"
                  ? (resumeRecord.data as Record<string, unknown>)
                  : null;
              if (resumeData) {
                setResumeCvText(buildCvText(resumeData));
              }
              setResumeStatus("present");
            }
          } catch (error) {
            console.warn("Failed to parse cached resume", error);
          }
        }

        const db = getDb();
        const userRef = doc(db, "upEducatePlusUsers", session.email.toLowerCase());
        const snap = await getDoc(userRef);
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        const resume = data?.resume;
        const resumeRecord =
          resume && typeof resume === "object" ? (resume as Record<string, unknown>) : null;
        const resumeData =
          resumeRecord?.data && typeof resumeRecord.data === "object"
            ? (resumeRecord.data as Record<string, unknown>)
            : null;
        const hasResume =
          Boolean(resumeData && Object.keys(resumeData).length > 0) ||
          Boolean(resumeRecord && Object.keys(resumeRecord).length > 0);
        if (resumeData) {
          setResumeCvText(buildCvText(resumeData));
        }
        setResumeStatus(hasResume ? "present" : "missing");
      } catch (err) {
        console.warn("Failed to check resume status", err);
        setResumeStatus("missing");
      }
    };

    void fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (resumeStatus !== "present") {
      setError("Please upload or create your resume to access this feature.");
      return;
    }

    const nextErrors: { linkedinUrl?: string; targetRole?: string } = {};
    if (!linkedinUrl.trim()) {
      nextErrors.linkedinUrl = "Please enter a valid LinkedIn profile URL";
    }
    if (!targetRole.trim()) {
      nextErrors.targetRole = "Please enter a target role";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setIsLoading(true);

    const analyzeProfile = async () => {
      try {
        const response = await fetch("/api/linkedinAnalysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileUrl: linkedinUrl }),
        });
        const baseData = (await response.json()) as
          | (Omit<AnalysisResult, "profileScore" | "aiAnalysis"> & { message?: string })
          | { message?: string };
        if (!response.ok) {
          throw new Error(
            "message" in baseData ? baseData.message || "Failed to analyze profile." : ""
          );
        }

        const aiResponse = await fetch("/api/linkedinAiAnalysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileData: {
              ...(baseData as AnalysisResult).profileData,
              cvText: resumeCvText,
            },
            sections: (baseData as AnalysisResult).sections,
            targetRole,
          }),
        });
        const aiData = (await aiResponse.json()) as {
          message?: string;
          aiScore?: number;
          scoreRationale?: string;
          recommendations?: string[];
          modifications?: {
            headline?: string;
            about?: string;
            experienceBullets?: string[];
            skills?: string[];
          };
          suggestedKeywords?: string[];
          analysisText?: string;
          strategicKeywordCloud?: string[];
          targetRoleInsights?: {
            roleSummary?: string;
            growth?: string;
            marketValue?: string;
            jobInsights?: string[];
          };
        };
        if (!aiResponse.ok) {
          throw new Error(aiData?.message || "Failed to analyze profile with AI.");
        }

        setAnalysisResult({
          ...(baseData as AnalysisResult),
          profileScore: aiData.aiScore ?? 0,
          aiAnalysis: {
            aiScore: aiData.aiScore ?? 0,
            scoreRationale: aiData.scoreRationale ?? "",
            recommendations: aiData.recommendations ?? [],
            modifications: aiData.modifications ?? {},
            suggestedKeywords: aiData.suggestedKeywords ?? [],
            analysisText: aiData.analysisText ?? "",
            strategicKeywordCloud: aiData.strategicKeywordCloud ?? [],
            targetRoleInsights: aiData.targetRoleInsights ?? {
              roleSummary: "",
              growth: "",
              marketValue: "",
              jobInsights: [],
            },
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to analyze profile.");
        console.error("LinkedIn analysis failed", err);
      } finally {
        setIsLoading(false);
      }
    };

    await withLoader(analyzeProfile, "Analyzing your LinkedIn profile...");
  };

  return (
    <Layout>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1>LinkedIn Profile Analyzer</h1>
          <p>Get AI-powered insights to optimize your LinkedIn profile and boost recruiter visibility</p>
        </div>

        {/* Input Section */}
        <div className={styles.inputSection}>
          {resumeStatus === "missing" && (
            <div className={styles.resumeGate}>
              <div className={styles.resumeGateIcon} aria-hidden="true" />
              <div className={styles.resumeGateText}>
                <strong>Resume required.</strong>{" "}
                {hasSession
                  ? "Please upload or create your resume to access this LinkedIn analysis feature."
                  : "Please log in and upload or create your resume to access this feature."}{" "}
                <Link href={hasSession ? "/ResumeBuilder" : "/login"} className={styles.resumeGateLink}>
                  {hasSession ? "Go to Resume Builder" : "Go to Login"}
                </Link>
                .
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label htmlFor="linkedinUrl">
                Enter Your LinkedIn Profile URL *
              </label>
              <input
                id="linkedinUrl"
                type="url"
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  if (fieldErrors.linkedinUrl) {
                    setFieldErrors((prev) => ({ ...prev, linkedinUrl: undefined }));
                  }
                }}
                placeholder="https://www.linkedin.com/in/yourprofile/"
                className="form-control"
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.linkedinUrl)}
                aria-describedby={fieldErrors.linkedinUrl ? "linkedin-url-error" : undefined}
                required
              />
              <p className={styles.hint}>Example: https://www.linkedin.com/in/kshiteejjain/</p>
              {fieldErrors.linkedinUrl && (
                <p id="linkedin-url-error" className={styles.fieldError}>
                  {fieldErrors.linkedinUrl}
                </p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="targetRole">
                Target Role *
              </label>
              <input
                id="targetRole"
                type="text"
                value={targetRole}
                onChange={(e) => {
                  setTargetRole(e.target.value);
                  if (fieldErrors.targetRole) {
                    setFieldErrors((prev) => ({ ...prev, targetRole: undefined }));
                  }
                }}
                placeholder="e.g., Maths Teacher"
                className="form-control"
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.targetRole)}
                aria-describedby={fieldErrors.targetRole ? "target-role-error" : undefined}
                required
              />
              <p className={styles.hint}>Example: Role you are looking for</p>
              {fieldErrors.targetRole && (
                <p id="target-role-error" className={styles.fieldError}>
                  {fieldErrors.targetRole}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || resumeStatus !== "present"}
            >
              {isLoading ? "Analyzing..." : "Analyze Profile"}
            </button>
          </form>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Analysis Results */}
        {analysisResult && (
          <div className={styles.resultsSection}>
            <div className={styles.scoreCard}>
              <div className={styles.scoreDisplay}>
                <div className={styles.scoreCircle} style={{ borderColor: "#0a66c2" }}>
                  <div className={styles.scoreValue}>
                    {toDisplayScore(analysisResult.aiAnalysis?.aiScore).score}
                  </div>
                  <div className={styles.scoreMax}>
                    / {toDisplayScore(analysisResult.aiAnalysis?.aiScore).max}
                  </div>
                </div>
                <div className={styles.scoreInfo}>
                  <h2>Profile Score</h2>
                  <p className={styles.scoreMeta}>
                    {toDisplayScore(analysisResult.aiAnalysis?.aiScore).score} /{" "}
                    {toDisplayScore(analysisResult.aiAnalysis?.aiScore).max}
                  </p>
                  <p className={styles.scoreDescription}>
                    {analysisResult.aiAnalysis?.scoreRationale ||
                      "We analyzed your LinkedIn profile for clarity, impact, and recruiter relevance."}
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.analysisGrid}>
              {analysisResult.sections.map((section) => (
                <div
                  key={section.title}
                  className={`${styles.section} ${sectionColorClass(section.color)}`}
                >
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>
                      {sectionIconLabel(section.title, section.icon)}
                    </span>
                    <h3>{section.title}</h3>
                  </div>
                  <div className={styles.sectionContent}>
                    {section.items.map((item, idx) => {
                      const icon = iconForType(item.type);
                      return (
                        <div key={`${section.title}-${idx}`} className={styles.item}>
                          <div className={styles.itemHeader}>
                            <span className={icon.className}>{icon.label}</span>
                            <span className={styles.itemInlineText}>{item.text}</span>
                            {item.scoreImpact ? (
                              <span className={styles.scoreTag}>
                                {formatScoreImpact(item.scoreImpact)}
                              </span>
                            ) : null}
                          </div>
                          {item.suggestion ? (
                            <div className={styles.suggestion}>
                              <strong>Replace / Action Plan</strong>
                              <p>{item.suggestion}</p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {analysisResult.aiAnalysis?.recommendations?.length ? (
              <div className={styles.actionSection}>
                <h2>Final Suggestions</h2>
                <ul className={styles.cardList}>
                  {analysisResult.aiAnalysis.recommendations.map((rec, idx) => (
                    <li key={`rec-${idx}`}>{rec}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Layout>
  );
}




