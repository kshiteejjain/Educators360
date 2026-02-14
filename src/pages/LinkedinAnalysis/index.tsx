import { useState } from "react";
import Link from "next/link";
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
  const { withLoader } = useLoader();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!linkedinUrl.trim()) {
      setError("Please enter a valid LinkedIn profile URL");
      return;
    }
    if (!targetRole.trim()) {
      setError("Please enter a target role");
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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#10b981"; // Green
    if (score >= 60) return "#f59e0b"; // Amber
    return "#ef4444"; // Red
  };

  const getScoreMessage = (score: number) => {
    if (score >= 80) return "Excellent Profile!";
    if (score >= 60) return "Good Profile";
    return "Needs Improvement";
  };

  return (
    <Layout>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1>🔗 LinkedIn Profile Analyzer</h1>
          <p>Get AI-powered insights to optimize your LinkedIn profile and boost recruiter visibility</p>
        </div>

        {/* Input Section */}
        <div className={styles.inputSection}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="linkedinUrl" className={styles.label}>
                Enter Your LinkedIn Profile URL
              </label>
              <input
                id="linkedinUrl"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/yourprofile/"
                className={styles.input}
                disabled={isLoading}
              />
              <p className={styles.hint}>Example: https://www.linkedin.com/in/kshiteejjain/</p>
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="targetRole" className={styles.label}>
                Target Role
              </label>
              <input
                id="targetRole"
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g., Maths Teacher"
                className={styles.input}
                disabled={isLoading}
              />
              <p className={styles.hint}>Example: Role you are looking for</p>
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
            {/* Score Card */}
            <div className={styles.scoreCard}>
              <div className={styles.scoreDisplay}>
                <div
                  className={styles.scoreCircle}
                  style={{ borderColor: getScoreColor(analysisResult.profileScore) }}
                >
                  <span
                    className={styles.scoreValue}
                    style={{ color: getScoreColor(analysisResult.profileScore) }}
                  >
                    {analysisResult.profileScore}
                  </span>
                  <span className={styles.scoreMax}>/100</span>
                </div>
                <div className={styles.scoreInfo}>
                  <h2 style={{ color: getScoreColor(analysisResult.profileScore) }}>
                    {analysisResult.profileScore > 50 && " ❤️"} {getScoreMessage(analysisResult.profileScore)}
                  </h2>
                  <p className={styles.scoreDescription}>
                    Your profile demonstrates strong technical expertise, but focused improvements can significantly enhance your impact and searchability.
                  </p>
                  <Link href="/ResumeBuilder" className={styles.improvementBtn}>
                    View Recommendations →
                  </Link>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Profile Score</span>
                <span className={styles.summaryValue}>
                  {analysisResult.profileScore}
                </span>
              </div>
              {analysisResult.sections.map((section, idx) => (
                <div key={`${section.title}-${idx}`} className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>{section.title}</span>
                  <span className={styles.summaryValue}>{section.items.length}</span>
                  <span className={styles.summarySubtext}>insights</span>
                </div>
              ))}
            </div>

            {/* Analysis Sections */}
            <div className={styles.analysisGrid}>
              {analysisResult.sections.map((section, sectionIdx) => (
                <div
                  key={sectionIdx}
                  className={`${styles.section} ${styles[`section-${section.color}`]}`}
                >
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>{section.icon}</span>
                    <h3>{section.title}</h3>
                  </div>

                  <div className={styles.sectionContent}>
                    {section.items.map((item, itemIdx) => (
                      <div key={itemIdx} className={styles.item}>
                        {item.type === "positive" && (
                          <>
                            <div className={styles.itemHeader}>
                              <span className={styles.checkmark}>✅</span>
                              <span className={styles.itemInlineText}>{item.text}</span>
                              <span className={styles.scoreTag}>+{item.scoreImpact}</span>
                            </div>
                          </>
                        )}
                        {item.type === "negative" && (
                          <>
                            <div className={styles.itemHeader}>
                              <span className={styles.cross}>⛔</span>
                              <span className={styles.itemInlineText}>{item.text}</span>
                              <span className={styles.scoreTag}>+{item.scoreImpact}</span>
                            </div>
                            {item.suggestion && (
                              <div className={styles.suggestion}>
                                <strong>Replace with a concise, targeted</strong>
                                <p>{item.suggestion}</p>
                              </div>
                            )}
                          </>
                        )}
                        {item.type === "suggestion" && (
                          <>
                            <div className={styles.itemHeader}>
                              <span className={styles.lightBulb}>💡</span>
                              <span className={styles.itemInlineText}>{item.text}</span>
                              <span className={styles.scoreTag}>+{item.scoreImpact}</span>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* AI Recommendations (card layout) */}
            {analysisResult.aiAnalysis && (
              <div className={styles.aiCardGrid}>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>AI Score</span>
                  <span className={styles.summaryValue}>
                    {analysisResult.aiAnalysis.aiScore}
                  </span>
                  <p className={styles.cardText}>
                    {analysisResult.aiAnalysis.scoreRationale}
                  </p>
                </div>

                {!!analysisResult.aiAnalysis.recommendations?.length && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Top Recommendations</span>
                    <ul className={styles.cardList}>
                      {analysisResult.aiAnalysis.recommendations.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysisResult.aiAnalysis.modifications.headline && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Headline Rewrite</span>
                    <p className={styles.cardText}>
                      {analysisResult.aiAnalysis.modifications.headline}
                    </p>
                  </div>
                )}

                {analysisResult.aiAnalysis.modifications.about && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>About Rewrite</span>
                    <p className={styles.cardText}>
                      {analysisResult.aiAnalysis.modifications.about}
                    </p>
                  </div>
                )}

                {!!analysisResult.aiAnalysis.modifications.experienceBullets?.length && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Experience Bullets</span>
                    <ul className={styles.cardList}>
                      {analysisResult.aiAnalysis.modifications.experienceBullets.map(
                        (item, idx) => (
                          <li key={idx}>{item}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {!!analysisResult.aiAnalysis.modifications.skills?.length && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Suggested Skills</span>
                    <div className={styles.cardTags}>
                      {analysisResult.aiAnalysis.modifications.skills.map((item, idx) => (
                        <span key={idx} className={styles.cardTag}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!!analysisResult.aiAnalysis.suggestedKeywords?.length && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Suggested Keywords</span>
                    <div className={styles.cardTags}>
                      {analysisResult.aiAnalysis.suggestedKeywords.map((item, idx) => (
                        <span key={idx} className={styles.cardTag}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!!analysisResult.aiAnalysis.strategicKeywordCloud?.length && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Strategic Keyword Cloud</span>
                    <div className={styles.cardTags}>
                      {analysisResult.aiAnalysis.strategicKeywordCloud.map((item, idx) => (
                        <span key={idx} className={styles.cardTag}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult.aiAnalysis.analysisText && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Gap & Synthesis Analysis</span>
                    <p className={styles.cardText} style={{ whiteSpace: "pre-wrap" }}>
                      {analysisResult.aiAnalysis.analysisText}
                    </p>
                  </div>
                )}

                {(analysisResult.aiAnalysis.targetRoleInsights?.roleSummary ||
                  analysisResult.aiAnalysis.targetRoleInsights?.growth ||
                  analysisResult.aiAnalysis.targetRoleInsights?.marketValue ||
                  analysisResult.aiAnalysis.targetRoleInsights?.jobInsights?.length) && (
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Target Role Insights</span>
                    {analysisResult.aiAnalysis.targetRoleInsights?.roleSummary && (
                      <p className={styles.cardText}>
                        {analysisResult.aiAnalysis.targetRoleInsights.roleSummary}
                      </p>
                    )}
                    {analysisResult.aiAnalysis.targetRoleInsights?.growth && (
                      <p className={styles.cardText}>
                        <strong>Growth:</strong>{" "}
                        {analysisResult.aiAnalysis.targetRoleInsights.growth}
                      </p>
                    )}
                    {analysisResult.aiAnalysis.targetRoleInsights?.marketValue && (
                      <p className={styles.cardText}>
                        <strong>Market Value:</strong>{" "}
                        {analysisResult.aiAnalysis.targetRoleInsights.marketValue}
                      </p>
                    )}
                    {!!analysisResult.aiAnalysis.targetRoleInsights?.jobInsights?.length && (
                      <ul className={styles.cardList}>
                        {analysisResult.aiAnalysis.targetRoleInsights.jobInsights.map(
                          (item, idx) => (
                            <li key={idx}>{item}</li>
                          )
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Section */}
            <div className={styles.actionSection}>
              <h2>Next Steps</h2>
              <div className={styles.actionGrid}>
                <div className={styles.actionCard}>
                  <span className={styles.actionIcon}>📄</span>
                  <h4>Update Your Profile</h4>
                  <p>Implement the suggestions above to boost your profile score</p>
                  <a href={analysisResult.profileUrl} target="_blank" rel="noopener noreferrer" className={styles.actionLink}>
                    Edit on LinkedIn →
                  </a>
                </div>
                <div className={styles.actionCard}>
                  <span className={styles.actionIcon}>💼</span>
                  <h4>Build Your Resume</h4>
                  <p>Create a matching resume that aligns with your LinkedIn profile</p>
                  <Link href="/ResumeBuilder" className={styles.actionLink}>
                    Create Resume →
                  </Link>
                </div>
                <div className={styles.actionCard}>
                  <span className={styles.actionIcon}>🤖</span>
                  <h4>Interview Practice</h4>
                  <p>Prepare for interviews with AI-powered interview questions</p>
                  <Link href="/InterviewQuestions" className={styles.actionLink}>
                    Start Practice →
                  </Link>
                </div>
              </div>
            </div>

            {/* Analyze Another */}
            <div className={styles.analyzeAnother}>
              <button
                onClick={() => {
                  setAnalysisResult(null);
                  setLinkedinUrl("");
                  setTargetRole("");
                }}
                className={styles.analyzeAnotherBtn}
              >
                ← Analyze Another Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
