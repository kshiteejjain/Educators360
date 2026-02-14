import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout/Layout";
import { useLoader } from "@/components/Loader/LoaderProvider";
import styles from "./Assessment.module.css";
import assessmentCards from "@/utils/assessmentCards.json";

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

const DEFAULT_CV_TEXT = "Not provided.";
const DEFAULT_TARGET_ROLE = "Senior Secondary Coordinator";
const STORAGE_PREFIX = "assessment:questions:";
const REPORT_PREFIX = "assessment:report:";

const normalizeLine = (line: string) => line.replace(/\s+/g, " ").trim();

const parseQuestions = (content: string): ParsedQuestion[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

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
    const qMatch = line.match(/^(?:\*\*)?\s*(\d{1,2})[\.)-]\s*(.+)$/i);
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
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index) });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
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

const renderScoreRow = (label: string, score: number, note?: string) => {
  const safeScore = Math.max(0, Math.min(10, score));
  const filled = Math.round(safeScore / 2);
  const stars = Array.from({ length: 5 }, (_, idx) => (idx < filled ? "★" : "☆"));
  return (
    <div className={styles.scoreRow} key={`score-${label}`}>
      <div className={styles.scoreHeader}>
        <div className={styles.scoreLabel}>{renderInline(label)}</div>
        <div className={styles.scoreValue}>{safeScore}/10</div>
      </div>
      <div className={styles.scoreBar}>
        <div className={styles.scoreFill} style={{ width: `${safeScore * 10}%` }} />
      </div>
      <div className={styles.scoreStars} aria-hidden="true">
        {stars.join(" ")}
      </div>
      {note ? <p className={styles.scoreNote}>{renderInline(note)}</p> : null}
    </div>
  );
};

const renderReport = (text: string) => {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let pendingScoreLabel: string | null = null;
  let pendingScoreValue: number | null = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      nodes.push(<div key={`space-${index}`} className={styles.reportSpacer} />);
      return;
    }

    const headingMatch = trimmed.match(/^(#+)\s*(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      if (level === 1) {
        nodes.push(
          <h2 key={`h2-${index}`} className={styles.reportH2}>
            {renderInline(title)}
          </h2>
        );
        return;
      }
      if (level === 2) {
        nodes.push(
          <h3 key={`h3-${index}`} className={styles.reportH3}>
            {renderInline(title)}
          </h3>
        );
        return;
      }
      nodes.push(
        <h4 key={`h4-${index}`} className={styles.reportH4}>
          {renderInline(title)}
        </h4>
      );
      return;
    }

    const scoreMatch = trimmed.match(
      /^\*\*(.+?)\*\*\s*[:\-]?\s*(\d{1,2})\s*\/\s*10\s*(.*)$/
    );
    if (scoreMatch) {
      const label = scoreMatch[1].trim();
      const score = Number(scoreMatch[2]);
      const note = scoreMatch[3]?.trim();
      nodes.push(renderScoreRow(label, score, note));
      pendingScoreLabel = null;
      pendingScoreValue = null;
      return;
    }

    const inlineScoreMatch = trimmed.match(/^(.+?)\s*[:\-]\s*(\d{1,2})\s*\/\s*10\s*$/);
    if (inlineScoreMatch) {
      pendingScoreLabel = inlineScoreMatch[1].trim().replace(/^\*\*|\*\*$/g, "");
      pendingScoreValue = Number(inlineScoreMatch[2]);
      return;
    }

    if (pendingScoreLabel && pendingScoreValue !== null) {
      nodes.push(renderScoreRow(pendingScoreLabel, pendingScoreValue, trimmed));
      pendingScoreLabel = null;
      pendingScoreValue = null;
      return;
    }

    if (trimmed.startsWith("- ")) {
      nodes.push(
        <p key={`bullet-${index}`} className={styles.reportBullet}>
          • {renderInline(trimmed.slice(2))}
        </p>
      );
      return;
    }

    const numberMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberMatch) {
      nodes.push(
        <p key={`num-${index}`} className={styles.reportBullet}>
          {numberMatch[1]}. {renderInline(numberMatch[2])}
        </p>
      );
      return;
    }

    nodes.push(
      <p key={`p-${index}`} className={styles.reportParagraph}>
        {renderInline(trimmed)}
      </p>
    );
  });

  return nodes;
};

export default function Assessment() {
  const { withLoader } = useLoader();
  const [view, setView] = useState<ViewMode>("cards");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [report, setReport] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

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
  const allAnswered =
    questions.length > 0 &&
    questions.every((item) => (answers[item.id] || "").trim().length > 0);

  const handleStart = async (cardId: string) => {
    setError("");
    setResult("");
    setReport("");
    setAnswers({});
    setActiveCardId(cardId);
    setView("questions");

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
          cvText: DEFAULT_CV_TEXT,
          targetRole: DEFAULT_TARGET_ROLE,
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
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCardId) return;

    if (!allAnswered) {
      setError("Please answer every question before generating the report.");
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
          targetRole: DEFAULT_TARGET_ROLE,
          cvText: DEFAULT_CV_TEXT,
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

            {error && <div className={styles.error}>{error}</div>}

            <form className={styles.questionsList} onSubmit={handleSubmit}>
              {questions.map((item, index) => (
                <div key={item.id} className={styles.questionCard}>
                  <div className={styles.questionMeta}>Question {index + 1}</div>
                  <p className={styles.questionText}>{renderInline(item.question)}</p>
                  {item.why && (
                    <p className={styles.questionWhy}>
                      <strong>Why this matters:</strong> {renderInline(item.why)}
                    </p>
                  )}
                  <textarea
                    className={styles.answerInput}
                    rows={4}
                    placeholder="Write your response here..."
                    value={answers[item.id] || ""}
                    onChange={(event) => handleAnswerChange(item.id, event.target.value)}
                    required
                  />
                </div>
              ))}

              <div className={styles.submitRow}>
                <button type="submit" className="btn-primary" disabled={!allAnswered}>
                  Submit
                </button>
              </div>
            </form>
          </div>
        )}

        {view === "report" && (
          <div className={styles.reportSection}>
            <div className={styles.questionsHeader}>
              <h2 className={styles.questionsTitle}>📘 Professional Growth Report</h2>
              <button type="button" className={styles.backButton} onClick={handleBackToCards}>
                Back to cards
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.reportBody}>{renderReport(report)}</div>
          </div>
        )}
      </section>
    </Layout>
  );
}
