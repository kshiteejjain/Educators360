import type { NextApiRequest, NextApiResponse } from "next";

type JobDetails = {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  description: string;
  applyUrl?: string;
  companyWebsite?: string;
  employmentType?: string;
  salary?: string;
};

const fetchJson = async <T>(url: string, headers?: Record<string, string>) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    let detail = "";
    try {
      const bodyText = await response.text();
      detail = bodyText ? ` - ${bodyText.slice(0, 300)}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`Request failed ${response.status} for ${url}${detail}`);
  }
  return (await response.json()) as T;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ job: JobDetails; raw: Record<string, unknown> } | { message: string }>
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

    const jobId = typeof req.query.job_id === "string" ? req.query.job_id : "";
    if (!jobId) {
      return res.status(400).json({ message: "Missing job_id" });
    }

    const url = new URL("https://jsearch.p.rapidapi.com/job-details");
    url.searchParams.set("job_id", jobId);
    url.searchParams.set("country", "us");

    const result = await fetchJson<Record<string, unknown>>(url.toString(), {
      "x-rapidapi-key": rapidApiKey,
      "x-rapidapi-host": rapidApiHost,
    });

    const job = (result?.data as Record<string, unknown>[] | undefined)?.[0];
    if (!job) {
      return res.status(404).json({ message: "No job details returned" });
    }

    const city = job.job_city as string | undefined;
    const state = job.job_state as string | undefined;
    const country = job.job_country as string | undefined;
    const location = [city, state, country].filter(Boolean).join(", ") || "Unknown";

    const salaryMin = job.job_salary_min as number | undefined;
    const salaryMax = job.job_salary_max as number | undefined;
    const salaryCurrency = job.job_salary_currency as string | undefined;
    const salaryText = salaryMin || salaryMax
      ? `${salaryMin ?? ""}${salaryMax ? ` - ${salaryMax}` : ""} ${salaryCurrency ?? ""}`.trim()
      : undefined;

    const mapped: JobDetails = {
      id: jobId,
      title: (job.job_title as string) ?? "Untitled",
      company: (job.employer_name as string) ?? "Unknown",
      location,
      postedAt: (job.job_posted_at_datetime_utc as string) ?? "",
      description: (job.job_description as string) ?? "No description available.",
      applyUrl: (job.job_apply_link as string) ?? undefined,
      companyWebsite: (job.employer_website as string) ?? undefined,
      employmentType: (job.job_employment_type as string) ?? undefined,
      salary: salaryText,
    };

    return res.status(200).json({ job: mapped, raw: job });
  } catch (error) {
    console.error("Failed to fetch job details", error);
    const message = error instanceof Error ? error.message : "Failed to fetch job details";
    return res.status(500).json({ message });
  }
}
