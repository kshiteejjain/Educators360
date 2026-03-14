import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/Layout/Layout";
import { useLoader } from "@/components/Loader/LoaderProvider";
import styles from "./Assessment.module.css";
import assessmentCards from "@/utils/assessmentCards.json";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
  Legend,
  type ChartConfiguration,
  type ChartData,
} from "chart.js";

type AssessmentCard = {
  id: string;
  title: string;
  description: string;
};

type AssessmentResponse = {
  content?: string;
  message?: string;
};

type ReportResponse = {
  report?: string;
  message?: string;
};

type ParsedQuestion = {
  id: string;
  question: string;
  why: string;
};

type ViewMode = "cards" | "questions" | "report";

const STORAGE_PREFIX = "assessment:questions:";
const REPORT_PREFIX = "assessment:report:";
const JOB_PREFIX_KEY = "upeducateJobPrefix";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const normalizeLine = (line: string) => line.replace(/\s+/g, " ").trim();

const parseQuestions = (content: string): ParsedQuestion[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^-{3,}$/.test(line));

  const items: ParsedQuestion[] = [];
  let current: { question: string; why: string } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const question = normalizeLine(current.question);
    const why = normalizeLine(current.why);
    if (question) {
      items.push({
        id: `q-${items.length + 1}`,
        question,
        why,
      });
    }
    current = null;
  };

  lines.forEach((line) => {
    const qMatch =
      line.match(/^(?:\*\*)?\s*(\d{1,2})[\.)-]\s*(.+)$/i) ||
      line.match(/^(?:\*\*)?\s*(?:question|q)\s*(\d{1,2})\s*[:\.)-]\s*(.+)$/i);
    const whyMatch = line.match(/^(?:\*\*)?(?:why this matters)\s*[:\-]?\s*(.+)$/i);

    if (qMatch) {
      pushCurrent();
      current = { question: qMatch[2], why: "" };
      return;
    }

    if (whyMatch && current) {
      current.why = whyMatch[1];
      return;
    }

    if (current) {
      if (line.toLowerCase().startsWith("why this matters")) {
        current.why = line.replace(/^(?:\*\*)?why this matters\s*[:\-]?\s*/i, "");
      } else if (!current.why) {
        current.question = `${current.question} ${line}`;
      } else {
        current.why = `${current.why} ${line}`;
      }
    }
  });

  pushCurrent();
  return items;
};

const getSessionKey = (cardId: string) => `${STORAGE_PREFIX}${cardId}`;
const getReportKey = (cardId: string) => `${REPORT_PREFIX}${cardId}`;

const readStoredProfile = () => {
  if (typeof window === "undefined") {
    return { targetRole: "", cvText: "" };
  }
  try {
    const raw = window.localStorage.getItem(JOB_PREFIX_KEY);
    if (!raw) return { targetRole: "", cvText: "" };
    const data = JSON.parse(raw) as {
      targetRole?: string;
      resume?: { data?: { summary?: string } };
    };
    const targetRole = (data?.targetRole ?? "").trim();
    const cvText = (data?.resume?.data?.summary ?? "").trim();
    return { targetRole, cvText };
  } catch (error) {
    console.warn("Failed to read stored profile", error);
    return { targetRole: "", cvText: "" };
  }
};

const buildPairedResponses = (
  questions: ParsedQuestion[],
  answers: Record<string, string>
) =>
  questions
    .map((item, index) => {
      const answer = answers[item.id]?.trim() || "(No response)";
      return [
        `Question ${index + 1}: ${item.question}`,
        `Answer ${index + 1}: ${answer}`,
      ].join("\n");
    })
    .join("\n\n");

const formatInline = (value: string) => {
  const parts: Array<{ text: string; bold?: boolean }> = [];
  const regex = /(\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index) });
    }
    const token = match[0];
    parts.push({ text: token.slice(2, -2), bold: true });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex) });
  }
  return parts;
};

const renderInline = (value: string) =>
  formatInline(value).map((part, index) =>
    part.bold ? (
      <strong key={`b-${index}`}>{part.text}</strong>
    ) : (
      <span key={`t-${index}`}>{part.text}</span>
    )
  );

const renderRichText = (value: string) => {
  const normalizedValue = value.replace(/([^\n])\s*(#{1,6}\s+)/g, "$1\n$2");
  const lines = normalizedValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const sanitizeLine = (line: string) => {
    let next = line;
    next = next.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2");
    const boldCount = (next.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      next = next.replace(/\*\*/g, "");
    }
    return next;
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className={styles.richList}>
        {listItems}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmedLine = sanitizeLine(line.replace(/^\*\s+/, "").trim());
    const headingMatch = trimmedLine.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      flushList();
      blocks.push(
        <h4 key={`h-${index}`} className={styles.richHeading}>
          {renderInline(headingMatch[1])}
        </h4>
      );
      return;
    }

    const bulletMatch = trimmedLine.match(/^-+\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(
        <li key={`li-${index}`} className={styles.richListItem}>
          {renderInline(bulletMatch[1])}
        </li>
      );
      return;
    }

    flushList();
    blocks.push(
      <p key={`p-${index}`} className={styles.richParagraph}>
        {renderInline(trimmedLine)}
      </p>
    );
  });

  flushList();
  return blocks;
};

type ScorecardChartProps = {
  labels: string[];
  values: number[];
};

const ScorecardChart = ({ labels, values }: ScorecardChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<"bar"> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const data: ChartData<"bar"> = {
      labels,
      datasets: [
        {
          label: "Score",
          data: values,
          backgroundColor: ["#6366f1"],
          hoverBackgroundColor: ["#4f46e5"],
          borderRadius: 10,
          borderSkipped: false,
          barThickness: 36,
        },
      ],
    };

    const config: ChartConfiguration<"bar"> = {
      type: "bar",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "x",
        scales: {
          x: {
            type: "category",
            ticks: {
              color: "#0f172a",
              maxRotation: 0,
              minRotation: 0,
            },
            grid: {
              display: false,
            },
          },
          y: {
            type: "linear",
            position: "left",
            min: 0,
            max: 10,
            ticks: {
              stepSize: 1,
              color: "#64748b",
            },
            grid: {
              color: "rgba(148, 163, 184, 0.2)",
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => chartRef.current?.destroy();
  }, [labels.join("|"), values.join("|")]);

  return (
    <div className={styles.scoreChartWrapper}>
      <canvas ref={canvasRef} className={styles.scoreChartCanvas} />
    </div>
  );
};

type ReportSection = {
  title: string;
  lines: string[];
};

const extractScoreLines = (lines: string[]) =>
  lines
    .map((line) => line.replace(/^[-•–—▸]\s*/, ""))
    .map((line) => {
      const normalized = line.trim();
      if (/^#+\s+/.test(normalized)) return null;
      if (/^\|?\s*competency\s*\|\s*score\s*\|?/i.test(normalized)) {
        return null;
      }
      if (/^\|?\s*[-:]+\s*\|\s*[-:]+\s*\|?\s*$/.test(normalized)) {
        return null;
      }
      const cleaned = normalized.replace(/\*\*/g, "");
      const tableMatch = cleaned.match(
        /^\|?\s*([^|]+?)\s*\|\s*(\d{1,2})\s*\|?\s*$/
      );
      if (tableMatch) {
        return { label: tableMatch[1].trim(), score: Number(tableMatch[2]) };
      }
      const match = cleaned.match(/^(.+?)\s*:\s*(\d{1,2})\s*$/);
      if (!match) return null;
      return { label: match[1].trim(), score: Number(match[2]) };
    })
    .filter(Boolean) as Array<{ label: string; score: number }>;

const parseReportSections = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  let title = "";
  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;
  const stripHeadingPrefix = (value: string) =>
    value.replace(/^#+\s*/, "").replace(/^\d+\.\s+/, "").trim();

  const flush = () => {
    if (!current) return;
    const cleaned = current.lines.filter(Boolean);
    if (cleaned.length > 0) {
      sections.push({ title: current.title, lines: cleaned });
    }
    current = null;
  };

  for (const line of lines) {
    if (!line) continue;
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    const conclusionMatch = line.match(/^conclusion$/i);
    if (!title) {
      if (headingMatch) {
        title = stripHeadingPrefix(headingMatch[2]);
      } else {
        title = stripHeadingPrefix(line);
      }
      continue;
    }
    if (headingMatch || numberedMatch || conclusionMatch) {
      flush();
      current = {
        title: conclusionMatch
          ? "Conclusion"
          : stripHeadingPrefix(headingMatch ? headingMatch[2] : numberedMatch?.[1] || line),
        lines: [],
      };
      continue;
    }
    if (!current) {
      current = { title: "Overview", lines: [] };
    }
    current.lines.push(line);
  }

  flush();
  return { title, sections };
};

const getSectionIcon = (title: string) => {
  const key = title.toLowerCase();
  if (key.includes("identity") || key.includes("persona")) return "🧭";
  if (key.includes("scorecard")) return "📊";
  if (key.includes("strength") || key.includes("superpower")) return "💪";
  if (key.includes("growth") || key.includes("gap")) return "🧩";
  if (key.includes("strategy")) return "🗺️";
  if (key.includes("action") || key.includes("roadmap")) return "🛠️";
  if (key.includes("conclusion")) return "✅";
  return "📝";
};

const renderReport = (text: string) => {
  const parsed = parseReportSections(text);
  if (!parsed.sections.length) return null;

  const renderReportLine = (line: string, key: string) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      return (
        <h4 key={key} className={styles.reportH4}>
          {renderInline(headingMatch[1])}
        </h4>
      );
    }

    return (
      <p key={key} className={styles.reportParagraph}>
        {renderInline(trimmed.replace(/^[-â€¢]\s*/, ""))}
      </p>
    );
  };

  return (
    <div className={styles.reportLayout}>
      <div className={styles.reportHero}>
        <div className={styles.reportHeroHeader}>
          <span className={styles.reportHeroIcon} aria-hidden="true">
            📘
          </span>
          <div>
            <h2 className={styles.reportH2}>{renderInline(parsed.title || "Report")}</h2>
            <p className={styles.reportParagraph}>
              A structured snapshot of strengths, growth areas, and next steps.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.reportGrid}>
        {parsed.sections.map((section, index) => {
          const scoreLines = extractScoreLines(section.lines);
          const isScorecard =
            section.title.toLowerCase().includes("scorecard") || scoreLines.length > 0;
          if (isScorecard) {
            const labels = scoreLines.map((item) => item.label);
            const values = scoreLines.map((item) => item.score);
            const scorecardBullets = section.lines.filter((line) => /^[-•]\s+/.test(line));
            const scorecardParagraphs = section.lines.filter((line) => !/^[-•]\s+/.test(line));

            return (
              <div key={`section-${index}`} className={styles.reportCard}>
                <div className={styles.reportCardHeader}>
                  <span className={styles.reportTag}>
                    <span aria-hidden="true">📊</span> Scorecard
                  </span>
                  <h3 className={styles.reportCardTitle}>{renderInline(section.title)}</h3>
                </div>
                {scoreLines.length > 0 ? (
                  <ScorecardChart labels={labels} values={values} />
                ) : (
                  <p className={styles.reportParagraph}>No score data available.</p>
                )}
                {scorecardParagraphs.map((line, pIndex) =>
                  renderReportLine(line, `p-score-${index}-${pIndex}`)
                )}
                {scorecardBullets.length > 0 && (
                  <ul className={styles.reportList}>
                    {scorecardBullets.map((line, bIndex) => (
                      <li key={`b-score-${index}-${bIndex}`} className={styles.reportListItem}>
                        <span className={styles.reportBulletIcon} aria-hidden="true">
                          ▸
                        </span>
                        {renderInline(line.replace(/^[-•]\s*/, ""))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }

          const bullets = section.lines.filter((line) => /^[-•]\s+/.test(line));
          const paragraphs = section.lines.filter((line) => !/^[-•]\s+/.test(line));

          return (
            <div key={`section-${index}`} className={styles.reportCard}>
              <div className={styles.reportCardHeader}>
                <span className={styles.reportTag}>
                  <span aria-hidden="true">{getSectionIcon(section.title)}</span> Section{" "}
                  {index + 1}
                </span>
                <h3 className={styles.reportCardTitle}>
                  <span className={styles.reportTitleIcon} aria-hidden="true">
                    {getSectionIcon(section.title)}
                  </span>
                  {renderInline(section.title)}
                </h3>
              </div>
              {paragraphs.map((line, pIndex) =>
                renderReportLine(line, `p-${index}-${pIndex}`)
              )}
              {bullets.length > 0 && (
                <ul className={styles.reportList}>
                  {bullets.map((line, bIndex) => (
                    <li key={`b-${index}-${bIndex}`} className={styles.reportListItem}>
                      <span className={styles.reportBulletIcon} aria-hidden="true">
                        ▸
                      </span>
                      {renderInline(line.replace(/^[-•]\s*/, ""))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const inlineToHtml = (value: string) =>
  value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const buildReportHtml = (text: string) => {
  const parsed = parseReportSections(text);
  if (!parsed.sections.length) return "";

  const renderLine = (line: string) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      return `<h4>${inlineToHtml(headingMatch[1])}</h4>`;
    }
    return `<p>${inlineToHtml(trimmed.replace(/^[-•]\s*/, ""))}</p>`;
  };

  const sectionsHtml = parsed.sections
    .map((section) => {
      const scoreLines = extractScoreLines(section.lines);
      const isScorecard =
        section.title.toLowerCase().includes("scorecard") || scoreLines.length > 0;
      const bullets = section.lines.filter((line) => /^[-•]\s+/.test(line));
      const paragraphs = section.lines.filter((line) => !/^[-•]\s+/.test(line));

      const scoreTable =
        isScorecard && scoreLines.length > 0
          ? `<table>
              <thead>
                <tr><th>Competency</th><th>Score</th></tr>
              </thead>
              <tbody>
                ${scoreLines
                  .map(
                    (item) =>
                      `<tr><td>${inlineToHtml(item.label)}</td><td>${item.score}</td></tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : "";

      const bulletsHtml =
        bullets.length > 0
          ? `<ul>${bullets
              .map((line) => `<li>${inlineToHtml(line.replace(/^[-•]\s*/, ""))}</li>`)
              .join("")}</ul>`
          : "";

      const paragraphsHtml = paragraphs.map(renderLine).join("");

      return `
        <section>
          <h2>${inlineToHtml(section.title)}</h2>
          ${scoreTable}
          ${paragraphsHtml}
          ${bulletsHtml}
        </section>
      `;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; line-height: 1.6; }
          h1 { font-size: 22px; margin: 0 0 12px; }
          h2 { font-size: 18px; margin: 16px 0 8px; }
          h4 { font-size: 14px; margin: 12px 0 6px; }
          p { margin: 0 0 8px; }
          ul { margin: 0 0 10px 16px; padding: 0; }
          li { margin: 0 0 6px; }
          table { border-collapse: collapse; width: 100%; margin: 10px 0; }
          th, td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
          th { background: #eef2ff; }
        </style>
      </head>
      <body>
        <h1>${inlineToHtml(parsed.title || "Professional Growth Report")}</h1>
        ${sectionsHtml}
      </body>
    </html>
  `;
};

export default function Assessment() {
  const { withLoader } = useLoader();
  const [view, setView] = useState<ViewMode>("cards");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [report, setReport] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const recordingQuestionIdRef = useRef<string | null>(null);
  const pendingRecordingStartRef = useRef<string | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    const resetSilenceTimer = () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      silenceTimeoutRef.current = window.setTimeout(() => {
        if (!recordingQuestionIdRef.current) return;
        recognition.stop();
      }, 5000); // 8 seconds of silence
    };

    recognition.onresult = (event: any) => {
      resetSilenceTimer();
      const questionId = recordingQuestionIdRef.current;
      if (!questionId) return;

      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript || "";
        }
      }

      if (!finalTranscript) return;

      setAnswers((prev) => {
        const prevValue = prev[questionId] || "";
        const separator = prevValue && !prevValue.endsWith(" ") ? " " : "";
        return {
          ...prev,
          [questionId]: prevValue + separator + finalTranscript.trim(),
        };
      });
    };

    recognition.onerror = (event: any) => {
      setSpeechError(
        event?.error
          ? `Speech recognition error: ${event.error}`
          : "Speech recognition failed."
      );
      setRecordingQuestionId(null);
      recordingQuestionIdRef.current = null;
    };

    recognition.onend = () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      const nextId = pendingRecordingStartRef.current;
      pendingRecordingStartRef.current = null;
      if (nextId) {
        recordingQuestionIdRef.current = nextId;
        setRecordingQuestionId(nextId);
        try {
          recognition.start();
          resetSilenceTimer();
        } catch (err) {
          setSpeechError("Unable to start speech recording.");
        }
        return;
      }
      setRecordingQuestionId(null);
      recordingQuestionIdRef.current = null;
    };

    recognitionRef.current = recognition;

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const toggleRecordingForQuestion = (questionId: string) => {
    if (!recognitionRef.current) return;

    setSpeechError("");

    if (recordingQuestionIdRef.current === questionId) {
      recognitionRef.current.stop();
      return;
    }

    if (recordingQuestionIdRef.current) {
      pendingRecordingStartRef.current = questionId;
      recognitionRef.current.stop();
      return;
    }

    recordingQuestionIdRef.current = questionId;
    setRecordingQuestionId(questionId);
    try {
      recognitionRef.current.start();
      // stop if user goes quiet for >8s
      if (typeof window !== "undefined") {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = window.setTimeout(() => {
          recognitionRef.current?.stop();
        }, 8000);
      }
    } catch (err) {
      setSpeechError("Unable to start speech recording.");
    }
  };

  useEffect(() => {
    if (!activeCardId || view !== "questions") return;
    const stored = sessionStorage.getItem(getSessionKey(activeCardId));
    if (stored) {
      setResult(stored);
    }
  }, [activeCardId, view]);

  useEffect(() => {
    if (!activeCardId || view !== "report") return;
    const stored = sessionStorage.getItem(getReportKey(activeCardId));
    if (stored) {
      setReport(stored);
    }
  }, [activeCardId, view]);

  const questions = useMemo(() => parseQuestions(result), [result]);
  const hasQuestions = questions.length > 0;
  const hasAnyAnswer = questions.some(
    (item) => (answers[item.id] || "").trim().length > 0
  );

  const handleStart = async (cardId: string) => {
    setError("");
    setResult("");
    setReport("");
    setAnswers({});
    setActiveCardId(cardId);
    setView("questions");

    const { targetRole, cvText } = readStoredProfile();
    const missing: string[] = [];
    if (!targetRole) missing.push("target role");
    if (!cvText) missing.push("CV summary");
    if (missing.length > 0) {
      setError(`Missing ${missing.join(" and ")}. Please update your profile first.`);
      return;
    }

    const cached = sessionStorage.getItem(getSessionKey(cardId));
    if (cached) {
      setResult(cached);
      return;
    }

    const run = async () => {
      const response = await fetch("/api/assessmentBuilder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText,
          targetRole,
        }),
      });
      const data = (await response.json()) as AssessmentResponse;
      if (!response.ok) {
        throw new Error(data?.message || "Failed to build assessment.");
      }
      const content = data?.content || "";
      sessionStorage.setItem(getSessionKey(cardId), content);
      setResult(content);
    };

    try {
      await withLoader(run, "Building your assessment...");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build assessment.");
    }
  };

  const handleBackToCards = () => {
    setView("cards");
    setActiveCardId(null);
    setResult("");
    setReport("");
    setError("");
    setAnswers({});
  };

  const handleAnswerChange = (id: string, value: string) => {
    const words = value.trim().split(/\s+/).filter((word) => word.length > 0);
    if (words.length > 150) {
      const limited = words.slice(0, 150).join(" ");
      setAnswers((prev) => ({ ...prev, [id]: limited }));
    } else {
      setAnswers((prev) => ({ ...prev, [id]: value }));
    }
  };

  const downloadReportAsWord = () => {
    const htmlContent = buildReportHtml(report);
    const blob = new Blob([htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assessment-report.doc";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCardId) return;

    // Check if all questions are answered
    const unanswered = questions.filter(
      (item) => !answers[item.id] || answers[item.id].trim().length === 0
    );
    if (unanswered.length > 0) {
      setError(`Please answer all questions. ${unanswered.length} question(s) are empty.`);
      return;
    }

    const { targetRole, cvText } = readStoredProfile();
    const missing: string[] = [];
    if (!targetRole) missing.push("target role");
    if (!cvText) missing.push("CV summary");
    if (missing.length > 0) {
      setError(`Missing ${missing.join(" and ")}. Please update your profile first.`);
      return;
    }

    setError("");
    const pairs = buildPairedResponses(questions, answers);

    const cachedReport = sessionStorage.getItem(getReportKey(activeCardId));
    if (cachedReport) {
      setReport(cachedReport);
      setView("report");
      return;
    }

    const run = async () => {
      const response = await fetch("/api/assessmentReport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole,
          cvText,
          pairedResponses: pairs,
        }),
      });
      const data = (await response.json()) as ReportResponse;
      if (!response.ok) {
        throw new Error(data?.message || "Failed to generate report.");
      }
      const content = data?.report || "";
      sessionStorage.setItem(getReportKey(activeCardId), content);
      setReport(content);
      setView("report");
    };

    try {
      await withLoader(run, "Generating your report...");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    }
  };

  return (
    <Layout>
      <section className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Assessment Center</h1>
          <p className={styles.subtitle}>
            Choose an assessment to evaluate readiness and grow with tailored feedback.
          </p>
        </div>

        {view === "cards" && (
          <div className={styles.grid}>
            {(assessmentCards as AssessmentCard[]).map((card) => (
              <div key={card.id} className={styles.card}>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDescription}>{card.description}</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleStart(card.id)}
                >
                  Start Now
                </button>
              </div>
            ))}
          </div>
        )}

        {view === "questions" && (
          <div className={styles.questionsSection}>
            <div className={styles.questionsHeader}>
              <h2 className={styles.questionsTitle}>🧠 Assessment Questions</h2>
              <button type="button" className={styles.backButton} onClick={handleBackToCards}>
                Back to cards
              </button>
            </div>

            {speechError && (
              <div className={styles.speechError}>{speechError}</div>
            )}
            <form className={styles.questionsList} onSubmit={handleSubmit}>
              {questions.map((item, index) => {
                const isRecording = recordingQuestionId === item.id;
                const wordCount = ((answers[item.id] || "").trim().split(/\s+/).filter(word => word.length > 0).length);
                return (
                  <div key={item.id} className={styles.questionCard}>
                    <div className={styles.questionMeta}>Question {index + 1}</div>
                    <div className={styles.questionText}>{renderRichText(item.question)}</div>
                    {item.why && (
                      <div className={styles.questionWhy}>
                        <strong>Why this matters:</strong> {renderRichText(item.why)}
                      </div>
                    )}
                    <div className={styles.answerInputWrapper}>
                      <textarea
                        className={`${styles.answerInput} ${
                          isRecording ? styles.answerInputRecording : ""
                        }`}
                        rows={4}
                        placeholder="Write your response here..."
                        value={answers[item.id] || ""}
                        onChange={(event) => handleAnswerChange(item.id, event.target.value)}
                      />
                      {speechSupported && (
                        <button
                          type="button"
                          className={`${styles.recordButton} ${
                            isRecording ? styles.recordButtonActive : ""
                          }`}
                          onClick={() => toggleRecordingForQuestion(item.id)}
                          aria-label={isRecording ? "Stop recording" : "Record answer"}
                        >
                          {isRecording ? "Stop recording" : "Record answer"}
                        </button>
                      )}
                    </div>
                    <div className={styles.wordCount}>
                      {wordCount} / 150 words
                    </div>
                    {isRecording && (
                      <div className={styles.speechHint}>Recording… click button again to stop.</div>
                    )}
                  </div>
                );
              })}

              {hasQuestions && (
                <div className={styles.submitRow}>
                  {error && <div className={styles.error}>{error}</div>}
                  <button type="submit" className="btn-primary">
                    Submit
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {view === "report" && (
          <div className={styles.reportSection}>
            <div className={styles.questionsHeader}>
              <h2 className={styles.questionsTitle}>📘 Professional Growth Report</h2>
              <div className={styles.downloadButtons}>
                <button type="button" className={styles.backButton} onClick={downloadReportAsWord}>
                  Download Word
                </button>
                <button type="button" className={styles.backButton} onClick={handleBackToCards}>
                  Back to cards
                </button>
              </div>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.reportBody}>{renderReport(report)}</div>
          </div>
        )}
      </section>
    </Layout>
  );
}
