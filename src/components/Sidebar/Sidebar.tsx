import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useId, useMemo, useState } from "react";
import { Tooltip } from "react-tooltip";
import { getSession } from "@/utils/authSession";
import styles from "./Sidebar.module.css";

const menuItems = [
  { name: "Dashboard", path: "/Dashboard", icon: "\u{1F4CA}" },
  { name: "Job Search", path: "/ViewJobs", icon: "\u{1F5C2}\u{FE0F}" },
  { name: "Resume Builder", path: "/ResumeBuilder", icon: "\u{1F4C4}" },
  { name: "LinkedIn Profile Analysis", path: "/LinkedinAnalysis", icon: "\u{1F50D}" },
  { name: "Schedule 1:1 Meet", path: "/Mentorship", icon: "\u{1F4C5}" },
  { name: "Assessment", path: "/Assessment", icon: "\u{1F4DD}" },
  { name: "AI Interview", path: "/AIInterview", icon: "\u{1F916}" },
  { name: "Ask Anu - Your AI Coach", path: "/AskAnu", icon: "/shiksha.png" },
  { name: "Discussions", path: "/Discussions", icon: "\u{1F4AC}" },
  { name: "Bulk Upload", path: "/Upload", icon: "\u{1F4E4}" }
];

type SidebarProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const router = useRouter();
  const currentPath = router.pathname;
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showCollapsedLogo, setShowCollapsedLogo] = useState(isCollapsed);
  const logoTooltipId = useId();
  const menuTooltipId = useId();

  useEffect(() => {
    const logoDelayMs = 200;
    const id = window.setTimeout(() => {
      setShowCollapsedLogo(isCollapsed);
    }, logoDelayMs);
    return () => window.clearTimeout(id);
  }, [isCollapsed]);

  useEffect(() => {
    const session = getSession();
    if (session?.role) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setUserRole(session.role);
    }
  }, []);

  const visibleItems = useMemo(
    () =>
      menuItems.filter(
        (item) =>
          item.name !== "Upload" || (userRole ?? "").toLowerCase() === "teacher"
      ),
    [userRole]
  );

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ""}`}
    >
      <div
        className={styles.logo}
        {...(isCollapsed
          ? {
              "data-tooltip-id": logoTooltipId,
              "data-tooltip-content": "UpEducatePlus",
            }
          : {})}
      >
        {!showCollapsedLogo ? <Image src="/logo.svg" alt="Logo" width={200} height={48} priority /> :
          <Image src="/logo-collapsed.svg" alt="Logo" width={48} height={48} priority className={styles.collapsedLogo} />
        }
      </div>
      {isCollapsed ? <Tooltip id={logoTooltipId} /> : null}

      <button
        type="button"
        className="toggle"
        onClick={onToggle}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={isCollapsed}
      >
        ❯
      </button>

      <ul className={styles.menuList}>
        {visibleItems.map((item) => {
          const isProjects =
            item.path === "/Projects" &&
            (currentPath === "/Projects" || currentPath.startsWith("/Projects/"));
          const isActive = currentPath === item.path || isProjects;
          return (
            <li
              key={item.name}
              className={`${styles.menuItem} ${isActive ? styles.active : ""}`}
            >
              <Link
                href={item.path}
                {...(isCollapsed
                  ? {
                      "data-tooltip-id": menuTooltipId,
                      "data-tooltip-content": item.name,
                    }
                  : {})}
              >
                <span className={styles.menuLink}>
                  <span className={styles.icon} aria-hidden="true">
                    {item.icon.startsWith("/") ? (
                      <Image src={item.icon} alt="" width={18} height={18} />
                    ) : (
                      item.icon
                    )}
                  </span>
                  <span className={styles.label}>{item.name}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {isCollapsed ? <Tooltip id={menuTooltipId} place="right" /> : null}
    </aside>
  );
}
