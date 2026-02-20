import type { NextApiRequest, NextApiResponse } from "next";

type JobItem = {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  platform: string;
  status: "Open" | "Closed";
  applyUrl: string;
  job_employment_type?: string;
};

const fetchJson = async <T>(url: string, headers?: Record<string, string>) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
};

const mapJSearch = (data: Record<string, unknown>): JobItem[] => {
  const jobs = (data?.data as Record<string, unknown>[]) || [];
  return jobs.flatMap((job, idx) => {
    const jobId = job.job_id as string | undefined;
    if (!jobId) {
      return [];
    }
    const employmentType =
      typeof job.job_employment_type === "string" && job.job_employment_type.trim()
        ? job.job_employment_type.trim()
        : Array.isArray(job.job_employment_types)
          ? job.job_employment_types
              .filter((item) => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
              .join(" / ")
          : undefined;
    const city = job.job_city as string | undefined;
    const state = job.job_state as string | undefined;
    const country = job.job_country as string | undefined;
    const location = [city, state, country].filter(Boolean).join(", ") || "Unknown";

    return {
      id: jobId,
      title: (job.job_title as string) ?? "Untitled",
      company: (job.employer_name as string) ?? "Unknown",
      location,
      postedAt: (job.job_posted_at_datetime_utc as string) ?? "",
      platform: (job.job_publisher as string) ?? "RapidAPI JSearch",
      status: "Open",
      applyUrl: (job.job_apply_link as string) ?? "#",
      job_employment_type: employmentType,
    } satisfies JobItem;
  });
};

const dedupeJobs = (jobs: JobItem[]) => {
  const seen = new Map<string, JobItem>();
  for (const job of jobs) {
    const key = job.applyUrl && job.applyUrl !== "#"
      ? job.applyUrl
      : `${job.title}-${job.company}-${job.location}`;
    if (!seen.has(key)) {
      seen.set(key, job);
    }
  }
  return Array.from(seen.values());
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ jobs: JobItem[] } | { message: string }>
) {
  try {
    const rapidApiKey = process.env.RAPIDAPI_KEY ?? process.env.NEXT_PUBLIC_RAPIDAPI_KEY;
    const rapidApiHost =
      process.env.RAPIDAPI_HOST ??
      process.env.NEXT_PUBLIC_RAPIDAPI_HOST ??
      "jsearch.p.rapidapi.com";

    if (!rapidApiKey) {
      return res.status(500).json({ message: "Missing RAPIDAPI_KEY" });
    }

    const { search, pages, page, limit } = req.query;
    const query = typeof search === "string" && search.trim()
      ? search.trim()
      : "teacher jobs in india";
    const requestedLimit = typeof limit === "string" ? Number(limit) : Number.NaN;
    const jobLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.floor(requestedLimit)
      : 10;
    const requestedPages = typeof pages === "string" ? Number(pages) : Number.NaN;
    const requestedPage = typeof page === "string" ? Number(page) : Number.NaN;
    const defaultPages = jobLimit > 10
      ? Math.min(10, Math.ceil(jobLimit / 10))
      : 1;
    const numPages = Number.isFinite(requestedPages) && requestedPages > 0
      ? Math.floor(requestedPages)
      : defaultPages;
    const pageNumber = Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.floor(requestedPage)
      : 1;

    const url = new URL("https://jsearch.p.rapidapi.com/search");
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(pageNumber));
    url.searchParams.set("num_pages", String(numPages));

    const result = await fetchJson<Record<string, unknown>>(url.toString(), {
      "x-rapidapi-key": rapidApiKey,
      "x-rapidapi-host": rapidApiHost,
    });

    const jobs = dedupeJobs(mapJSearch(result)).filter(
      (job) => job.applyUrl && job.applyUrl !== "#"
    );

    return res.status(200).json({ jobs: jobs.slice(0, jobLimit) });
  } catch (error) {
    console.error("Failed to fetch jobs", error);
    const message = error instanceof Error ? error.message : "Failed to fetch jobs";
    return res.status(500).json({ message });
  }
}
