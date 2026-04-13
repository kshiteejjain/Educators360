import type { NextApiRequest, NextApiResponse } from "next";
import puppeteer, { type Browser } from "puppeteer";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

type PdfRequest = {
  html?: string;
  filename?: string;
  baseUrl?: string;
};

const ubuntuFonts = [
  { file: "Ubuntu-Light", weight: 300, style: "normal" },
  { file: "Ubuntu-LightItalic", weight: 300, style: "italic" },
  { file: "Ubuntu-Regular", weight: 400, style: "normal" },
  { file: "Ubuntu-Italic", weight: 400, style: "italic" },
  { file: "Ubuntu-Medium", weight: 500, style: "normal" },
  { file: "Ubuntu-MediumItalic", weight: 500, style: "italic" },
  { file: "Ubuntu-Bold", weight: 700, style: "normal" },
  { file: "Ubuntu-BoldItalic", weight: 700, style: "italic" },
];

const buildUbuntuFontCss = async () => {
  const fontRoot = path.join(process.cwd(), "public", "fonts");
  const faces: string[] = [];
  for (const font of ubuntuFonts) {
    const woff2Path = path.join(fontRoot, `${font.file}.woff2`);
    const woffPath = path.join(fontRoot, `${font.file}.woff`);
    let woff2Data = "";
    let woffData = "";
    try {
      const file = await readFile(woff2Path);
      woff2Data = file.toString("base64");
    } catch {
      woff2Data = "";
    }
    try {
      const file = await readFile(woffPath);
      woffData = file.toString("base64");
    } catch {
      woffData = "";
    }
    if (!woff2Data && !woffData) continue;
    const sources = [
      woff2Data
        ? `url("data:font/woff2;base64,${woff2Data}") format("woff2")`
        : "",
      woffData ? `url("data:font/woff;base64,${woffData}") format("woff")` : "",
    ]
      .filter(Boolean)
      .join(", ");
    faces.push(
      `@font-face{font-family:"Ubuntu";src:${sources};font-weight:${font.weight};font-style:${font.style};font-display:swap;}`
    );
  }
  return faces.length ? `<style>${faces.join("\n")}</style>` : "";
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  const { html, filename, baseUrl } = (req.body ?? {}) as PdfRequest;
  if (!html || typeof html !== "string") {
    res.status(400).json({ message: "Missing HTML content." });
    return;
  }

  const safeFilename =
    typeof filename === "string" && filename.trim()
      ? filename.trim().replace(/[^a-z0-9\-_.]/gi, "_")
      : "resume.pdf";

  const hasHead = /<head[^>]*>/i.test(html);
  const baseTag =
    baseUrl && typeof baseUrl === "string"
      ? `<base href="${baseUrl.replace(/"/g, "&quot;")}/">`
      : "";
  const inlineFonts = await buildUbuntuFontCss();
  const htmlWithBase = hasHead
    ? html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${inlineFonts}`)
    : `${baseTag}${inlineFonts}${html}`;

  let browser: Browser | null = null;
  try {
    // eslint-disable-next-line no-console
    console.log("PDF request", {
      htmlLength: html.length,
      filename: safeFilename,
      baseUrl: baseUrl || null,
    });
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch (launchError) {
      // Fallback for serverless environments that don't have Chrome installed.
      const chromium = await import("@sparticuz/chromium");
      const puppeteerCore = await import("puppeteer-core");
      browser = await puppeteerCore.launch({
        args: chromium.default.args,
        defaultViewport: chromium.default.defaultViewport,
        executablePath: await chromium.default.executablePath(),
        headless: chromium.default.headless,
      });
      // Re-throw if fallback also fails.
      if (!browser) {
        throw launchError;
      }
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1122 });
    await page.setContent(htmlWithBase, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    await page.evaluate(async () => {
      if ("fonts" in document) {
        await (document as Document & { fonts: FontFaceSet }).fonts.ready;
      }
    });

    await page.evaluate(() => {
      const wrapper = document.querySelector<HTMLElement>('[data-resume-template="navy"]');
      if (!wrapper) return;
      const main = wrapper.querySelector<HTMLElement>("[data-resume-main]");
      if (!main) return;

      const parseLengthToPx = (value: string) => {
        const raw = value.trim();
        if (!raw) return 0;
        const number = Number.parseFloat(raw);
        if (Number.isNaN(number)) return 0;
        if (raw.endsWith("mm")) return (number * 96) / 25.4;
        if (raw.endsWith("cm")) return (number * 96) / 2.54;
        if (raw.endsWith("in")) return number * 96;
        return number;
      };

      const style = window.getComputedStyle(wrapper);
      const pageHeightPx = parseLengthToPx(style.getPropertyValue("--navy-page-height")) || 1122;
      const pageTopPaddingPx = 24;
      const certExtraPaddingPx = 12;

      const blocks = Array.from(main.querySelectorAll<HTMLElement>("[data-page-block]"));
      blocks.forEach((block) => {
        block.style.marginTop = "";
        block.removeAttribute("data-page-offset");
      });

      const wrapperRect = wrapper.getBoundingClientRect();

      blocks.forEach((block) => {
        const rect = block.getBoundingClientRect();
        const top = rect.top - wrapperRect.top;
        const height = rect.height;
        if (height <= 0) return;
        const pageBottom = (Math.floor(top / pageHeightPx) + 1) * pageHeightPx;
        if (top < pageBottom && top + height > pageBottom) {
          if (height > pageHeightPx * 0.9) return;
          const isCertSection = block.dataset.section === "certifications";
          const extra = isCertSection ? certExtraPaddingPx : 0;
          const offset = pageBottom - top + pageTopPaddingPx + extra;
          block.style.marginTop = `${Math.ceil(offset)}px`;
          block.setAttribute("data-page-offset", "true");
        }
      });

      const totalHeight = wrapper.scrollHeight;
      const totalPages = Math.max(1, Math.ceil(totalHeight / pageHeightPx));
      wrapper.style.setProperty("--navy-page-height", `${pageHeightPx}px`);
      wrapper.style.minHeight = `${totalPages * pageHeightPx}px`;
    });

    try {
      await page.waitForSelector("img", { timeout: 5000 });
      await page.evaluate(async () => {
        const images = Array.from(document.images);
        await Promise.all(
          images.map(
            (img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                  })
          )
        );
      });
    } catch {
      // Continue even if images fail to load.
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0px",
        bottom: "0px",
        left: "0px",
        right: "0px",
      },
      preferCSSPageSize: true,
    });

    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", pdfBuffer.length.toString());
    res.status(200).send(pdfBuffer);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("PDF generation failed", error);
    res.status(500).json({
      message: "PDF generation failed.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
