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
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1122 });
    await page.setContent(htmlWithBase, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");

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
