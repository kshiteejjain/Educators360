import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import Layout from "@/components/Layout/Layout";
import styles from "./AIInterview.module.css";

type ViewMode = "configure" | "interact";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
};

type OpenAIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type SilenceStage = 0 | 1 | 2;

type SpeakOptions = {
  nextSilenceMs?: number;
  onDone?: () => void;
  skipRestartRecognition?: boolean;
};

type McqOption = {
  label: "A" | "B" | "C" | "D";
  text: string;
};

type McqItem = {
  id: string;
  question: string;
  options: McqOption[];
  answer?: "A" | "B" | "C" | "D";
  raw: string;
  questionNumber?: number;
};

type InterviewReport = {
  score: number;
  confidence: string;
  timeTakenSeconds: number | null;
  answeredQuestions: number;
  totalQuestions: number;
  completionStatus: "complete" | "incomplete";
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
};

const SPEECH_SILENCE_MS = 8000;
const FOLLOW_UP_SILENCE_MS = 5000;

export default function AIInterview() {
  const [view, setView] = useState<ViewMode>("configure");
  const [contextPrompt, setContextPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [activeCard, setActiveCard] = useState<"chat" | "audio" | null>(null);
  const [mcqItems, setMcqItems] = useState<McqItem[]>([]);
  const [mcqLoading, setMcqLoading] = useState(false);
  const [interviewStartedAt, setInterviewStartedAt] = useState<number | null>(null);
  const [interviewCompletedAt, setInterviewCompletedAt] = useState<number | null>(null);
  const [interviewReport, setInterviewReport] = useState<InterviewReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scoreChartRef = useRef<Chart<"doughnut", number[], string> | null>(null);
  const completionChartRef = useRef<Chart<"bar", number[], string> | null>(null);
  const scoreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const completionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const isActiveRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isMutedRef = useRef(false);

  const silenceStageRef = useRef<SilenceStage>(0);
  const silenceDeadlineRef = useRef<number | null>(null);
  const silenceIntervalRef = useRef<number | null>(null);
  const userTurnActiveRef = useRef(false);

  const conversationRef = useRef<OpenAIMessage[]>([]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = document.querySelector(
      'script[data-elevenlabs-convai="true"]'
    ) as HTMLScriptElement | null;
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    script.async = true;
    script.type = "text/javascript";
    script.dataset.elevenlabsConvai = "true";
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    return () => {
      stopRecognition();
      stopSilenceWatch();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!interviewReport) return;

    const totalQuestions = interviewReport.totalQuestions || 20;
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

    if (scoreCanvasRef.current) {
      scoreChartRef.current = new Chart<"doughnut", number[], string>(
        scoreCanvasRef.current,
        {
        type: "doughnut",
        data: {
          labels: ["Score", "Remaining"],
          datasets: [
            {
              data: scoreData,
              backgroundColor: ["#16a34a", "#e2e8f0"],
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
      }
      );
    }

    if (completionCanvasRef.current) {
      completionChartRef.current = new Chart<"bar", number[], string>(
        completionCanvasRef.current,
        {
        type: "bar",
        data: {
          labels: ["Answered", "Remaining"],
          datasets: [
            {
              data: completionData,
              backgroundColor: ["#0ea5e9", "#e2e8f0"],
              borderRadius: 8,
              barThickness: 24,
            },
          ],
        },
        options: {
          indexAxis: "y",
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false, suggestedMax: totalQuestions },
            y: { display: false },
          },
        },
      }
      );
    }

    return () => {
      if (scoreChartRef.current) scoreChartRef.current.destroy();
      if (completionChartRef.current) completionChartRef.current.destroy();
      scoreChartRef.current = null;
      completionChartRef.current = null;
    };
  }, [interviewReport]);

  const addMessage = (role: "user" | "assistant", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => {
      const next = [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role,
          text: trimmed,
          ts: Date.now(),
        },
      ];
      return next.length > 300 ? next.slice(-300) : next;
    });
  };

  const resetSilenceFlow = () => {
    silenceStageRef.current = 0;
    silenceDeadlineRef.current = null;
    setSilenceCountdown(null);
  };

  const startSilenceWatch = () => {
    if (silenceIntervalRef.current) return;
    silenceIntervalRef.current = window.setInterval(handleSilenceTick, 1000);
  };

  const stopSilenceWatch = () => {
    if (!silenceIntervalRef.current) return;
    window.clearInterval(silenceIntervalRef.current);
    silenceIntervalRef.current = null;
  };

  const handleSilenceTick = () => {
    if (!isActiveRef.current) return;
    if (isAiSpeakingRef.current) return;
    if (!userTurnActiveRef.current) return;
    if (!silenceDeadlineRef.current) return;

    const remainingMs = silenceDeadlineRef.current - Date.now();
    if (remainingMs > 0) {
      setSilenceCountdown(Math.ceil(remainingMs / 1000));
      return;
    }

    if (silenceStageRef.current === 0) {
      userTurnActiveRef.current = false;
      speak("Are you there?", { nextSilenceMs: FOLLOW_UP_SILENCE_MS });
      silenceStageRef.current = 1;
      silenceDeadlineRef.current = Date.now() + FOLLOW_UP_SILENCE_MS;
      setSilenceCountdown(Math.ceil(FOLLOW_UP_SILENCE_MS / 1000));
      return;
    }

    if (silenceStageRef.current === 1) {
      userTurnActiveRef.current = false;
      speak("Are you there?", { nextSilenceMs: FOLLOW_UP_SILENCE_MS });
      silenceStageRef.current = 2;
      silenceDeadlineRef.current = Date.now() + FOLLOW_UP_SILENCE_MS;
      setSilenceCountdown(Math.ceil(FOLLOW_UP_SILENCE_MS / 1000));
      return;
    }

    userTurnActiveRef.current = false;
    silenceDeadlineRef.current = null;
    setSilenceCountdown(null);
    speak("Thank you for your time. Have a good day.", {
      skipRestartRecognition: true,
      onDone: () => endInterview("inactive"),
    });
  };

  const getRecognitionConstructor = () => {
    if (typeof window === "undefined") return null;
    return (
      (window as Window & {
        webkitSpeechRecognition?: typeof SpeechRecognition;
      }).SpeechRecognition ||
      (window as Window & {
        webkitSpeechRecognition?: typeof SpeechRecognition;
      }).webkitSpeechRecognition ||
      null
    );
  };

  const stopRecognition = () => {
    if (!recognitionRef.current) return;
    recognitionActiveRef.current = false;
    recognitionRef.current.onresult = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.onend = null;
    recognitionRef.current.onspeechstart = null;
    recognitionRef.current.onspeechend = null;
    recognitionRef.current.stop();
  };

  const startRecognition = () => {
    if (isMutedRef.current || isAiSpeakingRef.current || !isActiveRef.current) {
      return;
    }
    if (!recognitionRef.current) return;
    if (recognitionActiveRef.current) return;
    try {
      recognitionRef.current.start();
      recognitionActiveRef.current = true;
    } catch {
      // Some browsers throw if already started.
    }
  };

  const setupRecognition = () => {
    const RecognitionCtor = getRecognitionConstructor();
    if (!RecognitionCtor) {
      setStatus("error");
      setErrorMessage("This browser does not support Speech Recognition.");
      return false;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onspeechstart = () => {
      setIsUserSpeaking(true);
      resetSilenceFlow();
    };

    recognition.onspeechend = () => {
      setIsUserSpeaking(false);
    };

    recognition.onresult = (event) => {
      const results = Array.from(event.results || []);
      const startIndex = Math.max(0, event.resultIndex || 0);
      const finalTranscripts = results
        .slice(startIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript?.trim())
        .filter(Boolean) as string[];

      if (!finalTranscripts.length) return;

      const transcript = finalTranscripts.join(" ").trim();
      if (!transcript) return;

      addMessage("user", transcript);
      conversationRef.current = [
        ...conversationRef.current,
        { role: "user", content: transcript },
      ];

      userTurnActiveRef.current = false;
      resetSilenceFlow();
      stopRecognition();
      void requestAiResponse();
    };

    recognition.onerror = (event) => {
      recognitionActiveRef.current = false;
      const errorType = (event as SpeechRecognitionErrorEvent)?.error;
      if (errorType === "not-allowed" || errorType === "service-not-allowed") {
        setStatus("error");
        setErrorMessage("Microphone access is blocked. Please allow mic access.");
        return;
      }
      if (isActiveRef.current && !isAiSpeakingRef.current && !isMutedRef.current) {
        window.setTimeout(startRecognition, 500);
      }
    };

    recognition.onstart = () => {
      recognitionActiveRef.current = true;
    };

    recognition.onend = () => {
      recognitionActiveRef.current = false;
      if (isActiveRef.current && !isAiSpeakingRef.current && !isMutedRef.current) {
        window.setTimeout(startRecognition, 250);
      }
    };

    recognitionRef.current = recognition;
    return true;
  };

  const parseMcqReply = (reply: string) => {
    const lines = reply
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const optionPattern = /^[A-D][\).\-\:]\s+/i;
    const firstOptionIndex = lines.findIndex((line) => optionPattern.test(line));
    const questionLines =
      firstOptionIndex === -1 ? lines : lines.slice(0, firstOptionIndex);
    const optionsLines =
      firstOptionIndex === -1 ? [] : lines.slice(firstOptionIndex);
    const question = questionLines.join(" ").trim() || reply.trim();
    const options: McqOption[] = optionsLines
      .map((line) => {
        const match = line.match(/^([A-D])[\).\-\:]\s+(.*)$/i);
        if (!match) return null;
        const label = match[1].toUpperCase() as McqOption["label"];
        const text = match[2].trim();
        return text ? { label, text } : null;
      })
      .filter(Boolean) as McqOption[];
    const questionNumberMatch = reply.match(/(\d+)\s*\/\s*20/);
    const questionNumber = questionNumberMatch
      ? Number(questionNumberMatch[1])
      : undefined;

    return { question, options, questionNumber };
  };

  const requestMcqQuestion = async (start = false) => {
    setMcqLoading(true);
    setErrorMessage(null);

    try {
      syncConversationFromMcq();
      const response = await fetch("/api/aiInterviewChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextPrompt,
          messages: conversationRef.current,
          start,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload?.message || "Failed to reach AI service.");
      }

      const data = (await response.json()) as { reply: string };
      if (!data.reply) {
        throw new Error("AI response was empty.");
      }

      conversationRef.current = [
        ...conversationRef.current,
        { role: "assistant", content: data.reply },
      ];

      const parsed = parseMcqReply(data.reply);
      const mcqItem: McqItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        question: parsed.question,
        options: parsed.options,
        raw: data.reply,
        questionNumber: parsed.questionNumber,
      };
      setMcqItems((prev) => [...prev, mcqItem]);
      setCurrentIndex((prev) =>
        prev === mcqItems.length - 1 ? prev + 1 : prev
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed.";
      setErrorMessage(message);
    } finally {
      setMcqLoading(false);
    }
  };

  const startMcqInterview = () => {
    setIsActive(true);
    setInterviewReport(null);
    setInterviewStartedAt(Date.now());
    setInterviewCompletedAt(null);
    conversationRef.current = [];
    setMcqItems([]);
    setCurrentIndex(0);
    void requestMcqQuestion(true);
  };

  const updateAnswer = (index: number, answer: McqItem["answer"]) => {
    setMcqItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, answer } : item))
    );
  };

  const syncConversationFromMcq = () => {
    conversationRef.current = mcqItems.flatMap((item) => {
      const entries: OpenAIMessage[] = [
        { role: "assistant", content: item.raw || item.question },
      ];
      if (item.answer) {
        entries.push({ role: "user", content: item.answer });
      }
      return entries;
    });
  };

  const goToNext = () => {
    const currentItem = mcqItems[currentIndex];
    if (!currentItem || !currentItem.answer || mcqLoading) return;

    if (currentIndex < mcqItems.length - 1) {
      setCurrentIndex((prev) => Math.min(prev + 1, mcqItems.length - 1));
      return;
    }

    void requestMcqQuestion(false);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const submitInterview = () => {
    if (!mcqItems.some((item) => item.answer)) return;
    syncConversationFromMcq();
    setInterviewCompletedAt(Date.now());
    setIsActive(false);
  };

  const fetchInterviewReport = async () => {
    if (!interviewStartedAt) return;
    if (!mcqItems.some((item) => item.answer)) {
      setErrorMessage("Please answer at least one question to complete the interview.");
      return;
    }

    setReportLoading(true);
    setErrorMessage(null);

    try {
      syncConversationFromMcq();
      const response = await fetch("/api/aiInterviewChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "report",
          contextPrompt,
          messages: conversationRef.current,
          startedAt: interviewStartedAt,
          completedAt: interviewCompletedAt ?? Date.now(),
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

  const requestAiResponse = async (start = false) => {
    setStatus("connecting");

    try {
      const response = await fetch("/api/aiInterviewChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextPrompt,
          messages: conversationRef.current,
          start,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload?.message || "Failed to reach AI service.");
      }

      const data = (await response.json()) as { reply: string };
      if (!data.reply) {
        throw new Error("AI response was empty.");
      }

      conversationRef.current = [
        ...conversationRef.current,
        { role: "assistant", content: data.reply },
      ];
      addMessage("assistant", data.reply);

      speak(data.reply, { nextSilenceMs: SPEECH_SILENCE_MS });
      setStatus("live");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed.";
      setStatus("error");
      setErrorMessage(message);
    }
  };

  const speak = (text: string, options: SpeakOptions = {}) => {
    if (typeof window === "undefined") return;

    stopRecognition();
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    setIsAiSpeaking(true);
    userTurnActiveRef.current = false;
    resetSilenceFlow();

    utterance.onend = () => {
      setIsAiSpeaking(false);
      options.onDone?.();

      if (options.skipRestartRecognition) return;

      if (options.nextSilenceMs != null) {
        userTurnActiveRef.current = true;
        silenceStageRef.current = 0;
        silenceDeadlineRef.current = Date.now() + options.nextSilenceMs;
        setSilenceCountdown(Math.ceil(options.nextSilenceMs / 1000));
      }

      startRecognition();
    };

    utterance.onerror = () => {
      setIsAiSpeaking(false);
      if (!options.skipRestartRecognition) {
        startRecognition();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startInterview = () => {
    setErrorMessage(null);
    setStatus("live");
    setIsActive(true);

    conversationRef.current = [];
    setMessages([]);
    resetSilenceFlow();
    startSilenceWatch();

    if (!setupRecognition()) return;
    userTurnActiveRef.current = true;
    startRecognition();
    void requestAiResponse(true);
  };

  const endInterview = (reason: "user" | "inactive") => {
    setIsActive(false);
    setStatus("idle");
    stopRecognition();
    stopSilenceWatch();
    resetSilenceFlow();
    setIsUserSpeaking(false);
    setIsAiSpeaking(false);

    if (reason === "inactive") {
      setErrorMessage("Interview ended due to inactivity.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setView("interact");
    if (activeCard === "chat") {
      startMcqInterview();
    }
  };

  const handleBack = () => {
    setView("configure");
    endInterview("user");
    setMcqItems([]);
    setCurrentIndex(0);
    setInterviewReport(null);
    setInterviewStartedAt(null);
    setInterviewCompletedAt(null);
    setReportLoading(false);
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        stopRecognition();
        setIsUserSpeaking(false);
      } else {
        if (isAiSpeakingRef.current) {
          window.speechSynthesis?.cancel();
        }
        startRecognition();
      }
      return next;
    });
  };

  const agentSubtitle = useMemo(() => {
    if (status === "connecting") return "Connecting...";
    if (status === "error") return "Error";
    return isActive ? "Interview in progress" : "Ready to start";
  }, [status, isActive]);

  return (
    <Layout>
      <section className={styles.page}>
        {view === "configure" ? (
          <>
            <div className={styles.headerRow}>
              <div>
                <h2 className={styles.title}>Configure AI Agent</h2>
                <p className={styles.subtitle}>
                  Set up your AI coach&apos;s behavior and capabilities
                </p>
              </div>
            </div>

            <div className={styles.inputCards}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveCard("chat")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveCard("chat");
                  }
                }}
                className={`${styles.inputCard} ${activeCard === "chat" ? styles.cardActive : styles.cardInactive
                  }`}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3>💬 Chat Interview</h3>
                    <p>
                      Practice structured interview questions with instant AI feedback
                      and guided follow-ups.
                    </p>
                  </div>
                  <span className={styles.cardBadge}>AI Chat</span>
                </div>
                <button type="button" className={`btn-primary ${styles.cardButton}`}>
                  Start Chat Interview
                </button>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveCard("audio")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveCard("audio");
                  }
                }}
                className={`${styles.inputCard} ${activeCard === "audio" ? styles.cardActive : styles.cardInactive
                  }`}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <h3>🎤 AI Audio Interview</h3>
                    <p>
                      Simulate a live voice interview with real-time listening, pacing,
                      and response cues.
                    </p>
                  </div>
                  <span className={styles.cardBadge}>Voice</span>
                </div>
                <button type="button" className={`btn-primary ${styles.cardButton}`}>
                  Start Audio Interview
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
                      onChange={(e) => setContextPrompt(e.target.value)}
                      placeholder="I am Math teacher"
                    />
                  </div>
                </div>

                <div className={styles.submitRow}>
                  <button type="submit" className="btn-primary">
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

            {activeCard === "audio" ? (
              <div className={styles.audioWidgetWrap}>
                <elevenlabs-convai agent-id="agent_0501kgpypb14f37rvfdwkx63art4"></elevenlabs-convai>
              </div>
            ) : (
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
                          <canvas ref={scoreCanvasRef} height={140} />
                        </div>
                        <div className={styles.chartCard}>
                          <div className={styles.chartTitle}>Completion</div>
                          <canvas ref={completionCanvasRef} height={140} />
                        </div>
                      </div>

                      <div className={styles.reportSection}>
                        <div className={styles.sectionTitle}>📝 Summary</div>
                        <p className={styles.sectionBody}>{interviewReport.summary}</p>
                      </div>

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
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.questionHeader}>
                        <div>
                          <h3>Interview Questions</h3>
                          <p>Answer one question at a time</p>
                        </div>
                        <div className={styles.questionMeta}>
                          {mcqItems.length ? `${currentIndex + 1}/${mcqItems.length}` : "0/20"}
                        </div>
                      </div>

                      {mcqItems.length ? (
                        <div className={styles.questionCard}>
                          <div className={styles.questionTitle}>
                            {mcqItems[currentIndex]?.questionNumber
                              ? `Question ${mcqItems[currentIndex].questionNumber}/20`
                              : "Question"}
                          </div>
                          <div className={styles.questionText}>
                            {mcqItems[currentIndex]?.question}
                          </div>
                          <div className={styles.optionsList}>
                            {mcqItems[currentIndex]?.options.map((option) => (
                              <label
                                key={`${mcqItems[currentIndex].id}-${option.label}`}
                                className={styles.optionItem}
                              >
                                <input
                                  type="radio"
                                  name={`mcq-${mcqItems[currentIndex].id}`}
                                  value={option.label}
                                  checked={mcqItems[currentIndex]?.answer === option.label}
                                  onChange={() =>
                                    updateAnswer(currentIndex, option.label)
                                  }
                                  disabled={mcqLoading || Boolean(interviewCompletedAt)}
                                />
                                <span className={styles.optionLabel}>
                                  {option.label}. {option.text}
                                </span>
                              </label>
                            ))}
                          </div>
                          <div className={styles.questionHint}>
                            {mcqLoading ? "Loading next question..." : "Select an answer to continue"}
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

                      {mcqItems.length ? (
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
                                onClick={goToNext}
                                disabled={
                                  !mcqItems[currentIndex]?.answer ||
                                  mcqLoading ||
                                  Boolean(
                                    mcqItems[currentIndex]?.questionNumber &&
                                      mcqItems[currentIndex]?.questionNumber >= 20
                                  )
                                }
                              >
                                Next Question
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={submitInterview}
                            disabled={!mcqItems.some((item) => item.answer)}
                          >
                            Submit Interview
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={fetchInterviewReport}
                            disabled={!interviewCompletedAt || reportLoading}
                          >
                            {reportLoading ? "Generating Report..." : "Get Report"}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </main>
              </div>
            )}
          </>
        )}
      </section>
    </Layout>
  );
}
