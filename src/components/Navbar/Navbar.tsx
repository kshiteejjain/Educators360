import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/router";
import { clearSession } from "@/utils/authSession";
import styles from "./Navbar.module.css";

type StoredUser = {
  email?: string;
  name?: string;
  resume?: Record<string, unknown>;
  role?: string;
  subject?: string;
  userId?: string;
};

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname, push } = useRouter();
  const [pageTitle, setPageTitle] = useState("Dashboard");
  const [storedUser, setStoredUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const segment = pathname.split("/").filter(Boolean).pop() || "";
    if (pathname === "/Projects/[id]") {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setPageTitle("Project Details");
      return;
    }
    if (pathname === "/JobDetails/[jobId]") {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setPageTitle("Job Details");
      return;
    }
    const title =
      segment
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase()) || "Dashboard";
    const titleOverrides: Record<string, string> = {
      "assessment report": "Assessment: Professional Growth & Identity Report",
    };
    const resolvedTitle = titleOverrides[title.toLowerCase()] ?? title;
    setPageTitle(resolvedTitle);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("upeducateJobPrefix");
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredUser;
      setStoredUser(parsed ?? null);
    } catch (err) {
      console.warn("Failed to read stored user profile", err);
    }
  }, []);

  const welcomeText = useMemo(() => {
    const name = storedUser?.name?.trim();
    if (!name) return "Welcome Back";
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
    return initials ? `Welcome Back, ${initials}` : "Welcome Back";
  }, [storedUser?.name]);

  const goToProfile = () => {
    setOpen(false);
    push("/Profile");
  };

  const clearBrowserStorage = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch (err) {
      console.warn("Failed to clear browser storage", err);
    }
  };

  const handleLogout = () => {
    clearSession();
    clearBrowserStorage();
    setOpen(false);
    push("/login");
  };

  return (
    <header className={styles.navbar}>
      <h4 className={styles.pageTitle}>{pageTitle}</h4>

      <div className={styles.actions}>
        <span className={styles.welcomeText}>{welcomeText}</span>
        <span title="Notifications" className={styles.icon}>
          &#128276;
        </span>

        {/* User Menu */}
        <div className={styles.userMenu}>
          <span
            className={styles.userIcon}
            onClick={() => setOpen(!open)}
            title="User Menu"
          >
            &#128100;
          </span>
          {open && (
            <ul className={styles.dropdown}>
              <li className={styles.menuRow} onClick={goToProfile}>
                <span className={styles.menuIcon} aria-hidden="true">
                  👤
                </span>
                <span>Profile</span>
              </li>
              <li
                className={styles.menuRow}
                onClick={handleLogout}
              >
                <span className={styles.menuIcon} aria-hidden="true">
                  🔓  
                </span>
                <span>Logout</span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
