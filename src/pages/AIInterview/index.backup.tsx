import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Layout from "@/components/Layout/Layout";
import styles from "./AIInterview.module.css";
import placeholderTeacher from "../../../public/placeholder-teacher.jpg";

type ViewMode = "configure" | "interact";

type TranscriptMessage = {
  id: string;
  speaker: "user" | "agent";
  text: string;
  ts: number;
};

type ElevenLabsMessage = {
  type?: string;
  ping_event?: { event_id?: number };
  audio_event?: { audio_base_64?: string };
  conversation_initiation_metadata_event?: {
    agent_output_audio_format?: string;
    user_input_audio_format?: string;
  };
  user_transcript_event?: {
    text?: string;
    transcript?: string;
    utterance?: string;
  };
  agent_response_event?: {
    text?: string;
    transcript?: string;
    response?: string;
  };
  agent_transcript_event?: {
    text?: string;
    transcript?: string;
  };
  agent_response_correction_event?: {
    text?: string;
    transcript?: string;
  };
  user_transcript?: string;
  agent_response?: string;
};

export default function AIInterview() {
  const [view, setView] = useState<ViewMode>("configure");
  const [contextPrompt, setContextPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [lastUserAudioAt, setLastUserAudioAt] = useState<number | null>(null);
  const [lastAiAudioAt, setLastAiAudioAt] = useState<number | null>(null);
  const [userInitials, setUserInitials] = useState<string>("You");
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);

  const inputSampleRateRef = useRef<number>(16000);
  const outputSampleRateRef = useRef<number>(16000);
  const outputPlayTimeRef = useRef<number>(0);

  const userEndedRef = useRef(false);
  const endReasonRef = useRef<"user" | "inactive" | "unexpected" | null>(null);

  const lastUserAudioUiRef = useRef(0);
  const lastAiAudioUiRef = useRef(0);

  const lastUserVoiceDetectedAtRef = useRef<number | null>(null);

  const silenceStageRef = useRef(0);
  const silenceDeadlineRef = useRef<number | null>(null);
  const silenceIntervalRef = useRef<number | null>(null);

  const aiTurnEndedRef = useRef(false);
  const userTurnActiveRef = useRef(false);
  const aiPlaybackFinishTimerRef = useRef<number | null>(null);

  const isActiveRef = useRef(false);
  const statusRef = useRef<"idle" | "connecting" | "live" | "error">("idle");

  const staticCoachName = "AI Interview Assistant";

  const isUserSpeaking = Boolean(
    lastUserAudioAt && Date.now() - lastUserAudioAt < 1200
  );
  const isAiSpeaking = Boolean(lastAiAudioAt && Date.now() - lastAiAudioAt < 1200);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("upeducateJobPrefix");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { name?: string };
      const name = parsed?.name?.trim();
      if (!name) return;
      const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
      setUserInitials(initials || "You");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioWorkletRef.current?.disconnect();
      audioInputRef.current?.disconnect();
      monitorGainRef.current?.disconnect();
      void audioContextRef.current?.close();

      if (silenceIntervalRef.current) {
        window.clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      if (aiPlaybackFinishTimerRef.current) {
        window.clearTimeout(aiPlaybackFinishTimerRef.current);
        aiPlaybackFinishTimerRef.current = null;
      }
    };
  }, []);

  const addLog = (message: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    setEventLog((prev) => {
      const next = [...prev, entry];
      return next.length > 300 ? next.slice(-300) : next;
    });
    if (typeof window !== "undefined") {
      console.log(entry);
    }
  };

  const cleanTranscriptText = (value: string) => {
    return value.replace(/<\/?[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  };

  const addMessage = (speaker: "user" | "agent", text: string) => {
    const cleaned = cleanTranscriptText(text);
    if (!cleaned) return;

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.speaker === speaker &&
        last.text === cleaned &&
        Date.now() - last.ts < 2000
      ) {
        return prev;
      }

      const next = [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          speaker,
          text: cleaned,
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

  const stopAudio = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioWorkletRef.current?.disconnect();
    audioInputRef.current?.disconnect();
    monitorGainRef.current?.disconnect();
    void audioContextRef.current?.close();

    mediaStreamRef.current = null;
    audioWorkletRef.current = null;
    audioInputRef.current = null;
    monitorGainRef.current = null;
    audioContextRef.current = null;
  };

  const downsampleBuffer = (
    buffer: Float32Array,
    rate: number,
    targetRate: number
  ) => {
    if (rate === targetRate) return buffer;

    const ratio = rate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;

      for (
        let i = offsetBuffer;
        i < nextOffsetBuffer && i < buffer.length;
        i += 1
      ) {
        accum += buffer[i];
        count += 1;
      }

      result[offsetResult] = accum / Math.max(1, count);
      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  };

  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  };

  const arrayBufferToBase64 = (buffer: ArrayBufferLike) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
  };

  const base64ToInt16 = (base64: string) => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Int16Array(bytes.buffer);
  };

  const markUserTurnAfterAiPlayback = (delayMs: number) => {
    if (aiPlaybackFinishTimerRef.current) {
      window.clearTimeout(aiPlaybackFinishTimerRef.current);
    }

    aiPlaybackFinishTimerRef.current = window.setTimeout(() => {
      aiTurnEndedRef.current = true;
      userTurnActiveRef.current = true;
      silenceStageRef.current = 0;
      silenceDeadlineRef.current = Date.now() + 8000;
      setSilenceCountdown(8);
      addLog("AI finished speaking. Waiting for candidate response.");
    }, Math.max(0, delayMs));
  };

  const playPcm = (pcm: Int16Array, sampleRate: number) => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < pcm.length; i += 1) {
      channel[i] = pcm[i] / 0x8000;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, outputPlayTimeRef.current);
    source.start(startAt);
    outputPlayTimeRef.current = startAt + buffer.duration;

    const now = Date.now();
    if (now - lastAiAudioUiRef.current > 250) {
      lastAiAudioUiRef.current = now;
      setLastAiAudioAt(now);
    }

    // Agent speaking means user silence should NOT be considered.
    aiTurnEndedRef.current = false;
    userTurnActiveRef.current = false;
    resetSilenceFlow();

    const delayMs = Math.max(
      0,
      (outputPlayTimeRef.current - ctx.currentTime) * 1000 + 150
    );
    markUserTurnAfterAiPlayback(delayMs);
  };

  const extractText = (payload?: Record<string, unknown>) => {
    if (!payload) return "";

    const keys = ["text", "transcript", "utterance", "response", "content", "message"];
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return "";
  };

  const endInterview = (reason: "user" | "inactive" | "unexpected" = "user") => {
    userEndedRef.current = reason !== "unexpected";
    endReasonRef.current = reason;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.close(1000, "client_end");
    } else {
      socketRef.current?.close();
    }

    if (silenceIntervalRef.current) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (aiPlaybackFinishTimerRef.current) {
      window.clearTimeout(aiPlaybackFinishTimerRef.current);
      aiPlaybackFinishTimerRef.current = null;
    }

    resetSilenceFlow();
    aiTurnEndedRef.current = false;
    userTurnActiveRef.current = false;

    setIsActive(false);
    setStatus("idle");
    setLastUserAudioAt(null);
    setLastAiAudioAt(null);
    stopAudio();
  };

  const sendFrontendOnlyMessage = (message: string) => {
  addMessage("agent", message);
  addLog(`Frontend message: ${message}`);
};

  const handleSilenceTick = () => {
    if (!isActiveRef.current || statusRef.current !== "live") return;
    if (!userTurnActiveRef.current) return;
    if (!aiTurnEndedRef.current) return;

    // If the user has recently spoken, keep extending their answer window.
    const userRecentlySpoke = Boolean(
      lastUserVoiceDetectedAtRef.current &&
        Date.now() - lastUserVoiceDetectedAtRef.current < 2000
    );

    if (userRecentlySpoke) {
      silenceStageRef.current = 0;
      silenceDeadlineRef.current = Date.now() + 8000;
      setSilenceCountdown(8);
      return;
    }

    if (!silenceDeadlineRef.current) return;

    const remainingMs = silenceDeadlineRef.current - Date.now();
    if (remainingMs > 0) {
      setSilenceCountdown(Math.ceil(remainingMs / 1000));
      return;
    }

    if (silenceStageRef.current === 0) {
      sendFrontendOnlyMessage("Are you there?");
      silenceStageRef.current = 1;
      silenceDeadlineRef.current = Date.now() + 5000;
      setSilenceCountdown(5);
      return;
    }

    if (silenceStageRef.current === 1) {
      sendFrontendOnlyMessage("Are you there?");
      silenceStageRef.current = 2;
      silenceDeadlineRef.current = Date.now() + 5000;
      setSilenceCountdown(5);
      return;
    }

    sendFrontendOnlyMessage("Thank you for your time. Have a good day.");
setTimeout(() => endInterview("inactive"), 1200);
  };

  const pushAudioChunk = (input: Float32Array, sampleRate: number, ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const targetRate = inputSampleRateRef.current || 16000;

    let sum = 0;
    for (let i = 0; i < input.length; i += 1) {
      const v = input[i];
      sum += v * v;
    }

    const rms = Math.sqrt(sum / Math.max(1, input.length));
    const voiceThreshold = 0.01;

    let pcm16: Int16Array;

    if (!isMuted && rms > voiceThreshold) {
      const downsampled = downsampleBuffer(input, sampleRate, targetRate);
      pcm16 = floatTo16BitPCM(downsampled);

      const now = Date.now();
      lastUserVoiceDetectedAtRef.current = now;

      if (now - lastUserAudioUiRef.current > 250) {
        lastUserAudioUiRef.current = now;
        setLastUserAudioAt(now);
      }

      // User started/continued speaking, so stop silence prompts.
      userTurnActiveRef.current = true;
      aiTurnEndedRef.current = false;
      resetSilenceFlow();
    } else {
      // If muted OR silent, do not send real voice.
      // Send silent keep-alive packet only.
      pcm16 = new Int16Array(160);
    }

    ws.send(
      JSON.stringify({
        type: "user_audio_chunk",
        user_audio_chunk: arrayBufferToBase64(pcm16.buffer),
      })
    );
  };

  const startMic = async (ws: WebSocket) => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    outputPlayTimeRef.current = ctx.currentTime;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    audioInputRef.current = source;

    await ctx.audioWorklet.addModule("/ai-interview-worklet.js");
    addLog("Audio worklet loaded.");

    const worklet = new AudioWorkletNode(ctx, "ai-interview-processor");
    audioWorkletRef.current = worklet;

    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      pushAudioChunk(event.data, ctx.sampleRate, ws);
    };

    const silentMonitor = ctx.createGain();
    silentMonitor.gain.value = 0;
    monitorGainRef.current = silentMonitor;

    source.connect(worklet);
    worklet.connect(silentMonitor);
    silentMonitor.connect(ctx.destination);
  };

  const configOverride = useMemo(
    () => ({
      // Keep overrides empty unless your agent explicitly supports them.
    }),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setView("interact");
  };

  const handleBack = () => {
    setView("configure");
    setIsActive(false);
    setStatus("idle");
    socketRef.current?.close();

    if (silenceIntervalRef.current) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (aiPlaybackFinishTimerRef.current) {
      window.clearTimeout(aiPlaybackFinishTimerRef.current);
      aiPlaybackFinishTimerRef.current = null;
    }

    resetSilenceFlow();
    aiTurnEndedRef.current = false;
    userTurnActiveRef.current = false;

    stopAudio();
  };

  const handleClearLogs = () => setEventLog([]);

  const startInterview = async () => {
    setErrorMessage(null);
    setErrorDetail(null);
    setStatus("connecting");
    userEndedRef.current = false;

    setEventLog([]);
    setMessages([]);
    setLastUserAudioAt(null);
    setLastAiAudioAt(null);
    lastUserVoiceDetectedAtRef.current = null;

    resetSilenceFlow();
    aiTurnEndedRef.current = false;
    userTurnActiveRef.current = false;

    addLog("Starting interview...");

    try {
      const response = await fetch("/api/elevenlabs/getSignedUrl");
      const data = (await response.json()) as { signedUrl?: string; message?: string };

      if (!response.ok || !data.signedUrl) {
        setStatus("error");
        setErrorMessage(data?.message || "Could not start interview.");
        addLog("Signed URL failed.");
        return;
      }

      addLog("Signed URL received.");

      const ws = new WebSocket(data.signedUrl);
      socketRef.current = ws;

      ws.onopen = async () => {
        addLog("WebSocket connected.");

        try {
          ws.send(
            JSON.stringify({
              type: "conversation_initiation_client_data",
              conversation_config_override: configOverride,
              dynamic_variables: {
                coach_name: staticCoachName,
                context_prompt: contextPrompt || "Not provided",
              },
            })
          );

          addLog("Sent conversation init payload.");

          if (!silenceIntervalRef.current) {
            silenceIntervalRef.current = window.setInterval(handleSilenceTick, 1000);
          }

          await startMic(ws);
          addLog("Microphone streaming started.");
          setIsActive(true);
          setStatus("live");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Mic init failed.";
          addLog(`Mic init error: ${message}`);
          setStatus("error");
          setErrorMessage(message);
          ws.close();
        }
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as ElevenLabsMessage;

          if (data?.type === "ping" && data.ping_event?.event_id != null) {
            ws.send(JSON.stringify({ type: "pong", event_id: data.ping_event.event_id }));
            return;
          }

          if (data?.type === "conversation_initiation_metadata") {
            const format = data.conversation_initiation_metadata_event?.agent_output_audio_format;
            const match = format?.match(/pcm_(\d+)/);
            if (match) {
              outputSampleRateRef.current = Number(match[1]);
            }

            const inputFormat =
              data.conversation_initiation_metadata_event?.user_input_audio_format;
            const inputMatch = inputFormat?.match(/pcm_(\d+)/);
            if (inputMatch) {
              inputSampleRateRef.current = Number(inputMatch[1]);
            }

            addLog(
              `Audio formats negotiated. input=${inputSampleRateRef.current} output=${outputSampleRateRef.current}`
            );
            return;
          }

          if (data?.type === "audio" && data.audio_event?.audio_base_64) {
            const pcm = base64ToInt16(data.audio_event.audio_base_64);
            playPcm(pcm, outputSampleRateRef.current || 16000);
            return;
          }

          if (data?.type === "user_transcript") {
            const text =
              extractText(data.user_transcript_event) ||
              (typeof data.user_transcript === "string" ? data.user_transcript : "");

            if (text) {
              addMessage("user", text);
            }

            addLog("WS event: user_transcript");
            return;
          }

          if (
            data?.type === "agent_response" ||
            data?.type === "agent_transcript" ||
            data?.type === "agent_response_correction"
          ) {
            const text =
              extractText(data.agent_response_event) ||
              extractText(data.agent_transcript_event) ||
              extractText(data.agent_response_correction_event) ||
              (typeof data.agent_response === "string" ? data.agent_response : "");

            if (text) {
              addMessage("agent", text);
            }

            addLog(`WS event: ${data.type}`);
            return;
          }

          if (data?.type && data.type !== "audio" && data.type !== "ping") {
            addLog(`WS event: ${data.type}`);
          }
        } catch {
          addLog("Received malformed WS message.");
        }
      };

      ws.onclose = (event) => {
        console.log("WS CLOSED:", event.code, event.reason, event.wasClean);

        setIsActive(false);

        if (silenceIntervalRef.current) {
          window.clearInterval(silenceIntervalRef.current);
          silenceIntervalRef.current = null;
        }
        if (aiPlaybackFinishTimerRef.current) {
          window.clearTimeout(aiPlaybackFinishTimerRef.current);
          aiPlaybackFinishTimerRef.current = null;
        }

        resetSilenceFlow();
        aiTurnEndedRef.current = false;
        userTurnActiveRef.current = false;

        if (userEndedRef.current || event.code === 1000) {
          setStatus("idle");
          userEndedRef.current = false;
          addLog("Interview ended normally.");
        } else {
          setStatus("error");
          const unexpectedMessage =
            "Interview ended unexpectedly. Check mic permission and agent setup.";
          setErrorMessage(unexpectedMessage);
          const detail = `Code=${event.code} Reason=${event.reason || "n/a"} Clean=${event.wasClean}`;
          setErrorDetail(detail);
          addLog(unexpectedMessage);
          addLog(`WebSocket closed unexpectedly. ${detail}`);
        }

        stopAudio();
      };

      ws.onerror = () => {
        setIsActive(false);
        setStatus("error");
        setErrorMessage("Connection to ElevenLabs failed.");
        setErrorDetail(null);
        addLog("WebSocket error.");
      };
    } catch (error) {
      setIsActive(false);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Could not start interview."
      );
      setErrorDetail(null);
      addLog("Failed to start interview.");
    }
  };

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
          </>
        ) : (
          <>
            <div className={styles.headerRow}>
              <div className={styles.interactionHeader}>
                <h2 className={styles.interactionTitle}>AI Interview</h2>
                <div className={styles.subtitle}>Voice-powered session</div>
                <div className={styles.interactionSub}>
                  Tip: If the AI agent doesn&apos;t appear within a few seconds, please
                  refresh the page.
                </div>
              </div>
              <button type="button" className={styles.backButton} onClick={handleBack}>
                Back
              </button>
            </div>

            <div className={styles.interviewLayout}>
              <aside className={styles.agentPanel}>
                <div className={styles.agentCard}>
                  <div className={styles.agentAvatar}>
                    <Image src={placeholderTeacher} alt="AI Interviewer" />
                  </div>
                  <div className={styles.agentName}>Interview Agent</div>
                  <div className={styles.agentRole}>AI Interviewer</div>
                  <div className={styles.agentDots} aria-hidden="true">
                    • • • • • •
                  </div>
                  <div className={styles.agentStatusRow}>
                    <span
                      className={`${styles.statusDot} ${isActive ? styles.statusDotLive : ""}`}
                    />
                    <span className={styles.agentStatusText}>
                      {status === "connecting"
                        ? "Connecting..."
                        : isActive
                          ? "Interview in progress"
                          : "Ready to start"}
                    </span>
                    <span className={styles.agentStatusBadge}>
                      Mic {isMuted ? "off" : "on"}
                    </span>
                    <span className={styles.agentStatusBadge}>WiFi</span>
                  </div>
                  <div className={styles.speakingRow}>
                    <div className={styles.speakingLabel}>User</div>
                    <div
                      className={`${styles.speakingWave} ${
                        isUserSpeaking ? styles.speakingWaveActive : ""
                      }`}
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className={styles.speakingLabel}>AI</div>
                    <div
                      className={`${styles.speakingWave} ${
                        isAiSpeaking ? styles.speakingWaveActive : ""
                      }`}
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div className={styles.actions}>
                    {isActive ? (
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => endInterview("user")}
                      >
                        End Interview
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.primaryAction}
                        onClick={startInterview}
                        disabled={status === "connecting"}
                      >
                        Begin Interview
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.iconButton} ${isMuted ? styles.muted : ""}`}
                      onClick={() => {
                        setIsMuted((prev) => {
                          const next = !prev;
                          addLog(next ? "Microphone muted." : "Microphone unmuted.");
                          return next;
                        });
                      }}
                      aria-pressed={isMuted}
                      title={isMuted ? "Unmute" : "Mute"}
                      aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                    >
                      {isMuted ? "\u{1F507}" : "\u{1F3A4}"}
                    </button>
                  </div>
                  <div className={styles.audioStatus}>
                    <span>
                      Mic{" "}
                      {isMuted
                        ? "off"
                        : isUserSpeaking
                          ? "sending"
                          : "idle"}
                    </span>
                    <span>
                      AI Audio {isAiSpeaking ? "receiving" : "idle"}
                    </span>
                  </div>
                </div>
              </aside>

              <main className={styles.chatPanel}>
                <div className={styles.chatHeader}>
                  <div>
                    <h3>Conversation</h3>
                    <p>Live transcript</p>
                  </div>
                </div>

                <div className={styles.chatList}>
                  {messages.length ? (
                    <>
                      {messages.map((entry) => {
                        const isUser = entry.speaker === "user";
                        return (
                          <div
                            key={entry.id}
                            className={`${styles.chatRow} ${isUser ? styles.chatRowUser : ""}`}
                          >
                            <div className={styles.chatAvatar}>
                              {isUser ? (
                                <div className={styles.userAvatar}>{userInitials}</div>
                              ) : (
                                <Image src={placeholderTeacher} alt="AI Interviewer" />
                              )}
                            </div>
                            <div className={styles.chatBubbleWrap}>
                              <div
                                className={`${styles.chatBubble} ${
                                  isUser ? styles.chatBubbleUser : styles.chatBubbleAi
                                }`}
                              >
                                {entry.text}
                              </div>
                              <div className={styles.chatTime}>
                                {new Date(entry.ts).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {isAiSpeaking ? (
                        <div className={styles.chatRow}>
                          <div className={styles.chatAvatar}>
                            <Image src={placeholderTeacher} alt="AI Interviewer" />
                          </div>
                          <div className={styles.chatBubbleWrap}>
                            <div className={`${styles.chatBubble} ${styles.chatBubbleAi}`}>
                              <span className={styles.typingDots}>
                                <span />
                                <span />
                                <span />
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {isUserSpeaking && !isAiSpeaking ? (
                        <div className={`${styles.chatRow} ${styles.chatRowUser}`}>
                          <div className={styles.chatAvatar}>
                            <div className={styles.userAvatar}>{userInitials}</div>
                          </div>
                          <div className={styles.chatBubbleWrap}>
                            <div className={`${styles.chatBubble} ${styles.chatBubbleUser}`}>
                              <span className={styles.typingDots}>
                                <span />
                                <span />
                                <span />
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className={styles.chatEmpty}>
                      Conversation will appear here once the AI and user exchange messages.
                    </div>
                  )}
                </div>

                <div className={styles.eventLogBlock}>
                  <div className={styles.eventLogHeader}>
                    <span>Session Logs</span>
                    <button
                      type="button"
                      className={styles.logAction}
                      onClick={handleClearLogs}
                      disabled={!eventLog.length}
                    >
                      Clear
                    </button>
                  </div>
                  <div className={styles.eventLog} role="log" aria-live="polite">
                    {eventLog.length ? (
                      eventLog.map((line) => {
                        const isCritical = line
                          .toLowerCase()
                          .includes("interview ended unexpectedly");
                        return (
                          <div
                            key={line}
                            className={`${styles.eventLogLine} ${
                              isCritical ? styles.eventLogCritical : ""
                            }`}
                          >
                            {line}
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.eventLogEmpty}>No logs yet.</div>
                    )}
                  </div>
                </div>

                <div className={styles.chatFooter}>
                  <span className={styles.speakingHint}>
                    {isMuted
                      ? "Mic muted"
                      : isAiSpeaking
                        ? "AI is speaking..."
                        : isUserSpeaking
                          ? "You're speaking..."
                          : "Waiting for audio..."}
                  </span>
                  <span className={styles.footerMeta}>
                    {silenceCountdown != null && userTurnActiveRef.current
                      ? `Waiting for your response... ${silenceCountdown}s`
                      : "Voice-powered interview"}
                  </span>
                </div>
              </main>
            </div>

            {errorMessage ? (
              <div className={styles.pageAlert}>
                <div className={styles.pageAlertTitle}>
                  Interview ended unexpectedly
                </div>
                <div className={styles.pageAlertBody}>
                  {errorMessage} Contact{" "}
                  <a href="tel:+918605434108">+91 86054 34108</a> to report this
                  error.
                </div>
                {errorDetail ? (
                  <div className={styles.pageAlertMeta}>{errorDetail}</div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    </Layout>
  );
}
