import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Layout from "@/components/Layout/Layout";
import styles from "./AIInterview.module.css";
import placeholderTeacher from "../../../public/placeholder-teacher.jpg";

type ViewMode = "configure" | "interact";

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
  const [lastUserAudioAt, setLastUserAudioAt] = useState<number | null>(null);
  const [lastAiAudioAt, setLastAiAudioAt] = useState<number | null>(null);
  const isUserSpeaking = Boolean(lastUserAudioAt && Date.now() - lastUserAudioAt < 1200);
  const isAiSpeaking = Boolean(lastAiAudioAt && Date.now() - lastAiAudioAt < 1200);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSampleRateRef = useRef<number>(16000);
  const outputSampleRateRef = useRef<number>(16000);
  const outputPlayTimeRef = useRef<number>(0);
  const userEndedRef = useRef(false);
  const lastUserAudioUiRef = useRef(0);
  const lastAiAudioUiRef = useRef(0);
  const silenceStageRef = useRef(0);
  const silenceDeadlineRef = useRef<number | null>(null);
  const silenceIntervalRef = useRef<number | null>(null);
  const staticCoachName = "AI Interview Assistant";

  useEffect(
    () => () => {
      socketRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioWorkletRef.current?.disconnect();
      audioInputRef.current?.disconnect();
      audioContextRef.current?.close();
      if (silenceIntervalRef.current) {
        window.clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
    },
    []
  );

  const stopAudio = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioWorkletRef.current?.disconnect();
    audioInputRef.current?.disconnect();
    audioContextRef.current?.close();
  };

  const sendAgentText = (message: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "user_message",
        text: message,
      })
    );
    addLog(`Sent: ${message}`);
  };

  const handleSilenceTick = () => {
    if (!isActive || status !== "live") return;
    if (!lastAiAudioAt) return;
    if (isAiSpeaking) return;

    if (lastUserAudioAt && lastUserAudioAt > lastAiAudioAt) {
      silenceStageRef.current = 0;
      silenceDeadlineRef.current = null;
      return;
    }

    if (!silenceDeadlineRef.current) {
      silenceDeadlineRef.current = lastAiAudioAt + 8000;
    }
    if (Date.now() < silenceDeadlineRef.current) return;

    if (silenceStageRef.current === 0) {
      sendAgentText("Are you there?");
      silenceStageRef.current = 1;
      silenceDeadlineRef.current = Date.now() + 8000;
      return;
    }
    if (silenceStageRef.current === 1) {
      sendAgentText("Are you there?");
      silenceStageRef.current = 2;
      silenceDeadlineRef.current = Date.now() + 8000;
      return;
    }

    sendAgentText(
      "I think there might be some issues or we lost you during the interview. Thanks for your time. Ending the interview now."
    );
    endInterview();
  };

  const addLog = (message: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    setEventLog((prev) => {
      const next = [...prev, entry];
      return next.length > 200 ? next.slice(-200) : next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setView("interact");
  };

  const handleBack = () => {
    setView("configure");
    setIsActive(false);
    setStatus("idle");
    socketRef.current?.close();
    stopAudio();
  };

  const downsampleBuffer = (buffer: Float32Array, rate: number, targetRate: number) => {
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
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
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

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
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
  };

  const pushAudioChunk = (input: Float32Array, sampleRate: number, ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN || isMuted) return;
    const targetRate = inputSampleRateRef.current || 16000;
    const downsampled = downsampleBuffer(input, sampleRate, targetRate);
    const pcm16 = floatTo16BitPCM(downsampled);
    const base64 = arrayBufferToBase64(pcm16.buffer);
    ws.send(
      JSON.stringify({
        type: "user_audio_chunk",
        user_audio_chunk: base64,
      })
    );
    const now = Date.now();
    if (now - lastUserAudioUiRef.current > 800) {
      lastUserAudioUiRef.current = now;
      setLastUserAudioAt(now);
    }
    silenceStageRef.current = 0;
    silenceDeadlineRef.current = null;
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
    worklet.port.onmessage = (event) => {
      const chunk = event.data as Float32Array;
      pushAudioChunk(chunk, ctx.sampleRate, ws);
    };

    source.connect(worklet);
    worklet.connect(ctx.destination);
  };

  const configOverride = useMemo(
    () => ({
      // Keep overrides empty unless your agent config explicitly allows them.
      // ElevenLabs can reject prompt overrides depending on agent settings.
    }),
    []
  );
  const hasCriticalLog = useMemo(
    () =>
      eventLog.some((line) =>
        line.toLowerCase().includes("interview ended unexpectedly")
      ),
    [eventLog]
  );

  const startInterview = async () => {
    setErrorMessage(null);
    setErrorDetail(null);
    setStatus("connecting");
    userEndedRef.current = false;
    setEventLog([]);
    setLastUserAudioAt(null);
    setLastAiAudioAt(null);
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
          silenceStageRef.current = 0;
          silenceDeadlineRef.current = null;
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
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type?: string;
            ping_event?: { event_id?: number };
            audio_event?: { audio_base_64?: string };
            conversation_initiation_metadata_event?: {
              agent_output_audio_format?: string;
              user_input_audio_format?: string;
            };
          };
          if (data?.type === "ping" && data.ping_event?.event_id != null) {
            ws.send(JSON.stringify({ type: "pong", event_id: data.ping_event.event_id }));
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
          }
          if (data?.type === "audio" && data.audio_event?.audio_base_64) {
            const pcm = base64ToInt16(data.audio_event.audio_base_64);
            playPcm(pcm, outputSampleRateRef.current || 16000);
            const now = Date.now();
            if (now - lastAiAudioUiRef.current > 800) {
              lastAiAudioUiRef.current = now;
              setLastAiAudioAt(now);
            }
            silenceStageRef.current = 0;
            silenceDeadlineRef.current = null;
          }
          if (data?.type && data.type !== "audio" && data.type !== "ping") {
            addLog(`WS event: ${data.type}`);
          }
        } catch {
          addLog("Received malformed WS message.");
        }
      };
      ws.onclose = (event) => {
        setIsActive(false);
        if (userEndedRef.current) {
          setStatus("idle");
          userEndedRef.current = false;
          addLog("Interview ended by user.");
        } else {
          setStatus("error");
          const unexpectedMessage =
            "Interview ended unexpectedly. Check mic permission and agent setup.";
          setErrorMessage(unexpectedMessage);
          const detail = `Code=${event.code} Reason=${event.reason || "n/a"} Clean=${event.wasClean}`;
          setErrorDetail(detail);
          addLog(unexpectedMessage);
          addLog(
            `WebSocket closed unexpectedly. ${detail}`
          );
        }
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

  const endInterview = () => {
    userEndedRef.current = true;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.close(1000, "client_end");
    } else {
      socketRef.current?.close();
    }
    if (silenceIntervalRef.current) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    silenceStageRef.current = 0;
    silenceDeadlineRef.current = null;
    setIsActive(false);
    setStatus("idle");
    stopAudio();
  };

  const handleClearLogs = () => setEventLog([]);

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
                      className={`${styles.speakingWave} ${isUserSpeaking ? styles.speakingWaveActive : ""}`}
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className={styles.speakingLabel}>AI</div>
                    <div
                      className={`${styles.speakingWave} ${isAiSpeaking ? styles.speakingWaveActive : ""}`}
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
                        onClick={endInterview}
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
                      {lastUserAudioAt && Date.now() - lastUserAudioAt < 2000
                        ? "sending"
                        : "idle"}
                    </span>
                    <span>
                      AI Audio{" "}
                      {lastAiAudioAt && Date.now() - lastAiAudioAt < 2000
                        ? "receiving"
                        : "idle"}
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
                  <div className={styles.chatEmpty}>
                    Conversation will appear here once the AI and user exchange messages.
                  </div>
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
                    {isUserSpeaking ? "You're speaking..." : "Waiting for audio..."}
                  </span>
                  <span className={styles.footerMeta}>Voice-powered interview</span>
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

