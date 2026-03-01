import { useState } from "react";
import Layout from "@/components/Layout/Layout";
import styles from "./LinkedinAnalysis.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";

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

export default function LinkedinAnalysis() {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    linkedinUrl?: string;
    targetRole?: string;
  }>({});
  const { withLoader } = useLoader();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

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
            profileData: (baseData as AnalysisResult).profileData,
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

            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Analyzing..." : "Analyze Profile"}
            </button>
          </form>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Analysis Results */}
        {analysisResult && (
          <div className={styles.resultsSection}>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(analysisResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Layout>
  );
}

