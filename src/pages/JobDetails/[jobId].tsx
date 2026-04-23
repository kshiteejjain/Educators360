import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "@/components/Layout/Layout";
import styles from "./JobDetails.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";

type JobDetails = {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  description: string;
  applyUrl?: string;
  companyWebsite?: string;
  employmentType?: string;
  salary?: string;
};

type JobDetailsResponse = {
  job: JobDetails;
  raw: Record<string, unknown>;
};

type AiRelevanceResult = {
  relevanceScore?: number;
  matchSummary?: string;
  strengths?: string[];
  gaps?: string[];
  improvements?: string[];
  suggestions?: string[];
};

const hiddenKeys = new Set([
  "job_apply_is_direct",
  "job_apply_options",
  "job_is_remote",
  "job_posted_at_timestamp",
  "job_id",
  "job_city",
  "job_state",
  "job_country",
  "job_latitude",
  "job_longitude",
  "job_google_link",
  "job_salary",
  "job_salary_min",
  "job_salary_max",
  "job_min_salary",
  "job_max_salary",
  "job_benefits",
  "job_apply_link",
  "job_employment_types",
  "job_description",
  "job_salary_period",
  "job_highlights",
  "job_onet_soc",
  "job_onet_job_zone",
  "apply_options",
  "employer_logo",
  "employer_website",
]);

const labelOverrides: Record<string, string> = {
  job_posted_at_datetime_utc: "Job Posted Date",
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const truncateWords = (text: string, maxWords: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const getFirstWords = (text: string, maxWords: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
};

const toText = (value: unknown) => {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "name" in item) {
          const name = (item as { name?: unknown }).name;
          return typeof name === "string" ? name.trim() : "";
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "string") return value.trim();
  return "";
};

const extractProfileData = (profile: Record<string, unknown> | null) => {
  const resume =
    profile && typeof profile.resume === "object" && profile.resume !== null
      ? (profile.resume as Record<string, unknown>)
      : null;
  const resumeData =
    resume && typeof resume.data === "object" && resume.data !== null
      ? (resume.data as Record<string, unknown>)
      : null;
  const skills = toText(resumeData?.skills);
  const summary = toText(resumeData?.summary);
  return { skills, summary };
};

const safeParseJson = (value: string) => {
  try {
    return JSON.parse(value) as AiRelevanceResult;
  } catch {
    return null;
  }
};

const formatKey = (key: string) =>
  labelOverrides[key] ??
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const renderValue = (value: unknown, key?: string) => {
  if (value === null || value === undefined) {
    return "Not Defined";
  }
  if (key === "job_posted_at_datetime_utc" && typeof value === "string") {
    return formatDate(value);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
};

const renderTextWithBreaks = (value: string) => {
  if (!value.includes("\n")) return value;
  const lines = value.split(/\n/);
  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
};

const renderInline = (text: string) => {
  if (!text.includes("*")) return text;
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={`bold-${index}`}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={`italic-${index}`}>{token.slice(1, -1)}</em>;
    }
    return <Fragment key={`text-${index}`}>{token}</Fragment>;
  });
};

const renderRichText = (value: string) => {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockKey = 0;

  const isListItem = (line: string) => /^(\*|-|•)\s+/.test(line.trim());
  const isOrderedItem = (line: string) => /^\d+\.\s+/.test(line.trim());
  const isHeading = (line: string) => /^#{1,4}\s+/.test(line.trim());
  const isHr = (line: string) => /^-{3,}$/.test(line.trim());

  const collectListItems = (ordered: boolean) => {
    const items: string[][] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (ordered ? isOrderedItem(current) : isListItem(current)) {
        const cleaned = ordered
          ? current.replace(/^\d+\.\s+/, "")
          : current.replace(/^(\*|-|•)\s+/, "");
        const itemLines: string[] = [cleaned];
        index += 1;
        while (index < lines.length) {
          const next = lines[index];
          const nextTrimmed = next.trim();
          if (
            (ordered ? isOrderedItem(nextTrimmed) : isListItem(nextTrimmed)) ||
            isHeading(nextTrimmed) ||
            isHr(nextTrimmed)
          ) {
            break;
          }
          if (!nextTrimmed) {
            itemLines.push("");
            index += 1;
            continue;
          }
          itemLines.push(nextTrimmed);
          index += 1;
        }
        items.push(itemLines);
      } else {
        break;
      }
    }
    return items;
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push(<br key={`br-${blockKey++}`} />);
      index += 1;
      continue;
    }

    if (isHr(trimmed)) {
      blocks.push(<hr key={`hr-${blockKey++}`} />);
      index += 1;
      continue;
    }

    if (isHeading(trimmed)) {
      const match = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        if (level === 1) {
          blocks.push(<h1 key={`h-${blockKey++}`}>{renderInline(text)}</h1>);
        } else if (level === 2) {
          blocks.push(<h2 key={`h-${blockKey++}`}>{renderInline(text)}</h2>);
        } else if (level === 3) {
          blocks.push(<h3 key={`h-${blockKey++}`}>{renderInline(text)}</h3>);
        } else {
          blocks.push(<h4 key={`h-${blockKey++}`}>{renderInline(text)}</h4>);
        }
      }
      index += 1;
      continue;
    }

    if (isListItem(trimmed) || isOrderedItem(trimmed)) {
      const ordered = isOrderedItem(trimmed);
      const items = collectListItems(ordered);
      const listItems = items.map((itemLines, itemIndex) => {
        const paragraphs: string[] = [];
        let buffer: string[] = [];
        itemLines.forEach((line) => {
          if (!line) {
            if (buffer.length) {
              paragraphs.push(buffer.join(" "));
              buffer = [];
            }
          } else {
            buffer.push(line);
          }
        });
        if (buffer.length) paragraphs.push(buffer.join(" "));
        return (
          <li key={`li-${blockKey}-${itemIndex}`}>
            {paragraphs.map((paragraph, paragraphIndex) => (
              <p key={`li-p-${blockKey}-${itemIndex}-${paragraphIndex}`}>
                {renderInline(paragraph)}
              </p>
            ))}
          </li>
        );
      });
      blocks.push(
        ordered ? (
        <ol key={`list-${blockKey++}`}>{listItems}</ol>
        ) : (
          <ul key={`list-${blockKey++}`}>{listItems}</ul>
        )
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (
        !currentTrimmed ||
        isHeading(currentTrimmed) ||
        isListItem(currentTrimmed) ||
        isOrderedItem(currentTrimmed) ||
        isHr(currentTrimmed)
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }
    const paragraph = paragraphLines.join(" ");
    blocks.push(
      <p key={`p-${blockKey++}`}>
        {renderInline(paragraph)}
      </p>
    );
  }

  return blocks;
};

export default function JobDetailsPage() {
  const router = useRouter();
  const jobId = useMemo(() => {
    const value = router.query.jobId;
    return typeof value === "string" ? value : "";
  }, [router.query.jobId]);
  const [job, setJob] = useState<JobDetails | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileSkills, setProfileSkills] = useState("");
  const [profileSummary, setProfileSummary] = useState("");
  const [aiResult, setAiResult] = useState<AiRelevanceResult | null>(null);
  const [aiRaw, setAiRaw] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiSectionRef = useRef<HTMLDivElement | null>(null);
  const { withLoader } = useLoader();

  useEffect(() => {
    if (!router.isReady || !jobId) return;
    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
        const url = new URL(`${apiBaseUrl}/api/job-details`, window.location.origin);
        url.searchParams.set("job_id", jobId);
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Failed to load job details (${response.status})`);
        const result = (await response.json()) as JobDetailsResponse;
        if (!result.job) throw new Error("No job details returned");
        setJob(result.job);
        setRaw(result.raw || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load job details");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchDetails();
  }, [jobId, router.isReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawProfile = window.localStorage.getItem("educators360JobPrefix");
      if (!rawProfile) return;
      const parsed = JSON.parse(rawProfile) as Record<string, unknown>;
      const extracted = extractProfileData(parsed);
      if (extracted.skills) setProfileSkills(extracted.skills);
      if (extracted.summary) setProfileSummary(extracted.summary);
    } catch (err) {
      console.warn("Failed to read stored user profile", err);
    }
  }, []);

  useEffect(() => {
    setAiResult(null);
    setAiRaw(null);
    setAiError(null);
  }, [jobId]);

  const runAnalysis = async () => {
    if (!job?.description) return;
    if (!profileSkills && !profileSummary) return;
    if (aiLoading) return;
    const jobExcerpt = getFirstWords(job.description, 100);
    const summaryExcerpt = getFirstWords(profileSummary, 100);
    await withLoader(async () => {
      try {
        setAiLoading(true);
        setAiError(null);
        setAiResult(null);
        setAiRaw(null);
        const response = await fetch("/api/checkJobRelevance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skills: profileSkills,
            summary: summaryExcerpt,
            jobExcerpt,
          }),
        });

        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(responseText || `AI request failed (${response.status})`);
        }

        let content = responseText;
        try {
          const parsed = JSON.parse(responseText) as Record<string, unknown>;
          if (typeof parsed.content === "string") {
            content = parsed.content;
          }
        } catch {
          // Fall back to raw text
        }

        const parsedResult = safeParseJson(content);
        if (parsedResult) {
          setAiResult(parsedResult);
        } else {
          setAiRaw(content.trim());
        }

        requestAnimationFrame(() => {
          aiSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Failed to analyze job relevance.");
      } finally {
        setAiLoading(false);
      }
    }, "Analyzing job relevance...");
  };

  return (
    <Layout>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          <Link href="/ViewJobs">← Back to jobs</Link>
        </div>

        {isLoading ? (
          <div className={styles.statusCard}>
            <Image
              src="/no-data.svg"
              alt="Loading job details"
              width={240}
              height={200}
            />
            <p>Loading job details...</p>
          </div>
        ) : error ? (
          <p className={styles.status}>Error: {error}</p>
        ) : job ? (
          <div className={styles.card}>
            <div className={styles.hero}>
              <div>
                <p className={styles.companyLine}>🏢 {job.company || "Not Defined"}</p>
                <h1 className={styles.title}>{job.title || "Not Defined"}</h1>
                <ul className={styles.metaList}>
                  <li>📍 {job.location || "Not Defined"}</li>
                  <li>🗓️ {job.postedAt ? formatDate(job.postedAt) : "Not Defined"}</li>
                  <li>🧭 {job.employmentType || "Not Defined"}</li>
                  <li>💰 {job.salary || "Not Defined"}</li>
                </ul>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void runAnalysis()}
                  disabled={aiLoading}
                  aria-busy={aiLoading}
                >
                  {raw.job_relevance_score !== undefined
                    ? `✨ Job Relevance Score: ${raw.job_relevance_score}`
                    : "✨ Job Relevance Score"}
                </button>
                {job?.companyWebsite && (
                  <a
                    href={job.companyWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                  >
                    Visit Company Website
                  </a>
                )}
                {job.applyUrl && (
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                  >
                    Apply Now
                  </a>
                )}
              </div>
            </div>

            <section className={styles.section}>
              <h2>📝 Description</h2>
              <div className={styles.description}>
                {job.description
                  ? renderRichText(truncateWords(job.description, 500))
                  : "Not Defined"}
              </div>
            </section>

            <section className={styles.section}>
              <h2>📌 All Details</h2>
              <ul className={styles.detailsList}>
                {Object.entries(raw)
                  .filter(([key]) => !hiddenKeys.has(key))
                  .map(([key, value]) => {
                  const rendered = renderValue(value, key);
                  const isCode = typeof value === "object" && value !== null;
                  return (
                    <li key={key} className={styles.detailItem}>
                      <span className={styles.detailKey}>{formatKey(key)}</span>
                      <span className={styles.detailValue}>
                        {isCode ? (
                          <pre className={styles.detailCode}>{rendered}</pre>
                        ) : (
                          typeof rendered === "string" ? renderTextWithBreaks(rendered) : rendered
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={styles.section} ref={aiSectionRef}>
              <div className={styles.aiHeader}>
                <h2>🧭 Job Relevancy Analysis</h2>
                <span className={styles.aiHeaderHint}>
                  AI-powered match score & insights
                </span>
              </div>

              {aiLoading ? (
                <div className={styles.aiLoading}>
                  <span className={styles.spinner} aria-hidden="true" />
                  <div>
                    <p className={styles.aiLoadingTitle}>Analyzing relevance...</p>
                    <p className={styles.aiLoadingSub}>
                      Comparing your profile with the job requirements.
                    </p>
                  </div>
                </div>
              ) : aiError ? (
                <p className={styles.status}>AI Error: {aiError}</p>
              ) : aiResult ? (
                <div className={styles.aiCard}>
                  <div className={styles.aiTopRow}>
                    <div
                      className={styles.scoreRing}
                      style={
                        {
                          "--score":
                            typeof aiResult.relevanceScore === "number"
                              ? Math.max(0, Math.min(100, aiResult.relevanceScore))
                              : 0,
                        } as CSSProperties
                      }
                    >
                      <div className={styles.scoreValue}>
                        {aiResult.relevanceScore ?? "N/A"}
                      </div>
                      <div className={styles.scoreLabel}>Score</div>
                    </div>
                    <div className={styles.aiSummaryWrap}>
                      <div className={styles.aiBadge}>🎯 Relevance Summary</div>
                      <p className={styles.aiSummary}>
                        {aiResult.matchSummary || "No summary available."}
                      </p>
                    </div>
                  </div>

                  <div className={styles.aiGrid}>
                    {aiResult.strengths?.length ? (
                      <div className={styles.aiBlock}>
                        <h3>✅ Strengths</h3>
                        <ul className={styles.aiList}>
                          {aiResult.strengths.map((item, index) => (
                            <li key={`strength-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {aiResult.gaps?.length ? (
                      <div className={styles.aiBlock}>
                        <h3>⚠️ Gaps</h3>
                        <ul className={styles.aiList}>
                          {aiResult.gaps.map((item, index) => (
                            <li key={`gap-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {aiResult.improvements?.length ? (
                      <div className={styles.aiBlock}>
                        <h3>🛠️ Improvements</h3>
                        <ul className={styles.aiList}>
                          {aiResult.improvements.map((item, index) => (
                            <li key={`improve-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {aiResult.suggestions?.length ? (
                      <div className={styles.aiBlock}>
                        <h3>💡 Suggestions</h3>
                        <ul className={styles.aiList}>
                          {aiResult.suggestions.map((item, index) => (
                            <li key={`suggest-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className={styles.status}>
                  Add your skills and summary in your profile to generate a relevancy score.
                </p>
              )}
              {aiRaw ? <pre className={styles.aiRaw}>{aiRaw}</pre> : null}
            </section>
          </div>
        ) : (
          <p className={styles.status}>No job details available.</p>
        )}
      </div>
    </Layout>
  );
}

