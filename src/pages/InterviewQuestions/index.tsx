import { useEffect, useState } from "react";
import Layout from "@/components/Layout/Layout";
import styles from "./InterviewQuestions.module.css";
import headerStyles from "../Projects/AddProject.module.css";
import questionsData from "@/utils/interviewQuestions.json";
import confetti from "canvas-confetti";
import {
  createRecordFromSchema,
  loadSchemaRecords,
  saveSchemaRecords,
  syncRecordWithSchema,
} from "@/utils/schemaUtils";
import { interviewAttemptSchema } from "@/utils/formSchemas";

type Question = {
  type: "mcq" | "text" | "short";
  category: string;
  question: string;
  answer: string;
  options?: string[];
};
type QuestionsData = Record<string, Question[]>;

const typedQuestionsData = questionsData as QuestionsData;

export default function InterviewQuestions() {
  type CategoryType = keyof typeof questionsData;
  const initialAttempt = createRecordFromSchema(interviewAttemptSchema);
  const [category, setCategory] = useState<CategoryType | "all">(
    initialAttempt.category as CategoryType | "all"
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>(
    initialAttempt.answers
  );
  const [score, setScore] = useState<number | null>(initialAttempt.score);
  const [username, setUsername] = useState<string>(
    (initialAttempt.username as string) || ""
  );

  useEffect(() => {
    const all = Object.values(typedQuestionsData).flat();
    setQuestions(
      category === "all" ? all : typedQuestionsData[category] || []
    );
    setScore(null);
    setAnswers({});
  }, [category]);

  const handleAnswer = (i: number, v: string) =>
    setAnswers({ ...answers, [i]: v });

  const allAnswered =
    questions.length > 0 &&
    questions.every((_, i) => answers[i] && answers[i].trim() !== "");

  const handleSubmit = () => {
    let correct = 0;
    questions.forEach(
      (q, i) =>
        answers[i]?.trim().toLowerCase() ===
        q.answer.trim().toLowerCase() && correct++
    );
    setScore(correct);
    const percentValue =
      questions.length > 0
        ? Math.round((correct / questions.length) * 100)
        : 0;
    const attempt = syncRecordWithSchema(interviewAttemptSchema, {
      username,
      category,
      answers,
      score: correct,
      total: questions.length,
      percent: percentValue,
      createdAt: new Date().toISOString(),
    });
    const existing = loadSchemaRecords(interviewAttemptSchema, []);
    saveSchemaRecords(interviewAttemptSchema, [attempt, ...existing]);
    if (correct / questions.length >= 0.8)
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  };

  const handleReset = () => {
    const resetState = createRecordFromSchema(interviewAttemptSchema);
    setScore(resetState.score);
    setAnswers(resetState.answers);
  };

  const percent = score !== null ? Math.round((score / questions.length) * 100) : 0;
  const isHighScore = percent >= 80;

  return (
    <Layout>
      <section className={headerStyles.header}>
        <div>
          <h2 className={headerStyles.title}>Practice interview questions</h2>
          <p className={headerStyles.subtitle}>
            Choose a track, answer questions, and track your performance over time.
          </p>
        </div>
      </section>

      <form className="form-group">
        <label htmlFor="usernameInput">Your Name:</label>
        <input
          id="usernameInput"
          className="form-control"
          placeholder="Enter your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="categorySelect">Filter by Category:</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryType | 'all')}
          className="form-control"
        >
          <option value="fullstack">Fullstack</option>
          <option value="reactfrontend">React & Frontend</option>
          <option value="aimlpython">AI ML Python</option>
          <option value="graphicuiux">Graphic Designing UI UX</option>
          <option value="cybersecurity">Cyber Security</option>
        </select>
      </form>

      {score === null ? (
        <div className={styles.cards}>
          {questions.map((q, i) => (
            <div key={i} className={styles.card}>
              <h4>
                {i + 1}. {q.question}
              </h4>

              {q.type === "mcq" && (
                <div className={styles.options}>
                  {q.options?.map((opt: string, idx: number) => (
                    <label key={idx} className={styles.option}>
                      <input
                        type="radio"
                        name={`q-${i}`}
                        value={opt}
                        checked={answers[i] === opt}
                        onChange={(e) => handleAnswer(i, e.target.value)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === "text" && (
                <input
                  className="form-control"
                  placeholder="Your answer"
                  value={answers[i] || ""}
                  onChange={(e) => handleAnswer(i, e.target.value)}
                />
              )}

              {q.type === "short" && (
                <textarea
                  className={styles.textArea}
                  placeholder="Write a short answer"
                  value={answers[i] || ""}
                  onChange={(e) => handleAnswer(i, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={`${styles.result} ${isHighScore ? styles.goldBorder : styles.redBorder}`}>
          {/* Animated Background Particles */}
          <div className={styles.particles}>
            <span className={styles.particle}></span>
            <span className={styles.particle}></span>
            <span className={styles.particle}></span>
          </div>

          {/* Score Circle */}
          <div className={styles.scoreCircle}>
            <svg className={styles.progressRing} width="160" height="160">
              <circle
                className={styles.progressRingBg}
                cx="80"
                cy="80"
                r="70"
              />
              <circle
                className={styles.progressRingFill}
                cx="80"
                cy="80"
                r="70"
                style={{
                  strokeDasharray: `${2 * Math.PI * 70}`,
                  strokeDashoffset: `${2 * Math.PI * 70 * (1 - percent / 100)}`
                }}
              />
            </svg>
            <div className={styles.scoreText}>
              <div className={styles.percentBig}>{percent}%</div>
              <div className={styles.scoreLabel}>Total Score</div>
            </div>
          </div>

          {/* Title */}
          <h3 className={styles.title}>
            <span className={styles.medal}>
              {isHighScore ? "ðŸ†" : percent >= 50 ? "ðŸŽ¯" : "ðŸ’ª"}
            </span>
            {username || "Candidate"}&apos;s Score Card
          </h3>

          {/* Stats Cards */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>âœ…</div>
              <div className={styles.statValue}>{score}</div>
              <div className={styles.statLabel}>Correct</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>ðŸ“</div>
              <div className={styles.statValue}>{questions.length}</div>
              <div className={styles.statLabel}>Total</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>âŒ</div>
              <div className={styles.statValue}>{questions.length - score}</div>
              <div className={styles.statLabel}>Wrong</div>
            </div>
          </div>

          {/* Achievement Badge */}
          <div className={`${styles.badge} ${percent < 50 ? styles.badgeRed : percent < 80 ? styles.badgeSilver : styles.badgeGold}`}>
            <div className={styles.badgeGlow}></div>
            <span className={styles.badgeIcon}>
              {isHighScore ? "ðŸŒŸ" : percent >= 50 ? "ðŸ¥ˆ" : "ðŸ’ª"}
            </span>
            <span className={styles.badgeText}>
              {isHighScore ? "Gold Achiever" : percent >= 50 ? "Silver Learner" : "Keep Practicing!"}
            </span>
          </div>

          {/* Motivational Message */}
          <p className={styles.message}>
            {isHighScore
              ? "Outstanding performance! You're a star! ðŸŒŸ"
              : percent >= 50
                ? "Great effort! You're on the right track! ðŸš€"
                : "Don't give up! Practice makes perfect! ðŸ’¯"}
          </p>

          {/* Action Button */}
          <button onClick={handleReset} className={styles.actionButton}>
            <span>Try Again</span>
            <div className={styles.buttonShine}></div>
          </button>
        </div>
      )}

      {score === null && (
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!allAnswered}
          style={{
            opacity: allAnswered ? 1 : 0.6,
            cursor: allAnswered ? "pointer" : "not-allowed"
          }}
          title={allAnswered ? "Submit answers" : "Please answer all questions"}
        >
          ðŸš€ Submit Answers
        </button>
      )}
    </Layout>
  );
}

