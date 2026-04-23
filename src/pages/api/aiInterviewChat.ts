import type { NextApiRequest, NextApiResponse } from "next";
import { ensureOpenAIKey, OpenAIRequestError } from "@/utils/openai";

type OpenAIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type InterviewQuestion = {
  id: string;
  prompt: string;
  category: string;
};

type ChatRequest = {
  contextPrompt?: string;
  messages?: OpenAIMessage[];
  start?: boolean;
  mode?: "chat" | "report" | "questions" | "adaptive";
  questionCount?: number;
  startedAt?: number;
  completedAt?: number;
  resumeData?: Record<string, unknown>;
  resume?: Record<string, unknown>;
  questionHistory?: Array<{
    id?: string;
    prompt?: string;
    category?: string;
    answer?: string;
  }>;
  questions?: Array<{
    id?: string;
    prompt?: string;
    category?: string;
    answer?: string;
  }>;
};

type ChatResponse = {
  reply?: string;
  questions?: InterviewQuestion[];
  question?: InterviewQuestion;
  report?:
    | {
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
      questionFeedback?: Array<{
        questionId: string;
        question: string;
        feedback: string;
      }>;
    }
    | string;
};

const OPENAI_URL =
  process.env.NEXT_PUBLIC_OPEN_AI_CHAT_COMPLETION_API_URL ||
  "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-5.4";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const COACH_NAME = process.env.NEXT_PUBLIC_COACH_NAME || "Senior School Principal";

const summarizeResumeData = (resumeData?: Record<string, unknown>) => {
  if (!resumeData || typeof resumeData !== "object") return "Not provided";
  const keys = [
    "name",
    "title",
    "summary",
    "skills",
    "experiences",
    "education",
    "certifications",
    "languages",
  ] as const;
  const lines: string[] = [];

  for (const key of keys) {
    const value = resumeData[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim()) {
      lines.push(`${key}: ${value.trim()}`);
      continue;
    }
    if (Array.isArray(value) && value.length > 0) {
      const excerpt = JSON.stringify(value).slice(0, 450);
      lines.push(`${key}: ${excerpt}${excerpt.length >= 450 ? "..." : ""}`);
      continue;
    }
    if (typeof value === "object") {
      const excerpt = JSON.stringify(value).slice(0, 450);
      lines.push(`${key}: ${excerpt}${excerpt.length >= 450 ? "..." : ""}`);
    }
  }

  return lines.length ? lines.join("\n") : "Not provided";
};

const buildSystemMessage = (contextPrompt?: string) => {
  const contextText = contextPrompt?.trim() || "Not provided";
  return [
    `You are ${COACH_NAME}, a Senior School Principal and Lead Recruiter with 20 years of experience in education.`,
    "Mission: Conduct a professional, empathetic, yet rigorous interview for a teaching position using multiple-choice questions.",
    "Detailed Interview Context (verbatim from user input):",
    contextText,
    "Interview Inputs (from context): Interviewer profile, Candidate CV, Job Role, Job Description.",
    "Question Format Rules:",
    "- Ask exactly 20 multiple-choice questions, numbered 1/20 through 20/20.",
    "- Each question MUST include four options labeled A, B, C, D.",
    "- Ask ONLY one question at a time. Wait for the candidate to answer before moving on.",
    "- Accept answers as A/B/C/D or the full option text. If unclear, ask them to reply with A/B/C/D.",
    "- Make sure at least 1 question is answered before allowing interview completion.",
    "- Do NOT add any greeting or introduction. Output only the question and options.",
    "Question Strategy:",
    "- Question 1: easy intro.",
    "- Mix pedagogy, classroom management, subject knowledge, ethics, and scenario-based questions.",
    "- Keep tone supportive, professional, encouraging.",
    "Completion:",
    "- After Question 20 is answered, conclude with: \"Thank you for your time today. It was great learning about your experience. We will review your responses and get back to you soon.\"",
    "Start Now: Ask Question 1/20 only.",
  ].join("\n");
};

const buildStartMessage = () => {
  return "Begin the interview now. Ask Question 1/20 only. No greeting or introduction.";
};

const buildQuestionSystemMessage = (
  contextPrompt?: string,
  count = 10,
  resumeData?: Record<string, unknown>
) => {
  const contextText = contextPrompt?.trim() || "Not provided";
  const resumeText = summarizeResumeData(resumeData);
  return [
    "You are an interview coach creating a tailored question set.",
    "Goal: Generate role-specific, open-ended interview questions for a candidate.",
    "Return ONLY valid JSON as an array of objects with this shape:",
    `{ "id": "q-1", "prompt": "question text", "category": "Category Name" }`,
    `Generate exactly ${count} questions.`,
    "Rules:",
    "- Use ids q-1 ... q-10 (or up to q-N based on count).",
    "- Make questions specific to the context provided.",
    "- Use resume evidence (skills, projects, achievements) to personalize each question.",
    "- Mix categories like Introduction, Subject Knowledge, Classroom Management, Pedagogy, Assessment, Communication, Collaboration, Ethics, and Growth Mindset.",
    "- Avoid multiple-choice; use free-response prompts.",
    "- No extra text outside JSON.",
    "Detailed Interview Context (verbatim from user):",
    contextText,
    "Candidate Resume Data Snapshot:",
    resumeText,
  ].join("\n");
};

const buildAdaptiveQuestionSystemMessage = (
  contextPrompt?: string,
  resumeData?: Record<string, unknown>,
  questionHistory?: ChatRequest["questionHistory"]
) => {
  const contextText = contextPrompt?.trim() || "Not provided";
  const resumeText = summarizeResumeData(resumeData);
  const history =
    questionHistory && questionHistory.length
      ? questionHistory
          .map((item, index) => {
            const q = (item.prompt || "").trim();
            const a = (item.answer || "").trim();
            const category = (item.category || "").trim();
            return `Q${index + 1} [${category || "General"}]: ${q}\nA${index + 1}: ${a || "Not answered"}`;
          })
          .join("\n")
      : "No previous Q/A yet.";

  return [
    "You are an adaptive interview coach generating ONE next question at a time.",
    "Return ONLY valid JSON with this exact shape:",
    `{ "id": "q-1", "prompt": "question text", "category": "Category Name" }`,
    "Rules:",
    "- Output exactly one question object.",
    "- If there is no history, generate the first interview question grounded in context + resume.",
    "- If history exists, adapt using the candidate's latest answer: ask either a focused follow-up or the next related question.",
    "- Avoid repeating prior prompts.",
    "- Keep question open-ended and realistic for a professional interview.",
    "- Keep prompt concise (1-2 sentences).",
    "Detailed Interview Context (verbatim from user):",
    contextText,
    "Candidate Resume Data Snapshot:",
    resumeText,
    "Question/Answer History:",
    history,
  ].join("\n");
};

const buildReportSystemMessage = (
  contextPrompt: string | undefined,
  answeredCount: number,
  durationSeconds: number | null,
  totalQuestions: number
) => {
  const contextText = contextPrompt?.trim() || "Not provided";
  return [
    "You are an interview evaluator. Provide a concise, structured report based on the transcript.",
    "Return ONLY valid JSON that matches this schema:",
    "{",
    '  "score": number,',
    '  "confidence": "low" | "medium" | "high",',
    '  "timeTakenSeconds": number | null,',
    '  "answeredQuestions": number,',
    '  "totalQuestions": number,',
    '  "completionStatus": "complete" | "incomplete",',
    '  "summary": string,',
    '  "strengths": string[],',
    '  "gaps": string[],',
    '  "recommendations": string[],',
    '  "questionFeedback": [{ "questionId": string, "question": string, "feedback": string }]',
    "}",
    "Rules:",
    "- If answeredQuestions < 1, set completionStatus to \"incomplete\" and include a recommendation to answer at least 1 question.",
    "- Use the provided answeredQuestions, totalQuestions, and timeTakenSeconds values; do not invent them.",
    "- questionFeedback must include one entry per answered question.",
    "- Each feedback must be 2-3 lines, specific to that answer, and actionable.",
    "- Base the score and confidence only on the candidate answers in the transcript.",
    "Context provided by user:",
    contextText,
    `answeredQuestions: ${answeredCount}`,
    `totalQuestions: ${totalQuestions}`,
    `timeTakenSeconds: ${durationSeconds ?? "null"}`,
  ].join("\n");
};

const countAnsweredQuestions = (messages: OpenAIMessage[]) => {
  const userMessages = messages.filter((msg) => msg.role === "user");
  let count = 0;
  for (const message of userMessages) {
    const text = message.content || "";
    if (/\b([A-D])\b/i.test(text) || /\boption\s+[A-D]\b/i.test(text)) {
      count += 1;
      continue;
    }
    if (text.trim().length > 0) {
      count += 1;
    }
  }
  return count;
};

const getDurationSeconds = (startedAt?: number, completedAt?: number) => {
  if (typeof startedAt !== "number" || typeof completedAt !== "number") {
    return null;
  }
  if (completedAt <= startedAt) return null;
  return Math.round((completedAt - startedAt) / 1000);
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse | { message: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const body = (req.body ?? {}) as ChatRequest;
  const inboundMessages = Array.isArray(body.messages) ? body.messages : [];

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ message: "Missing OPENAI_API_KEY" });
  }

  try {
    ensureOpenAIKey();

    const mode = body.mode || "chat";
    const resumeFromPayload =
      body.resume &&
      typeof body.resume.data === "object" &&
      body.resume.data !== null &&
      typeof (body.resume.data as Record<string, unknown>).resumeData === "object" &&
      (body.resume.data as Record<string, unknown>).resumeData !== null
        ? ((body.resume.data as Record<string, unknown>).resumeData as Record<string, unknown>)
        : undefined;
    const resumeSource = body.resumeData ?? resumeFromPayload;
    const durationSeconds = getDurationSeconds(body.startedAt, body.completedAt);
    const submittedQuestions = Array.isArray(body.questions) ? body.questions : [];
    const totalQuestions = submittedQuestions.length || 0;
    const answeredCountFromQuestions = submittedQuestions.filter((question) =>
      Boolean(question.answer?.trim())
    ).length;
    const answeredCount = totalQuestions
      ? answeredCountFromQuestions
      : countAnsweredQuestions(inboundMessages);

    const messages: OpenAIMessage[] =
      mode === "report"
        ? [
            {
              role: "system",
              content: buildReportSystemMessage(
                body.contextPrompt,
                answeredCount,
                durationSeconds,
                totalQuestions || 20
              ),
            },
            {
              role: "user",
              content: JSON.stringify({
                transcript: inboundMessages,
                questions: submittedQuestions,
              }),
            },
          ]
        : mode === "questions"
          ? [
              {
                role: "system",
                content: buildQuestionSystemMessage(
                  body.contextPrompt,
                  body.questionCount ?? 10,
                  resumeSource
                ),
              },
              {
                role: "user",
                content: "Generate the questions now.",
              },
            ]
          : mode === "adaptive"
            ? [
                {
                  role: "system",
                  content: buildAdaptiveQuestionSystemMessage(
                    body.contextPrompt,
                    resumeSource,
                    body.questionHistory
                  ),
                },
                {
                  role: "user",
                  content: "Generate the next adaptive interview question now.",
                },
              ]
          : [
              { role: "system", content: buildSystemMessage(body.contextPrompt) },
              ...(body.start
                ? [{ role: "user", content: buildStartMessage() } as OpenAIMessage]
                : []),
              ...inboundMessages,
            ];

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.6,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OpenAIRequestError(response.status, "AI service error.", errorText);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ message: "AI service returned an empty response." });
    }

    if (mode === "report") {
      try {
        const report = JSON.parse(reply) as ChatResponse["report"];
        return res.status(200).json({ report });
      } catch {
        return res.status(200).json({ report: reply });
      }
    }

    if (mode === "questions") {
      try {
        const parsed = JSON.parse(reply) as InterviewQuestion[];
        if (!Array.isArray(parsed)) {
          throw new Error("Questions response was not an array.");
        }
        return res.status(200).json({ questions: parsed });
      } catch {
        return res.status(502).json({ message: "Questions were not returned in JSON." });
      }
    }

    if (mode === "adaptive") {
      try {
        const parsed = JSON.parse(reply) as InterviewQuestion;
        if (!parsed || typeof parsed !== "object" || !parsed.prompt) {
          throw new Error("Adaptive question response was invalid.");
        }
        return res.status(200).json({ question: parsed });
      } catch {
        return res.status(502).json({ message: "Adaptive question was not returned in JSON." });
      }
    }

    return res.status(200).json({ reply });
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      console.error("AI interview chat failed", {
        status: error.status,
        details: error.details,
      });
      return res.status(error.status).json({ message: error.message });
    }

    console.error("AI interview chat failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to reach AI service.";
    return res.status(500).json({ message });
  }
}
