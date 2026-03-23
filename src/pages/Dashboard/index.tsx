import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "@/components/Layout/Layout";
import Table from "@/components/Table/Table";
import { type Project, normalizeProject } from "@/utils/projectData";
import { getSession } from "@/utils/authSession";
import styles from "./Dashboard.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";

type StatusKey = "completed" | "inprogress" | "backlog";
type Member = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  mobileNumber?: string;
  createdAt?: string;
  subject?: string;
  status?: string;
  userId?: string;
};

const statusToKey = (status?: string): StatusKey => {
  const value = status?.toLowerCase() ?? "";
  if (value.includes("complete")) return "completed";
  if (value.includes("active") || value.includes("progress")) return "inprogress";
  return "backlog";
};

export default function Dashboard() {
  const headers = ["Project", "Category", "Status", "Progress"];
  const memberHeaders = [
    "Name",
    "Email",
    "Role",
    "Mobile Number",
    "Created At",
    "User ID",
  ];

  const [projects, setProjects] = useState<Project[]>([]);
  const [userCount, setUserCount] = useState<number>(0);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs] = useState<string[]>([
    "[3:51:35 PM] Starting interview...",
    "[3:51:35 PM] Signed URL received.",
    "[3:51:36 PM] WebSocket connected.",
    "[3:51:36 PM] Sent conversation init payload.",
    "[3:51:36 PM] Audio formats negotiated. input=16000 output=16000",
    "[3:51:36 PM] WS event: conversation_initiation_metadata",
    "[3:51:36 PM] Audio worklet loaded.",
    "[3:51:36 PM] Microphone streaming started.",
    "[3:51:36 PM] WS event: agent_response",
    "[3:51:37 PM] WebSocket closed unexpectedly. Code=1002 Reason=This request exceeds your quota limit. Clean=true",
    "[3:56:02 PM] Interview ended unexpectedly. Check mic permission and agent setup.",
  ]);
  const { withLoader } = useLoader();

  useEffect(() => {
    const session = getSession();
    setUserRole(session?.role ?? null);

    const fetchProjects = async () => {
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
        const response = await fetch(`${apiBaseUrl}/api/projects`);
        if (!response.ok) throw new Error("Failed to load projects");
        const raw = (await response.json()) as Project[];
        const normalized = raw.map((p) => normalizeProject(p, p.id));
        setProjects(normalized);
      } catch (error) {
        console.error("Dashboard projects fetch failed", error);
      }
    };

    const fetchUsers = async () => {
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
        const response = await fetch(`${apiBaseUrl}/api/usersStats`);
        if (!response.ok) throw new Error("Failed to load users");
        const result = (await response.json()) as { count?: number };
        setUserCount(result.count ?? 0);
      } catch (error) {
        console.error("Dashboard users fetch failed", error);
      }
    };

    const fetchMembers = async (role?: string) => {
      if ((role ?? "").toLowerCase() !== "teacher") {
        return;
      }
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
        const response = await fetch(`${apiBaseUrl}/api/activeMembers`);
        if (!response.ok) throw new Error("Failed to load members");
        const result = (await response.json()) as { members?: Member[] };
        setActiveMembers(result.members ?? []);
      } catch (error) {
        console.error("Dashboard active members fetch failed", error);
      }
    };

    const roleValue = session?.role ?? "";
    void withLoader(fetchProjects, "Loading projects overview...");
    void withLoader(fetchUsers, "Fetching member counts...");
    void withLoader(() => fetchMembers(roleValue), "Retrieving active members...");
  }, [withLoader]);

  const completedProjects = useMemo(
    () => projects.filter((p) => statusToKey(p.status) === "completed").length,
    [projects]
  );

  const barData = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      const key = p.category || "Uncategorized";
      counts[key] = (counts[key] ?? 0) + 1;
    });
    const labels = Object.keys(counts);
    const data = labels.map((l) => counts[l]);
    return {
      labels,
      datasets: [
        {
          label: "Projects",
          data,
          backgroundColor: [
            "#3b82f6",
            "#10b981",
            "#f59e0b",
            "#ef4444",
            "#8b5cf6",
            "#14b8a6",
            "#a855f7",
          ],
          borderRadius: 8,
        },
      ],
    };
  }, [projects]);

  const pieData = useMemo(() => {
    const counts: Record<StatusKey, number> = {
      completed: 0,
      inprogress: 0,
      backlog: 0,
    };
    projects.forEach((p) => {
      counts[statusToKey(p.status)] += 1;
    });

    return {
      labels: ["Completed", "In Progress", "Backlog"],
      datasets: [
        {
          data: [counts.completed, counts.inprogress, counts.backlog],
          backgroundColor: ["#22c55e", "#facc15", "#ef4444"],
          borderWidth: 2,
        },
      ],
    };
  }, [projects]);

  const recentRows = useMemo(() => {
    const badgeClass = (category?: string) => {
      const value = category?.toLowerCase() ?? "";
      if (value.includes("fintech")) return `${styles.badge} ${styles.fintech}`;
      if (value.includes("health")) return `${styles.badge} ${styles.healthtech}`;
      if (value.includes("ed")) return `${styles.badge} ${styles.edtech}`;
      if (value.includes("ai")) return `${styles.badge} ${styles.ai}`;
      if (value.includes("social")) return `${styles.badge} ${styles.social}`;
      return `${styles.badge} ${styles.defaultBadge}`;
    };

    return projects
      .slice(0, 20)
      .map((project) => {
        const progressValue = project.progress ?? 0;
        const statusText = project.status ?? "backlog";
        const statusClass = statusText.toLowerCase().includes("complete")
          ? styles.completed
          : statusText.toLowerCase().includes("active")
          ? styles.active
          : styles.pending;
        return {
          Project: project.name ?? "Untitled",
          Category: (
            <span className={badgeClass(project.category)}>
              {project.category || "Uncategorized"}
            </span>
          ),
          Status: (
            <span className={`${styles.status} ${statusClass}`}>
              {statusText}
            </span>
          ),
          statusText,
          Progress: (
            <div className={styles.progressWrap}>
              <div className={styles.progressBar}>
                <div
                  style={{
                    width: `${Math.min(Math.max(progressValue, 0), 100)}%`,
                    background:
                      progressValue >= 100
                        ? "#22c55e"
                        : progressValue > 60
                        ? "#10b981"
                        : progressValue > 30
                        ? "#f97316"
                        : undefined,
                  }}
                />
              </div>
              <span>{progressValue}%</span>
            </div>
          ),
        };
      });
  }, [projects]);

  const activeMemberRows = useMemo(() => {
    return activeMembers.map((member) => {
      return {
        Name: member.name ?? "Member",
        Email: member.email ?? "-",
        Role: member.role ?? "-",
        "Mobile Number": member.mobileNumber ?? "-",
        "Created At": member.createdAt ?? "-",
        "User ID": member.userId ?? member.id,
        statusText: member.status ?? "Active",
      };
    });
  }, [activeMembers]);

  return (
    <Layout>
      <div className={styles.dashboard}>
        {/* Welcome Header */}
        <div className={styles.welcomeSection}>
          <div className={styles.welcomeContent}>
            <h1>Welcome Back! 👋</h1>
            <p>Your career success hub - Stay on track with your goals</p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricIcon}>📊</span>
            <h3>Your Progress</h3>
            <h2>{completedProjects}/{projects.length}</h2>
            <p>Projects completed</p>
            <div className={styles.progressBar}>
              <div style={{ width: `${projects.length > 0 ? (completedProjects / projects.length) * 100 : 0}%` }} />
            </div>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricIcon}>📝</span>
            <h3>Available Jobs</h3>
            <h2>95+</h2>
            <p>Remote opportunities waiting</p>
            <Link href="/ViewJobs" className={styles.viewMore}>Browse Jobs →</Link>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricIcon}>👥</span>
            <h3>Community</h3>
            <h2>{userCount}</h2>
            <p>Active members networking</p>
            <Link href="/Discussions" className={styles.viewMore}>Join Discussion →</Link>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricIcon}>⭐</span>
            <h3>Skill Level</h3>
            <h2>Intermediate</h2>
            <p>Complete assessments to level up</p>
            <Link href="/" className={styles.viewMore}>Start Assessment →</Link>
          </div>
        </div>

        {/* LinkedIn Profile - Featured Hot Section */}
        <div className={styles.linkedinFeatured}>
          <div className={styles.linkedinContent}>
            <div className={styles.linkedinBadge}>🔥 HOT FEATURE</div>
            <h2>Optimize Your LinkedIn Profile</h2>
            <p className={styles.linkedinSubtitle}>
              Get AI-powered insights to make your LinkedIn profile stand out to recruiters and land your dream job
            </p>
            
            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>
                <span className={styles.benefitIcon}>✨</span>
                <div>
                  <h4>Profile Optimization</h4>
                  <p>AI analyzes your profile and suggests improvements</p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <span className={styles.benefitIcon}>📈</span>
                <div>
                  <h4>Visibility Boost</h4>
                  <p>Increase recruiter visibility by up to 300%</p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <span className={styles.benefitIcon}>🎯</span>
                <div>
                  <h4>Skill Alignment</h4>
                  <p>Match your skills with in-demand job requirements</p>
                </div>
              </div>
              <div className={styles.benefitItem}>
                <span className={styles.benefitIcon}>🚀</span>
                <div>
                  <h4>Career Growth</h4>
                  <p>Get personalized recommendations for growth</p>
                </div>
              </div>
            </div>

            <Link href="/LinkedinAnalysis" className={styles.linkedinCta}>
              Analyze My Profile Now →
            </Link>
          </div>
          
          <div className={styles.linkedinVisual}>
            <div className={styles.linkedinIllustration}>
              <div className={styles.profileCard}>
                <div className={styles.profileHeader}>
                  <div className={styles.profileAvatar}>👤</div>
                  <div className={styles.profileBadges}>
                    <span className={styles.badge}>⭐</span>
                    <span className={styles.badge}>✓</span>
                  </div>
                </div>
                <div className={styles.profileStats}>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>89%</span>
                    <span className={styles.statLabel}>Profile Score</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>2.5K</span>
                    <span className={styles.statLabel}>Views/mo</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>15</span>
                    <span className={styles.statLabel}>Connections</span>
                  </div>
                </div>
              </div>
              <div className={styles.animatedElements}>
                <div className={styles.floatingIcon}>📊</div>
                <div className={styles.floatingIcon2}>🔗</div>
                <div className={styles.floatingIcon3}>⚡</div>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Actions / Call to Actions */}
        <div className={styles.ctaSection}>
          <h2 className={styles.sectionTitle}>What&apos;s Next?</h2>
          <div className={styles.ctaGrid}>
            <Link href="/ResumeBuilder" className={`${styles.ctaCard} ${styles.cta1}`}>
              <div className={styles.ctaIcon}>📄</div>
              <h3>Build Resume</h3>
              <p>Create a professional resume that stands out</p>
              <span className={styles.arrow}>→</span>
            </Link>
            <Link href="/InterviewQuestions" className={`${styles.ctaCard} ${styles.cta2}`}>
              <div className={styles.ctaIcon}>🤖</div>
              <h3>AI Interview Prep</h3>
              <p>Practice with AI-powered interview questions</p>
              <span className={styles.arrow}>→</span>
            </Link>
            <Link href="/Projects" className={`${styles.ctaCard} ${styles.cta3}`}>
              <div className={styles.ctaIcon}>🔍</div>
              <h3>Search Jobs</h3>
              <p>Find projects and jobs matching your skills</p>
              <span className={styles.arrow}>→</span>
            </Link>
            <Link href="/Mentorship" className={`${styles.ctaCard} ${styles.cta4}`}>
              <div className={styles.ctaIcon}>📅</div>
              <h3>Schedule Mentor</h3>
              <p>Book 1:1 sessions with industry mentors</p>
              <span className={styles.arrow}>→</span>
            </Link>
          </div>
        </div>

        {/* Additional Features */}
        <div className={styles.featuresSection}>
          <div className={styles.featureRow}>
            <div className={styles.featureCard}>
              <h3>🔗 LinkedIn Profile</h3>
              <p>Get AI-powered insights to optimize your LinkedIn profile and increase visibility</p>
              <Link href="/" className={styles.featureBtn}>Analyze Profile</Link>
            </div>
            <div className={styles.featureCard}>
              <h3>💬 Community</h3>
              <p>Engage with peers, share experiences, and learn from discussions</p>
              <Link href="/Discussions" className={styles.featureBtn}>Explore Discussions</Link>
            </div>
            {userRole?.toLowerCase() === "teacher" && (
              <div className={styles.featureCard}>
                <h3>📤 Bulk Upload</h3>
                <p>Upload user data and manage students efficiently</p>
                <Link href="/Upload" className={styles.featureBtn}>Upload Users</Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Tables */}
        <div className={styles.tableStack}>

          {userRole?.toLowerCase() === "teacher" && (
            <div className={styles.tableSection}>
              <div className={styles.tableSectionHeader}>
                <h2>Active Members</h2>
                <Link href="/Upload" className={styles.viewAllLink}>Manage →</Link>
              </div>
              {activeMemberRows.length === 0 ? (
                <p className={styles.loadingText}>No active members found.</p>
              ) : (
                <Table
                  headers={memberHeaders}
                  data={activeMemberRows.slice(0, 10)}
                  enableStatusFilter={false}
                />
              )}
            </div>
          )}
        </div>

        <div className={styles.sessionLogsSection}>
          <div className={styles.sessionLogsHeader}>
            <div>
              <h2>AI Interview</h2>
              <p className={styles.sessionLogsSubtitle}>Session Logs</p>
            </div>
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => setSessionLogs([])}
            >
              Clear
            </button>
          </div>
          <div className={styles.sessionLogsBody}>
            {sessionLogs.length === 0 ? (
              <p className={styles.loadingText}>No logs yet.</p>
            ) : (
              <ul className={styles.sessionLogsList}>
                {sessionLogs.map((line, index) => (
                  <li
                    key={`${line}-${index}`}
                    className={
                      line.toLowerCase().includes("interview ended unexpectedly")
                        ? styles.sessionLogCritical
                        : line.toLowerCase().includes("closed") ||
                          line.toLowerCase().includes("quota")
                        ? styles.sessionLogError
                        : styles.sessionLogItem
                    }
                  >
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.sessionLogsContact}>
            <span>Need help? </span>
            <a href="tel:+918605434108">+91 86054 34108</a>
            <span> to contact and report error.</span>
          </div>
        </div>

        {/* Quick Tips / Resources */}
        <div className={styles.tipsSection}>
          <h2 className={styles.sectionTitle}>Pro Tips 💡</h2>
          <div className={styles.tipsList}>
            <div className={styles.tip}>
              <h4>✓ Complete Your Profile</h4>
              <p>A complete profile increases visibility by 40% among recruiters</p>
            </div>
            <div className={styles.tip}>
              <h4>✓ Practice Interviews Weekly</h4>
              <p>Consistent practice with AI Interview prep boosts confidence</p>
            </div>
            <div className={styles.tip}>
              <h4>✓ Update Your Resume</h4>
              <p>Keep your resume fresh with latest skills and experiences</p>
            </div>
            <div className={styles.tip}>
              <h4>✓ Network & Discuss</h4>
              <p>Join discussions to learn from peers and expand your network</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
