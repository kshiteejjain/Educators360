import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Layout from "@/components/Layout/Layout";
import styles from "./ViewJobs.module.css";
import headerStyles from "../Projects/AddProject.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  platform: string;
  status: string;
  applyUrl: string;
  job_employment_type?: string;
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

export default function ViewJobs() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [experience, setExperience] = useState("Any");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { withLoader } = useLoader();
  const storageKey = "viewJobsState";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        jobs?: JobRow[];
        role?: string;
        city?: string;
        experience?: string;
        currentPage?: number;
      };
      if (parsed.jobs && parsed.jobs.length > 0) {
        setJobs(parsed.jobs);
        setRole(parsed.role ?? "");
        setCity(parsed.city ?? "");
        setExperience(parsed.experience ?? "Any");
        setCurrentPage(parsed.currentPage ?? 1);
      }
    } catch (err) {
      console.error("Failed to read saved job state", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      jobs,
      role,
      city,
      experience,
      currentPage,
    });
    window.sessionStorage.setItem(storageKey, payload);
  }, [jobs, role, city, experience, currentPage]);

  const fetchJobs = useCallback(async (query: string, loaderText: string) => {
    await withLoader(async () => {
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
        const url = new URL(`${apiBaseUrl}/api/jobs`, window.location.origin);
        url.searchParams.set("search", query);
        url.searchParams.set("page", "1");
        url.searchParams.set("limit", "15");
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Failed to load jobs (${response.status})`);
        const result = (await response.json()) as { jobs?: JobRow[]; message?: string };
        if (!result.jobs) throw new Error(result.message || "No jobs returned");
        setJobs(result.jobs);
        setCurrentPage(1);
      } catch (err) {
        console.error("Jobs fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load jobs");
      }
    }, loaderText);
  }, [withLoader]);

  const fetchMoreJobs = useCallback(async (query: string, nextPage: number) => {
    try {
      setIsLoadingMore(true);
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
      const url = new URL(`${apiBaseUrl}/api/jobs`, window.location.origin);
      url.searchParams.set("search", query);
      url.searchParams.set("page", String(nextPage));
      url.searchParams.set("limit", "15");
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Failed to load jobs (${response.status})`);
      const result = (await response.json()) as { jobs?: JobRow[]; message?: string };
      if (!result.jobs) throw new Error(result.message || "No jobs returned");
      const nextJobs = result.jobs ?? [];
      setJobs((prev) => [...prev, ...nextJobs]);
      setCurrentPage(nextPage);
    } catch (err) {
      console.error("Jobs fetch failed", err);
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setIsLoadingMore(false);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const experienceText = experience !== "Any" ? `${experience} experience` : "";
    const query = [role, "jobs", city ? `in ${city}` : "", experienceText]
      .filter(Boolean)
      .join(" ");
    await fetchJobs(query, "Searching jobs...");
  };

  const handleShowMore = async () => {
    const experienceText = experience !== "Any" ? `${experience} experience` : "";
    const query = [role, "jobs", city ? `in ${city}` : "", experienceText]
      .filter(Boolean)
      .join(" ");
    await fetchMoreJobs(query, currentPage + 1);
  };

  const cardTone = useMemo(
    () => ["tonePeach", "toneMint", "toneLavender", "toneSky", "toneSand"],
    []
  );

  return (
    <Layout>
      <section className={headerStyles.header}>
        <div>
          <h2 className={headerStyles.title}>Explore roles and applications</h2>
          <p className={headerStyles.subtitle}>
            Review openings and keep tabs on every application you are tracking.
          </p>
        </div>
      </section>

      <form className={styles.searchForm} onSubmit={handleSearch}>
        <div className={styles.searchField}>
          <label htmlFor="jobRole">
            Job Role <span className={styles.required}>*</span>
          </label>
          <input
            id="jobRole"
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Teacher, Math, Biology..."
            className={styles.input}
            required
          />
        </div>
        <div className={styles.searchField}>
          <label htmlFor="experience">
            Experience <span className={styles.required}>*</span>
          </label>
          <select
            id="experience"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            className={styles.input}
            required
          >
            {["Any", "Fresher", "1-3 years", "3-5 years", "5+ years", "10+ years"].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.searchField}>
          <label htmlFor="city">City</label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City name"
            className={styles.input}
          />
        </div>
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {error ? (
        <p className={styles.jobInfo}>Error: {error}</p>
      ) : jobs.length === 0 ? (
        <div className="emptyState">
          <Image
            src="/no-data.svg"
            alt="No jobs found"
            width={240}
            height={200}
            className="emptyStateImage"
            sizes="20vw"
          />
          <h3>No jobs available</h3>
          <p>Try changing the job role, city, or experience to find matches.</p>
        </div>
      ) : (
        <>
          <div className={styles.jobsHeader}>
            <div className={styles.jobsTitle}>
              <h3>Recommended jobs</h3>
              <span className={styles.countPill}>{jobs.length}</span>
            </div>
            <span className={styles.totalText}>Total {jobs.length} jobs</span>
          </div>
          <div className={styles.cardGrid}>
            {jobs.map((job, index) => (
              <Link
                key={job.id}
                href={`/JobDetails/${encodeURIComponent(job.id)}`}
                className={`${styles.card} ${styles[cardTone[index % cardTone.length]]}`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.postedAt}>
                    📅 {job.postedAt ? formatDate(job.postedAt) : "Date Not Defined"}
                  </span>
                </div>
                <div className={styles.cardBody} title={job.title}>
                  <h4 className={styles.title} title={job.title}>{job.title || "Not Defined"}</h4>
                  <p className={styles.company}>🏫 {job.company || "Not Defined"}</p>
                  <p className={styles.location}>📍 {job.location || "Not Defined"}</p>
                  <div className={styles.tags}>
                    <span className={styles.tag}>{job?.job_employment_type || "Not Defined"}</span>
                    <span className={styles.tag}>{job.status || "Not Defined"}</span>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <button className="btn-primary">View Job</button>
                </div>
              </Link>
            ))}
          </div>
          <div className={styles.loadMoreRow}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleShowMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Show More"}
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
