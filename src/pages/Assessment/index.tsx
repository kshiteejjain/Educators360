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

const parseQuestions = (content: string): ParsedQuestion[] => {
  const lines = content.split(/\r?\n/).map((line) => line.replace(/\r$/, ""));

  const items: ParsedQuestion[] = [];
  let current: { questionLines: string[]; whyLines: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const question = current.questionLines.join("\n").trim();
    const why = current.whyLines.join("\n").trim();
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
    const trimmed = line.trim();
    if (!trimmed || /^-{3,}$/.test(trimmed)) {
      if (current) {
        if (current.whyLines.length > 0) {
          current.whyLines.push("");
        } else {
          current.questionLines.push("");
        }
      }
      return;
    }
    const qMatch =
      trimmed.match(/^(?:\*\*)?\s*(\d{1,2})[\.)-]\s*(.+)$/i) ||
      trimmed.match(/^(?:\*\*)?\s*(?:question|q)\s*(\d{1,2})\s*[:\.)-]\s*(.+)$/i);
    const whyMatch = trimmed.match(
      /^(?:\*\*)?(?:why this matters)\s*[:\-]?\s*(.+)$/i
    );

    if (qMatch) {
      pushCurrent();
      current = { questionLines: [qMatch[2]], whyLines: [] };
      return;
    }

    if (whyMatch && current) {
      current.whyLines.push(whyMatch[1]);
      return;
    }

    if (current) {
      if (trimmed.toLowerCase().startsWith("why this matters")) {
        current.whyLines.push(
          trimmed.replace(/^(?:\*\*)?why this matters\s*[:\-]?\s*/i, "")
        );
      } else if (current.whyLines.length === 0) {
        current.questionLines.push(trimmed);
      } else {
        current.whyLines.push(trimmed);
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

const getInlineClass = (value: string) => {
  const cleaned = value.replace(/\*\*/g, "").trim();
  if (/pillar\s*:?\s*$/i.test(cleaned)) return styles.questionCategory;
  if (/^question\s*:/i.test(cleaned)) return styles.questionLabel;
  return undefined;
};

const formatInline = (value: string) => {
  const className = getInlineClass(value);
  const parts: Array<{ text: string; bold?: boolean; className?: string }> = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), className });
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push({ text: token.slice(2, -2), bold: true, className });
    } else {
      parts.push({ text: token.slice(1, -1), bold: true, className });
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), className });
  }
  return parts;
};

const renderInline = (value: string) =>
  formatInline(value).map((part, index) =>
    part.bold ? (
      <strong key={`b-${index}`} className={part.className}>
        {part.text}
      </strong>
    ) : (
      <span key={`t-${index}`} className={part.className}>
        {part.text}
      </span>
    )
  );

const renderPreservedText = (value: string) => {
  const lines = value.split(/\r?\n/);
  return (
    <div className={styles.preserveText}>
      {lines.map((line, index) => (
        <span key={`preserve-${index}`}>
          {renderInline(line)}
          {index < lines.length - 1}
        </span>
      ))}
    </div>
  );
};

const renderRichText = (value: string) => {
  const normalizedValue = value.replace(/([^\n])\s*(#{1,6}\s+)/g, "$1\n$2");
  const lines = normalizedValue
    .split(/\r?\n/)
    .map((line) => line.trim());
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

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
    if (!line) {
      flushList();
      blocks.push(<div key={`spacer-${index}`} className={styles.reportSpacer} />);
      return;
    }
    const trimmedLine = line.replace(/^\*\s+/, "").trim();
    const headingMatch = trimmedLine.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(6, headingMatch[0].split(" ")[0].length);
      const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(
        <Heading key={`h-${index}`} className={styles.richHeading}>
          {renderInline(headingMatch[1])}
        </Heading>
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
  onImageReady?: (dataUrl: string) => void;
};

const ScorecardChart = ({ labels, values, onImageReady }: ScorecardChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<"bar"> | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);
  const onImageReadyRef = useRef<ScorecardChartProps["onImageReady"]>(onImageReady);
  const capturedSignatureRef = useRef<string>("");

  useEffect(() => {
    onImageReadyRef.current = onImageReady;
  }, [onImageReady]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    if (captureTimeoutRef.current) {
      window.clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }

    const signature = `${labels.join("|")}__${values.join("|")}`;
    capturedSignatureRef.current = "";

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
        animation: { duration: 0 },
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
    if (onImageReadyRef.current) {
      captureTimeoutRef.current = window.setTimeout(() => {
        if (!chartRef.current || !onImageReadyRef.current) return;
        if (capturedSignatureRef.current === signature) return;
        capturedSignatureRef.current = signature;
        onImageReadyRef.current(chartRef.current.toBase64Image());
      }, 0);
    }
    return () => {
      if (captureTimeoutRef.current) {
        window.clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }
      chartRef.current?.destroy();
    };
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

const normalizeScore = (raw: number) => {
  if (!Number.isFinite(raw)) return null;
  if (raw > 10) {
    const scaled = Math.round(raw / 10);
    return Math.max(0, Math.min(10, scaled));
  }
  return Math.max(0, Math.min(10, raw));
};

const extractScoreLines = (lines: string[]) =>
  lines
    .map((line) => line.replace(/^[-\u2022\u2013\u2014\u25B8]\s*/, ""))
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
        /^\|?\s*([^|]+?)\s*\|\s*(\d{1,3})(?:\s*\/\s*\d{1,3})?\s*\|?\s*$/
      );
      if (tableMatch) {
        const score = normalizeScore(Number(tableMatch[2]));
        if (score === null) return null;
        return { label: tableMatch[1].trim(), score };
      }
      const colonMatch = cleaned.match(
        /^(.+?)\s*[:\-–—]\s*(\d{1,3})(?:\s*\/\s*\d{1,3})?\s*$/
      );
      if (colonMatch) {
        const score = normalizeScore(Number(colonMatch[2]));
        if (score === null) return null;
        return { label: colonMatch[1].trim(), score };
      }
      const parenMatch = cleaned.match(/^(.+?)\s*\(\s*(\d{1,3})\s*\/\s*\d{1,3}\s*\)\s*$/);
      if (parenMatch) {
        const score = normalizeScore(Number(parenMatch[2]));
        if (score === null) return null;
        return { label: parenMatch[1].trim(), score };
      }
      return null;
    })
    .filter(Boolean) as Array<{ label: string; score: number }>;

const parseReportSections = (text: string) => {
  const lines = text.split(/\r?\n/);
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
  if (key.includes("identity") || key.includes("persona")) return "\u{1F9ED}";
  if (key.includes("scorecard")) return "\u{1F4CA}";
  if (key.includes("strength") || key.includes("superpower")) return "\u{1F4AA}";
  if (key.includes("growth") || key.includes("gap")) return "\u{1F9E9}";
  if (key.includes("strategy")) return "\u{1F5FA}\u{FE0F}";
  if (key.includes("action") || key.includes("roadmap")) return "\u{1F6E0}\u{FE0F}";
  if (key.includes("conclusion")) return "\u{2705}";
  return "\u{1F4DD}";
};

const renderFullReport = (text: string) => {
  if (!text) return null;
  return <div className={styles.reportFullText}>{renderPreservedText(text)}</div>;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inlineToHtml = (value: string) =>
  escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const markdownToHtml = (value: string) => {
  const lines = value.split(/\r?\n/);
  const htmlBlocks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    htmlBlocks.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      flushList();
      htmlBlocks.push('<div style="height:8px"></div>');
      return;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(6, headingMatch[1].length);
      htmlBlocks.push(`<h${level}>${inlineToHtml(headingMatch[2])}</h${level}>`);
      return;
    }
    const bulletMatch = line.match(/^-+\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(`<li>${inlineToHtml(bulletMatch[1])}</li>`);
      return;
    }
    flushList();
    htmlBlocks.push(`<p>${inlineToHtml(line)}</p>`);
  });

  flushList();
  return htmlBlocks.join("");
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

type DocxRun = { text: string; bold?: boolean };
type DocxParagraph =
  | { type: "heading"; level: number; runs: DocxRun[] }
  | { type: "bullet"; runs: DocxRun[] }
  | { type: "paragraph"; runs: DocxRun[] }
  | { type: "blank" };

const parseBoldRuns = (value: string) => {
  const runs: DocxRun[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (match.index > lastIndex) {
      runs.push({ text: value.slice(lastIndex, match.index) });
    }
    runs.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    runs.push({ text: value.slice(lastIndex) });
  }
  return runs;
};

const parseMarkdownToParagraphs = (text: string): DocxParagraph[] => {
  const lines = text.split(/\r?\n/);
  const blocks: DocxParagraph[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      blocks.push({ type: "blank" });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      blocks.push({
        type: "heading",
        level,
        runs: parseBoldRuns(headingMatch[2]),
      });
      continue;
    }

    const bulletMatch = line.match(/^-+\s+(.*)$/);
    if (bulletMatch) {
      blocks.push({ type: "bullet", runs: parseBoldRuns(bulletMatch[1]) });
      continue;
    }

    blocks.push({ type: "paragraph", runs: parseBoldRuns(line) });
  }

  return blocks;
};

const renderRunsXml = (runs: DocxRun[]) =>
  runs
    .map((run) => {
      const text = escapeXml(run.text);
      const bold = run.bold ? "<w:rPr><w:b /></w:rPr>" : "";
      return `<w:r>${bold}<w:t xml:space="preserve">${text}</w:t></w:r>`;
    })
    .join("");

const buildDocxDocumentXml = (
  text: string,
  includeImage: boolean,
  imageWidthEmu: number,
  imageHeightEmu: number
) => {
  const paragraphs = parseMarkdownToParagraphs(text).map((block, index) => {
    if (block.type === "blank") return `<w:p />`;
    if (block.type === "heading") {
      return `<w:p><w:pPr><w:pStyle w:val="Heading${block.level}" /></w:pPr>${renderRunsXml(
        block.runs
      )}</w:p>`;
    }
    if (block.type === "bullet") {
      return `<w:p>${renderRunsXml([{ text: "• " }, ...block.runs])}</w:p>`;
    }
    return `<w:p>${renderRunsXml(block.runs)}</w:p>`;
  });

  const imageBlock = includeImage
    ? `
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0"
              xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
              <wp:extent cx="${imageWidthEmu}" cy="${imageHeightEmu}" />
              <wp:docPr id="1" name="Scorecard Chart" />
              <wp:cNvGraphicFramePr>
                <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" />
              </wp:cNvGraphicFramePr>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:nvPicPr>
                      <pic:cNvPr id="0" name="chart.png" />
                      <pic:cNvPicPr />
                    </pic:nvPicPr>
                    <pic:blipFill>
                      <a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" />
                      <a:stretch><a:fillRect /></a:stretch>
                    </pic:blipFill>
                    <pic:spPr>
                      <a:xfrm>
                        <a:off x="0" y="0" />
                        <a:ext cx="${imageWidthEmu}" cy="${imageHeightEmu}" />
                      </a:xfrm>
                      <a:prstGeom prst="rect"><a:avLst /></a:prstGeom>
                    </pic:spPr>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>
    `
    : "";

  return `
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        <w:p>
          <w:r>
            <w:rPr><w:b /><w:sz w:val="32" /></w:rPr>
            <w:t>Professional Growth Report</w:t>
          </w:r>
        </w:p>
        ${imageBlock}
        ${paragraphs.join("\n")}
        <w:sectPr>
          <w:pgSz w:w="12240" w:h="15840" />
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0" />
        </w:sectPr>
      </w:body>
    </w:document>
  `.trim();
};

const buildDocxContentTypesXml = (includeImage: boolean) => `
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
    <Default Extension="xml" ContentType="application/xml" />
    ${includeImage ? '<Default Extension="png" ContentType="image/png" />' : ""}
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml" />
  </Types>
`.trim();

const buildDocxRelsXml = () => `
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
  </Relationships>
`.trim();

const buildDocxDocumentRelsXml = (includeImage: boolean) => `
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${
      includeImage
        ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png" />'
        : ""
    }
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" />
  </Relationships>
`.trim();

const buildDocxStylesXml = () => `
  <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
      <w:name w:val="Normal" />
      <w:qFormat />
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" />
        <w:sz w:val="22" />
      </w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Heading1">
      <w:name w:val="heading 1" />
      <w:basedOn w:val="Normal" />
      <w:qFormat />
      <w:rPr>
        <w:b />
        <w:sz w:val="32" />
      </w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Heading2">
      <w:name w:val="heading 2" />
      <w:basedOn w:val="Normal" />
      <w:qFormat />
      <w:rPr>
        <w:b />
        <w:sz w:val="28" />
      </w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Heading3">
      <w:name w:val="heading 3" />
      <w:basedOn w:val="Normal" />
      <w:qFormat />
      <w:rPr>
        <w:b />
        <w:sz w:val="26" />
      </w:rPr>
    </w:style>
  </w:styles>
`.trim();

const getImageSize = (dataUrl: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("Failed to load chart image."));
    img.src = dataUrl;
  });

const buildReportDocx = async (text: string, chartDataUrl?: string) => {
  const JSZip = (await import("jszip")).default;
  const includeImage = Boolean(chartDataUrl);
  let widthEmu = 600 * 9525;
  let heightEmu = 300 * 9525;

  if (includeImage && chartDataUrl) {
    try {
      const size = await getImageSize(chartDataUrl);
      const maxWidthEmu = Math.round(6.5 * 914400);
      const targetWidthEmu = Math.round(size.width * 9525);
      const targetHeightEmu = Math.round(size.height * 9525);
      if (targetWidthEmu > maxWidthEmu) {
        const ratio = maxWidthEmu / targetWidthEmu;
        widthEmu = Math.round(targetWidthEmu * ratio);
        heightEmu = Math.round(targetHeightEmu * ratio);
      } else {
        widthEmu = targetWidthEmu;
        heightEmu = targetHeightEmu;
      }
    } catch {
      // fallback to default sizes
    }
  }

  const zip = new JSZip();
  zip.file("[Content_Types].xml", buildDocxContentTypesXml(includeImage));
  zip.folder("_rels")?.file(".rels", buildDocxRelsXml());
  zip.folder("word")?.file("styles.xml", buildDocxStylesXml());
  zip.folder("word")?.file(
    "document.xml",
    buildDocxDocumentXml(text, includeImage, widthEmu, heightEmu)
  );
  zip
    .folder("word")
    ?.folder("_rels")
    ?.file("document.xml.rels", buildDocxDocumentRelsXml(includeImage));

  if (includeImage && chartDataUrl) {
    const base64 = chartDataUrl.split(",")[1] || "";
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    zip.folder("word")?.folder("media")?.file("image1.png", binary);
  }

  return zip.generateAsync({ type: "blob" });
};

export default function Assessment() {
  const { withLoader } = useLoader();
  const [view, setView] = useState<ViewMode>("cards");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [report, setReport] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const reportSectionRef = useRef<HTMLDivElement | null>(null);

  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string>("");
  const [reportChartDataUrl, setReportChartDataUrl] = useState("");
  const handleChartImageReady = useMemo(
    () => (dataUrl: string) =>
      setReportChartDataUrl((prev) => (prev === dataUrl ? prev : dataUrl)),
    []
  );

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
  const reportScoreLines = useMemo(
    () => extractScoreLines(report.split(/\r?\n/)),
    [report]
  );
  useEffect(() => {
    if (reportScoreLines.length === 0) {
      setReportChartDataUrl("");
    }
  }, [reportScoreLines.length]);

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
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const downloadReportAsWord = async () => {
    let chartDataUrl = reportChartDataUrl;
    if (!chartDataUrl && reportSectionRef.current) {
      const canvas = reportSectionRef.current.querySelector("canvas");
      if (canvas && typeof (canvas as HTMLCanvasElement).toDataURL === "function") {
        chartDataUrl = (canvas as HTMLCanvasElement).toDataURL("image/png");
      }
    }
    const blob = await buildReportDocx(report, chartDataUrl);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assessment-report.docx";
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
              <h2 className={styles.questionsTitle}>{"\u{1F9E0}"} Assessment Questions</h2>
              <button type="button" className={styles.backButton} onClick={handleBackToCards}>
                Back to cards
              </button>
            </div>

            {speechError && (
              <div className={styles.speechError}>{speechError}</div>
            )}
            <form className={styles.questionsList} onSubmit={handleSubmit}>
              {!hasQuestions && result && (
                <div className={styles.questionCard}>
                  <div className={styles.questionText}>{renderPreservedText(result)}</div>
                </div>
              )}
              {questions.map((item, index) => {
                const isRecording = recordingQuestionId === item.id;
                return (
                  <div key={item.id} className={styles.questionCard}>
                    <div className={styles.questionMeta}>Question {index + 1}</div>
                    <div className={styles.questionText}>{renderPreservedText(item.question)}</div>
                    {item.why && (
                      <div className={styles.questionWhy}>
                        <strong>Why this matters:</strong> {renderPreservedText(item.why)}
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
                                        {isRecording && (
                      <div className={styles.speechHint}>Recording... click button again to stop.</div>
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
          <div className={styles.reportSection} ref={reportSectionRef}>
            <div className={styles.questionsHeader}>
              <h2 className={styles.questionsTitle}>{"\u{1F4D8}"} Professional Growth Report</h2>
              <div className={styles.downloadButtons}>
                <button type="button" className={styles.backButton} onClick={downloadReportAsWord}>
                  Download Report
                </button>
                <button type="button" className={styles.backButton} onClick={handleBackToCards}>
                  Back to cards
                </button>
              </div>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.reportBody}>
              <div className={styles.reportLayout}>
                <div className={styles.reportHero}>
                  <div className={styles.reportHeroHeader}>
                    <span className={styles.reportHeroIcon} aria-hidden="true">{"\u{1F4D8}"}</span>
                    <div>
                      <h3 className={styles.reportHeroTitle}>
                        Professional Growth Report
                      </h3>
                      <p className={styles.reportHeroSubtitle}>
                        Evidence-backed insights, growth priorities, and next-step actions.
                      </p>
                    </div>
                  </div>
                  {reportScoreLines.length > 0 && (
                    <div className={styles.reportHeroChart}>
                      <ScorecardChart
                        labels={reportScoreLines.map((line) => line.label)}
                        values={reportScoreLines.map((line) => line.score)}
                        onImageReady={handleChartImageReady}
                      />
                    </div>
                  )}
                </div>
                <div className={styles.reportGrid}>
                  <div className={styles.reportRow}>
                    <div className={styles.reportCardBody}>{renderRichText(report)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </Layout>
  );
}
