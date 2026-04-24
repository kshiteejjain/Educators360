import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Chart from "chart.js/auto";
import Layout from "@/components/Layout/Layout";
import Loader from "@/components/Loader/Loader";
import styles from "./AIInterview.module.css";

type ViewMode = "configure" | "interact";

type OpenAIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type InterviewQuestion = {
  id: string;
  prompt: string;
  category: string;
};

type StoredProfile = {
  resume?: Record<string, unknown>;
};

type BrowserWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

type InterviewReport = {
  score: number;
  confidence: string;
  timeTakenSeconds: number | null;
  answeredQuestions: number;
  totalQuestions: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  suggestions?: string[];
  feedback?: string[];
  overallFeedback?: string;
  questionFeedback?: Array<{
    questionId: string;
    question: string;
    feedback: string;
  }>;
};

const SUBJECTIVE_QUESTIONS: InterviewQuestion[] = [
  {
    id: "q-1",
    prompt: "Tell me about yourself and what motivated you to pursue this role.",
    category: "Introduction",
  },
  {
    id: "q-2",
    prompt: "Describe a time you solved a difficult problem. What was your approach?",
    category: "Problem Solving",
  },
  {
    id: "q-3",
    prompt: "How do you prioritize tasks when you have multiple deadlines?",
    category: "Time Management",
  },
  {
    id: "q-4",
    prompt: "Share a situation where you received constructive feedback. How did you respond?",
    category: "Feedback",
  },
  {
    id: "q-5",
    prompt: "Walk me through a project you are proud of and your specific contributions.",
    category: "Experience",
  },
  {
    id: "q-6",
    prompt: "How would you explain a complex concept to someone non-technical?",
    category: "Communication",
  },
  {
    id: "q-7",
    prompt: "Tell me about a time you had to collaborate across teams to get results.",
    category: "Collaboration",
  },
  {
    id: "q-8",
    prompt: "What do you consider your top strengths for this role, and why?",
    category: "Strengths",
  },
  {
    id: "q-9",
    prompt: "What areas are you currently improving, and how are you doing it?",
    category: "Growth Mindset",
  },
  {
    id: "q-10",
    prompt: "Why should we hire you? Summarize your value in one minute.",
    category: "Closing",
  },
];

const MAX_QUESTIONS = SUBJECTIVE_QUESTIONS.length;
const JOB_PREFIX_STORAGE_KEY = "educators360JobPrefix";

export default function AIInterview() {
  const [view, setView] = useState<ViewMode>("configure");
  const [contextPrompt, setContextPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<"chat" | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string>("");
  const [interviewStartedAt, setInterviewStartedAt] = useState<number | null>(null);
  const [interviewCompletedAt, setInterviewCompletedAt] = useState<number | null>(null);
  const [interviewReport, setInterviewReport] = useState<InterviewReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resumeData, setResumeData] = useState<Record<string, unknown> | null>(null);
  const [resumePayload, setResumePayload] = useState<Record<string, unknown> | null>(null);
  const [resumeStatus, setResumeStatus] = useState<"checking" | "present" | "missing">(
    "checking"
  );
  const [readAloudSupported, setReadAloudSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoReadAloud, setAutoReadAloud] = useState(true);
  const scoreChartRef = useRef<Chart<"doughnut", number[], string> | null>(null);
  const completionChartRef = useRef<Chart<"doughnut", number[], string> | null>(null);
  const scoreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const completionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingQuestionIdRef = useRef<string | null>(null);
  const pendingRecordingStartRef = useRef<string | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const conversationRef = useRef<OpenAIMessage[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(JOB_PREFIX_STORAGE_KEY);
      if (!raw) {
        setResumeStatus("missing");
        return;
      }
      const parsed = JSON.parse(raw) as StoredProfile;
      const resume =
        parsed?.resume && typeof parsed.resume === "object" ? parsed.resume : null;
      const data =
        resume &&
        typeof (resume as Record<string, unknown>).data === "object" &&
        (resume as Record<string, unknown>).data !== null
          ? ((resume as Record<string, unknown>).data as Record<string, unknown>)
          : null;
      if (!data) {
        setResumeStatus("missing");
        return;
      }
      setResumeData(data);
      setResumePayload({
        ...(resume as Record<string, unknown>),
        data: {
          ...data,
          resumeData: data,
        },
      });
      setResumeStatus("present");
    } catch (error) {
      console.warn("Failed to read local profile from storage", error);
      setResumeStatus("missing");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
    setReadAloudSupported(supported);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const browserWindow = window as BrowserWindow;
    const SpeechRecognitionCtor =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);

    const recognition = new SpeechRecognitionCtor();
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
      }, 5000);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
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
        } catch {
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

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const pickPreferredVoice = useCallback((voices: SpeechSynthesisVoice[]) => {
    if (!voices.length) return null;

    const isFemaleVoice = (voice: SpeechSynthesisVoice) =>
      /(female|woman|zira|susan|samantha|karen|aria|heera|priya|veena|ananya)/i.test(
        `${voice.name} ${voice.voiceURI}`
      );

    const indianFemale = voices.find(
      (voice) => /^(en-IN|hi-IN)$/i.test(voice.lang) && isFemaleVoice(voice)
    );
    if (indianFemale) return indianFemale;

    const anyFemale = voices.find((voice) => isFemaleVoice(voice));
    if (anyFemale) return anyFemale;

    const anyIndian = voices.find((voice) => /^(en-IN|hi-IN)$/i.test(voice.lang));
    if (anyIndian) return anyIndian;

    return voices[0];
  }, []);

  const speakQuestion = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    if (!readAloudSupported || !text.trim()) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.trim());
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = pickPreferredVoice(voices);
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      } else {
        utterance.lang = navigator.language || "en-US";
      }
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setSpeechError("Unable to read aloud this question.");
        utteranceRef.current = null;
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeechError("Unable to read aloud this question.");
      setIsSpeaking(false);
    }
  }, [pickPreferredVoice, readAloudSupported]);

  useEffect(() => {
    if (!interviewReport) return;

    const totalQuestions =
      interviewReport.totalQuestions || questions.length || 10;
    const answered = interviewReport.answeredQuestions || 0;
    const score = Math.max(0, Math.min(10, interviewReport.score || 0));
    const scoreData: number[] = [score, Math.max(0, 10 - score)];
    const completionData: number[] = [
      answered,
      Math.max(0, totalQuestions - answered),
    ];

    if (scoreChartRef.current) {
      scoreChartRef.current.destroy();
      scoreChartRef.current = null;
    }
    if (completionChartRef.current) {
      completionChartRef.current.destroy();
      completionChartRef.current = null;
    }

    const createDoughnutChart = (
      canvas: HTMLCanvasElement,
      labels: string[],
      data: number[],
      backgroundColor: string[]
    ) =>
      new Chart<"doughnut", number[], string>(canvas, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor,
              borderWidth: 0,
            },
          ],
        },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true },
          },
          cutout: "70%",
        },
      });

    if (scoreCanvasRef.current) {
      scoreChartRef.current = createDoughnutChart(
        scoreCanvasRef.current,
        ["Score", "Remaining"],
        scoreData,
        ["#16a34a", "#e2e8f0"]
      );
    }

    if (completionCanvasRef.current) {
      completionChartRef.current = createDoughnutChart(
        completionCanvasRef.current,
        ["Answered", "Remaining"],
        completionData,
        ["#0ea5e9", "#e2e8f0"]
      );
    }

    return () => {
      if (scoreChartRef.current) scoreChartRef.current.destroy();
      if (completionChartRef.current) completionChartRef.current.destroy();
      scoreChartRef.current = null;
      completionChartRef.current = null;
    };
  }, [interviewReport, questions.length]);

  const buildQuestionHistory = () =>
    questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      category: question.category,
      answer: answers[question.id]?.trim() || "",
    }));

  const generateAdaptiveQuestion = async (
    historyOverride?: Array<{
      id: string;
      prompt: string;
      category: string;
      answer: string;
    }>
  ) => {
    const response = await fetch("/api/aiInterviewChat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "adaptive",
        contextPrompt: contextPrompt.trim(),
        resumeData,
        resume: resumePayload,
        questionHistory: historyOverride ?? buildQuestionHistory(),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload?.message || "Failed to generate next question.");
    }

    const data = (await response.json()) as { question?: InterviewQuestion };
    if (!data.question?.prompt) {
      throw new Error("Adaptive question was empty.");
    }

    const fallbackId = `q-${(historyOverride ?? buildQuestionHistory()).length + 1}`;
    return {
      id: data.question.id?.trim() || fallbackId,
      prompt: data.question.prompt.trim(),
      category: data.question.category?.trim() || "Adaptive",
    } satisfies InterviewQuestion;
  };

  const startChatInterview = async () => {
    setErrorMessage(null);
    setInterviewReport(null);
    setInterviewStartedAt(Date.now());
    setInterviewCompletedAt(null);
    setSpeechError("");
    setRecordingQuestionId(null);
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    stopSpeaking();
    setQuestionLoading(true);

    try {
      const firstQuestion = await generateAdaptiveQuestion([]);
      setQuestions([firstQuestion]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate first question.";
      setErrorMessage(message);
      setQuestions([SUBJECTIVE_QUESTIONS[0]]);
    } finally {
      setQuestionLoading(false);
    }
  };

  const updateAnswerText = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const buildConversationFromAnswers = () => {
    const reportInstruction = `You are an interview evaluator. Using the candidate's answers, return a structured report with: score (0-10), confidence level, time taken, answered/total count, completion status, summary, strengths, gaps, recommendations, suggestions, and feedback. Keep feedback specific to each answer and actionable. Return JSON only in the InterviewReport shape.`;

    const answerMessages = questions.flatMap<OpenAIMessage>((question) => {
      const response = answers[question.id]?.trim();
      if (!response) return [];
      return [
        { role: "assistant", content: `Question (${question.category}): ${question.prompt}` },
        { role: "user", content: response },
      ];
    });

    conversationRef.current = [
      { role: "system", content: reportInstruction },
      ...answerMessages,
    ];
  };

  const goToNext = async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    if (!answers[currentQuestion.id]?.trim()) return;

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
      return;
    }

    if (questions.length >= MAX_QUESTIONS || questionLoading) return;

    setQuestionLoading(true);
    setErrorMessage(null);
    try {
      const history = buildQuestionHistory();
      const nextQuestion = await generateAdaptiveQuestion(history);
      const normalizedNext: InterviewQuestion = {
        id: nextQuestion.id,
        prompt: nextQuestion.prompt,
        category: nextQuestion.category,
      };
      setQuestions((prev) => [...prev, normalizedNext]);
      setCurrentIndex((prev) => prev + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate next question.";
      setErrorMessage(message);
      if (questions.length < SUBJECTIVE_QUESTIONS.length) {
        setQuestions((prev) => [...prev, SUBJECTIVE_QUESTIONS[questions.length]]);
        setCurrentIndex((prev) => prev + 1);
      }
    } finally {
      setQuestionLoading(false);
    }
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const submitInterview = () => {
    const completedAt = Date.now();
    setInterviewCompletedAt(completedAt);
    void fetchInterviewReport(completedAt);
  };

  const hasAnswers = () => Object.values(answers).some((answer) => answer.trim());

  const fetchInterviewReport = async (completedAtOverride?: number) => {
    if (!interviewStartedAt) return;
    if (!hasAnswers()) {
      setErrorMessage("Please answer at least one question to complete the interview.");
      return;
    }

    setReportLoading(true);
    setErrorMessage(null);

    try {
      buildConversationFromAnswers();
      const response = await fetch("/api/aiInterviewChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "report",
          contextPrompt,
          resumeData,
          messages: conversationRef.current,
          startedAt: interviewStartedAt,
          completedAt: completedAtOverride ?? interviewCompletedAt ?? Date.now(),
          questions: questions.map((question) => ({
            id: question.id,
            category: question.category,
            prompt: question.prompt,
            answer: answers[question.id]?.trim() || "",
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload?.message || "Failed to reach AI service.");
      }

      const data = (await response.json()) as { report?: InterviewReport | string };
      if (!data.report || typeof data.report === "string") {
        throw new Error("Report was not returned in the expected format.");
      }

      setInterviewReport(data.report);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Report request failed.";
      setErrorMessage(message);
    } finally {
      setReportLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!activeCard) {
      setErrorMessage("Please select an interview mode to continue.");
      return;
    }
    if (resumeStatus !== "present") {
      setErrorMessage("Please upload or create your resume to access this feature.");
      return;
    }
    if (!contextPrompt.trim()) {
      setErrorMessage("Please add interview context before submitting.");
      return;
    }
    setView("interact");
    if (activeCard === "chat") {
      await startChatInterview();
    }
  };

  const handleBack = () => {
    setView("configure");
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setInterviewReport(null);
    setInterviewStartedAt(null);
    setInterviewCompletedAt(null);
    setReportLoading(false);
    setQuestionLoading(false);
    setRecordingQuestionId(null);
    setSpeechError("");
    recordingQuestionIdRef.current = null;
    stopSpeaking();
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  };

  const toggleRecordingForQuestion = (questionId: string) => {
    if (!recognitionRef.current) return;

    setSpeechError("");

    if (recordingQuestionIdRef.current) {
      pendingRecordingStartRef.current = questionId;
      recognitionRef.current.stop();
      return;
    }

    recordingQuestionIdRef.current = questionId;
    setRecordingQuestionId(questionId);
    try {
      recognitionRef.current.start();
      if (typeof window !== "undefined") {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = window.setTimeout(() => {
          recognitionRef.current?.stop();
        }, 5000);
      }
    } catch {
      setSpeechError("Unable to start speech recording.");
    }
  };

  const currentQuestion = questions[currentIndex];
  const isRecording = recordingQuestionId === currentQuestion?.id;
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  useEffect(() => {
    if (!currentQuestion?.prompt) return;
    if (!autoReadAloud || !readAloudSupported) return;
    if (view !== "interact" || activeCard !== "chat") return;
    speakQuestion(currentQuestion.prompt);
  }, [
    activeCard,
    autoReadAloud,
    currentQuestion?.id,
    currentQuestion?.prompt,
    readAloudSupported,
    speakQuestion,
    view,
  ]);

  return (
    <Layout>
      <section className={styles.page}>
        <Loader
          active={questionLoading}
          message="Generating tailored questions from your context..."
        />
        {view === "configure" ? (
          <>
            <div className={styles.headerRow}>
              <div>
                <h2 className={styles.title}>AI Interview</h2>
                <p className={styles.subtitle}>
                  Helps you practice and prepare for interviews by simulating realistic Q&A sessions with an AI coach.
                </p>
              </div>
            </div>
            {resumeStatus === "missing" ? (
              <div className={styles.pageAlert}>
                <div className={styles.pageAlertTitle}>Resume required</div>
                <div className={styles.pageAlertBody}>
                  Please create or upload your resume before starting the AI interview.{" "}
                  <Link href="/ResumeBuilder">Go to Resume Builder</Link>.
                </div>
              </div>
            ) : null}

            <div className={styles.inputCards}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveCard("chat");
                  if (errorMessage) setErrorMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveCard("chat");
                    if (errorMessage) setErrorMessage(null);
                  }
                }}
                className={`${styles.inputCard} ${activeCard === "chat" ? styles.cardActive : styles.cardInactive
                  }`}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3>💬 Begin Interview</h3>
                    <p>
                      Run a realistic, text-based interview with your AI coach.
                      Perfect for practicing structure, clarity, and confidence before
                      the real thing.
                    </p>
                    <ul>
                      <li>Structured questions with instant AI feedback</li>
                      <li>Guided follow-ups tailored to your role</li>
                      <li>STAR-style coaching with clear strengths and gaps</li>
                    </ul>
                  </div>
                  <span className={styles.cardBadge}>AI Coach</span>
                </div>
                <button type="button" className={`btn-primary ${styles.cardButton}`}>
                  Start AI Interview
                </button>
              </div>
            </div>

            {activeCard ? (
              <form className={styles.card} onSubmit={handleSubmit}>
                <div>
                  <div className="form-group">
                    <label htmlFor="contextPrompt">
                      Add Detailed Prompt for Interview Context (Example - Interviewer profile,
                      job description)
                    </label>
                    <textarea
                      id="contextPrompt"
                      className="form-control"
                      value={contextPrompt}
                      onChange={(e) => {
                        setContextPrompt(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="I am Math teacher"
                    />
                  </div>
                </div>

                <div className={styles.submitRow}>
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Submit
                  </button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <>
            <div className={styles.headerRow}>
              <div className={styles.interactionHeader}>
                <h2 className={styles.interactionTitle}>AI Interview</h2>
              </div>
              <button type="button" className={styles.backButton} onClick={handleBack}>
                Back
              </button>
            </div>

            <div className={styles.interviewLayout}>
              <main className={styles.questionPanel}>
                {interviewReport ? (
                    <div className={styles.reportPanel}>
                      <div className={styles.reportHeader}>
                        <div>
                          <h3>Interview Report</h3>
                          <p>Summary of performance and recommendations</p>
                        </div>
                        <div className={styles.reportBadge}>Completed</div>
                      </div>

                      <div className={styles.reportGrid}>
                        <div className={styles.reportCard}>
                          <div className={styles.reportIcon}>🏆</div>
                          <div>
                            <div className={styles.reportValue}>{interviewReport.score}</div>
                            <div className={styles.reportLabel}>Score</div>
                          </div>
                        </div>
                        <div className={styles.reportCard}>
                          <div className={styles.reportIcon}>🧭</div>
                          <div>
                            <div className={styles.reportValue}>
                              {interviewReport.confidence}
                            </div>
                            <div className={styles.reportLabel}>Confidence</div>
                          </div>
                        </div>
                        <div className={styles.reportCard}>
                          <div className={styles.reportIcon}>⏱️</div>
                          <div>
                            <div className={styles.reportValue}>
                              {interviewReport.timeTakenSeconds ?? "N/A"}s
                            </div>
                            <div className={styles.reportLabel}>Time Taken</div>
                          </div>
                        </div>
                        <div className={styles.reportCard}>
                          <div className={styles.reportIcon}>✅</div>
                          <div>
                            <div className={styles.reportValue}>
                              {interviewReport.answeredQuestions}/{interviewReport.totalQuestions}
                            </div>
                            <div className={styles.reportLabel}>Answered</div>
                          </div>
                        </div>
                      </div>

                      <div className={styles.reportCharts}>
                        <div className={styles.chartCard}>
                          <div className={styles.chartTitle}>Score (out of 10)</div>
                          <canvas
                            ref={scoreCanvasRef}
                            className={styles.scoreChartCanvas}
                            width={180}
                            height={180}
                          />
                        </div>
                        <div className={styles.chartCard}>
                          <div className={styles.chartTitle}>Completion</div>
                          <canvas
                            ref={completionCanvasRef}
                            className={styles.scoreChartCanvas}
                            width={180}
                            height={180}
                          />
                        </div>
                      </div>

                      <div className={styles.reportSection}>
                        <div className={styles.sectionTitle}>📝 Summary</div>
                        <p className={styles.sectionBody}>{interviewReport.summary}</p>
                      </div>

                      {interviewReport.overallFeedback ? (
                        <div className={styles.reportSection}>
                          <div className={styles.sectionTitle}>🧠 Overall Feedback</div>
                          <p className={styles.sectionBody}>
                            {interviewReport.overallFeedback}
                          </p>
                        </div>
                      ) : null}

                      <div className={styles.reportColumns}>
                        <div className={styles.reportSection}>
                          <div className={styles.sectionTitle}>💪 Strengths</div>
                          <ul className={styles.sectionList}>
                            {interviewReport.strengths.map((item, idx) => (
                              <li key={`strength-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className={styles.reportSection}>
                          <div className={styles.sectionTitle}>🧩 Gaps</div>
                          <ul className={styles.sectionList}>
                            {interviewReport.gaps.map((item, idx) => (
                              <li key={`gap-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className={styles.reportSection}>
                          <div className={styles.sectionTitle}>🚀 Recommendations</div>
                          <ul className={styles.sectionList}>
                            {interviewReport.recommendations.map((item, idx) => (
                              <li key={`rec-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        {interviewReport.suggestions?.length ? (
                          <div className={styles.reportSection}>
                            <div className={styles.sectionTitle}>💡 Suggestions</div>
                            <ul className={styles.sectionList}>
                              {interviewReport.suggestions.map((item, idx) => (
                                <li key={`suggestion-${idx}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {interviewReport.feedback?.length ? (
                          <div className={styles.reportSection}>
                            <div className={styles.sectionTitle}>🧾 Feedback</div>
                            <ul className={styles.sectionList}>
                              {interviewReport.feedback.map((item, idx) => (
                                <li key={`feedback-${idx}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>

                      {interviewReport.questionFeedback?.length ? (
                        <div className={styles.reportSection}>
                          <div className={styles.sectionTitle}>📌 Question-wise Feedback</div>
                          <ul className={styles.sectionList}>
                            {interviewReport.questionFeedback.map((item, idx) => (
                              <li key={`question-feedback-${item.questionId || idx}`}>
                                <strong>{item.question || `Question ${idx + 1}`}</strong>
                                <br />
                                {item.feedback}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                ) : (
                  <>
                      <div className={styles.questionHeader}>
                        <div>
                          <h3>Interview Questions</h3>
                          <p>Answer one question at a time using text or voice</p>
                        </div>
                        <div className={styles.questionMeta}>
                          {questionLoading
                            ? "Generating..."
                            : questions.length
                              ? `${currentIndex + 1}/${MAX_QUESTIONS}`
                              : `0/${MAX_QUESTIONS}`}
                        </div>
                      </div>

                      {speechError ? (
                        <div className={styles.speechError}>{speechError}</div>
                      ) : null}

                      {questions.length ? (
                        <div className={styles.questionCard}>
                          <div className={styles.questionTopRow}>
                            <div className={styles.questionTitle}>
                              {currentQuestion
                                ? `Question ${currentIndex + 1}/${MAX_QUESTIONS}`
                                : "Question"}
                            </div>
                            {readAloudSupported ? (
                              <button
                                type="button"
                                className={styles.readAloudButton}
                                onClick={() => {
                                  if (!currentQuestion) return;
                                  if (isSpeaking) {
                                    stopSpeaking();
                                    return;
                                  }
                                  speakQuestion(currentQuestion.prompt);
                                }}
                                disabled={!currentQuestion}
                              >
                                {isSpeaking ? "Stop Audio" : "Read Aloud"}
                              </button>
                            ) : null}
                          </div>
                          <div className={styles.questionText}>
                            {currentQuestion?.prompt}
                          </div>
                          {readAloudSupported ? (
                            <label className={styles.autoReadToggle}>
                              <input
                                type="checkbox"
                                checked={autoReadAloud}
                                onChange={(event) => setAutoReadAloud(event.target.checked)}
                              />
                              Auto read new questions
                            </label>
                          ) : null}
                          <div className={styles.answerBlock}>
                            <div className={styles.answerInputWrapper}>
                              <textarea
                                className={`${styles.answerTextarea} ${
                                  isRecording ? styles.answerTextareaRecording : ""
                                }`}
                                value={answers[currentQuestion?.id] ?? ""}
                                onChange={(e) =>
                                  updateAnswerText(currentQuestion.id, e.target.value)
                                }
                                placeholder="Type your answer here..."
                                rows={6}
                                disabled={Boolean(interviewCompletedAt)}
                              />
                              {speechSupported && (
                                <button
                                  type="button"
                                  className={`${styles.recordButton} ${
                                    isRecording ? styles.recordButtonActive : ""
                                  }`}
                                  onClick={() => toggleRecordingForQuestion(currentQuestion.id)}
                                  aria-label="Start recording"
                                  disabled={Boolean(interviewCompletedAt) || isRecording || isSpeaking}
                                >
                                  <img src="/mic.svg" alt="Mic" width={18} height={18} />
                                </button>
                              )}
                            </div>
                            {isRecording && (
                              <div className={styles.speechHint}>
                                Recording... will stop after 5 seconds of silence.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.emptyState}>
                          Questions will appear here once the interview starts.
                        </div>
                      )}

                      {errorMessage ? (
                        <div className={styles.pageAlert}>
                          <div className={styles.pageAlertTitle}>Interview notice</div>
                          <div className={styles.pageAlertBody}>{errorMessage}</div>
                        </div>
                      ) : null}

                      {questions.length ? (
                        <div className={styles.questionActions}>
                          {!interviewCompletedAt ? (
                            <>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={goToPrevious}
                                disabled={currentIndex === 0}
                              >
                                Previous Question
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                  void goToNext();
                                }}
                                disabled={
                                  questionLoading ||
                                  !questions[currentIndex] ||
                                  !answers[questions[currentIndex].id]?.trim() ||
                                  (currentIndex === questions.length - 1 &&
                                    questions.length >= MAX_QUESTIONS)
                                }
                              >
                                {questionLoading ? "Generating..." : "Next Question"}
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={submitInterview}
                            disabled={
                              reportLoading || !hasAnswers()
                            }
                          >
                            {reportLoading ? "Generating Report..." : "Submit Interview"}
                          </button>
                        </div>
                      ) : null}
                  </>
                )}
              </main>
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}

