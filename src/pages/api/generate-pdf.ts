import type { NextApiRequest, NextApiResponse } from "next";
import puppeteer, { type Browser } from "puppeteer";

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
  const htmlWithBase = hasHead
    ? html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
    : `${baseTag}${html}`;

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

    await page.evaluate(() => {
      const navyWrapper = document.querySelector<HTMLElement>("[data-resume-template=\"navy\"]");
      if (!navyWrapper) {
        return;
      }
      const navyMain = navyWrapper.querySelector<HTMLElement>("[data-resume-main]");
      const navySidebar = navyWrapper.querySelector<HTMLElement>("[data-resume-sidebar]");
      if (!navyMain || !navySidebar) {
        return;
      }

      const pageHeightRaw = getComputedStyle(navyWrapper).getPropertyValue("--navy-page-height");
      const pageHeight = Number(pageHeightRaw.replace("px", "").trim());
      if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
        return;
      }

      const blocks = navyMain.querySelectorAll<HTMLElement>("[data-page-block]");
      blocks.forEach((block) => block.classList.remove("pageBreakStart"));

      let lastPageIndex = 0;
      blocks.forEach((block, index) => {
        const top = block.offsetTop;
        const pageIndex = Math.floor((top + 1) / pageHeight);
        if (index > 0 && pageIndex > lastPageIndex) {
          block.classList.add("pageBreakStart");
        }
        lastPageIndex = Math.max(lastPageIndex, pageIndex);
      });

      const contentHeight = Math.max(navyMain.scrollHeight, navySidebar.scrollHeight);
      const pageCount = Math.max(1, Math.ceil(contentHeight / pageHeight));
      const fullHeight = pageCount * pageHeight;
      navyWrapper.style.minHeight = `${fullHeight}px`;
      navySidebar.style.minHeight = `${fullHeight}px`;
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
