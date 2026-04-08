import type { NextApiRequest, NextApiResponse } from "next";
import { ensureOpenAIKey, OpenAIRequestError } from "@/utils/openai";

type OpenAIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequest = {
  contextPrompt?: string;
  messages?: OpenAIMessage[];
  start?: boolean;
  mode?: "chat" | "report";
  startedAt?: number;
  completedAt?: number;
};

type ChatResponse = {
  reply?: string;
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
      }
    | string;
};

const OPENAI_URL =
  process.env.NEXT_PUBLIC_OPEN_AI_CHAT_COMPLETION_API_URL ||
  "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-5.4";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const COACH_NAME = process.env.NEXT_PUBLIC_COACH_NAME || "Senior School Principal";

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

const buildReportSystemMessage = (
  contextPrompt: string | undefined,
  answeredCount: number,
  durationSeconds: number | null
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
    '  "totalQuestions": 20,',
    '  "completionStatus": "complete" | "incomplete",',
    '  "summary": string,',
    '  "strengths": string[],',
    '  "gaps": string[],',
    '  "recommendations": string[]',
    "}",
    "Rules:",
    "- If answeredQuestions < 1, set completionStatus to \"incomplete\" and include a recommendation to answer at least 1 question.",
    "- Use the provided answeredQuestions and timeTakenSeconds values; do not invent them.",
    "- Base the score and confidence only on the candidate answers in the transcript.",
    "Context provided by user:",
    contextText,
    `answeredQuestions: ${answeredCount}`,
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
    const durationSeconds = getDurationSeconds(body.startedAt, body.completedAt);
    const answeredCount = countAnsweredQuestions(inboundMessages);

    const messages: OpenAIMessage[] =
      mode === "report"
        ? [
            {
              role: "system",
              content: buildReportSystemMessage(
                body.contextPrompt,
                answeredCount,
                durationSeconds
              ),
            },
            {
              role: "user",
              content: JSON.stringify({
                transcript: inboundMessages,
              }),
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
