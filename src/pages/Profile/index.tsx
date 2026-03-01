import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import Layout from "@/components/Layout/Layout";
import styles from "./Profile.module.css";
import headerStyles from "../Projects/AddProject.module.css";
import { getSession, type AuthUser } from "@/utils/authSession";
import { useLoader } from "@/components/Loader/LoaderProvider";

export default function Profile() {
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [mobileDraft, setMobileDraft] = useState("");
  const router = useRouter();
  const { withLoader, isLoading } = useLoader();
  const storedProfile = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("upeducateJobPrefix");
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.warn("Failed to parse stored user profile", error);
      return null;
    }
  }, []);

  const fetchProfile = async (email: string) => {
    try {
      const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setProfile(null);
          return;
        }
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(
          (errorBody as { message?: string }).message ?? "Failed to load profile."
        );
      }
      const data = (await res.json()) as { user?: Record<string, unknown> | null };
      setProfile(data.user ?? null);
      if (data.user && typeof (data.user as Record<string, unknown>).mobileNumber === "string") {
        setMobileDraft((data.user as Record<string, unknown>).mobileNumber as string);
      }
    } catch (error) {
      console.error("Profile fetch failed", error);
      toast.error(
        error instanceof Error ? error.message : "Could not load profile."
      );
    }
  };

  useEffect(() => {
    const existing = getSession();
    setSessionUser(existing);
    if (storedProfile) {
      setProfile(storedProfile);
      if (typeof (storedProfile as Record<string, unknown>)?.mobileNumber === "string") {
        setMobileDraft((storedProfile as Record<string, unknown>).mobileNumber as string);
      }
      return;
    }
    if (existing?.email) {
      void withLoader(
        () => fetchProfile(existing.email),
        "Loading your profile data..."
      );
    }
  }, [withLoader, storedProfile]);

  const handleSaveMobile = async () => {
    if (!sessionUser?.email) {
      toast.error("You need to be logged in to update your mobile number.");
      return;
    }

    try {
      await withLoader(async () => {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: sessionUser.email,
            mobileNumber: mobileDraft,
          }),
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new Error(
            (errorBody as { message?: string }).message ??
              "Failed to update mobile number."
          );
        }

        const data = (await res.json()) as { user?: Record<string, unknown> | null };
        setProfile(data.user ?? profile);
        toast.success("Mobile number updated.");
      }, "Updating your profile...");
    } catch (error) {
      console.error("Failed to update mobile", error);
      toast.error(
        error instanceof Error ? error.message : "Could not update mobile."
      );
    }
  };

  const formatValue = (value: unknown): string => {
    if (!value) return "Not available";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (value && typeof (value as Record<string, unknown>).toDate === "function") {
      return ((value as Record<string, unknown>).toDate as () => Date)().toLocaleDateString();
    }
    if (
      value &&
      typeof value === "object" &&
      "seconds" in (value as Record<string, number>)
    ) {
      const seconds = (value as Record<string, number>).seconds;
      if (typeof seconds === "number") {
        return new Date(seconds * 1000).toLocaleDateString();
      }
    }
    try {
      return String(value);
    } catch {
      return "Not available";
    }
  };

  return (
    <Layout>
      <div className={styles.page}>
        <section className={headerStyles.header}>
          <div>
            <h2 className={headerStyles.title}>Profile</h2>
            <p className={headerStyles.subtitle}>
              See your account details and stay on top of your activity.
            </p>
          </div>
        </section>

        {sessionUser ? (
          <section className={styles.grid}>
            <div className={`${styles.card} ${styles.glow}`}>
              <div className={styles.badge}>
                {((profile as Record<string, unknown>)?.name as string)?.[0] ??
                  sessionUser?.name?.[0] ??
                  "U"}
              </div>
              <h3 className={styles.cardTitle}>
                {((profile as Record<string, unknown>)?.name as string) ||
                  sessionUser?.name ||
                  "User"}
              </h3>
              <p className={styles.cardMeta}>
                {((profile as Record<string, unknown>)?.email as string) ||
                  sessionUser?.email ||
                  "Not available"}
              </p>
              <p className={styles.role}>
                {((profile as Record<string, unknown>)?.role as string) ||
                  sessionUser?.role ||
                  "Member"}
              </p>
            </div>

            <div className={styles.card}>
              <h4 className={styles.label}>User ID</h4>
              <p className={styles.value}>
                {((profile as Record<string, unknown>)?.userId as string) ??
                  sessionUser?.userId ??
                  "Not available"}
              </p>
              <div className={styles.divider} />
              <h4 className={styles.label}>Role</h4>
              <p className={styles.value}>
                {((profile as Record<string, unknown>)?.role as string) ??
                  sessionUser?.role ??
                  "Member"}
              </p>
            </div>

            <div className={styles.card}>
              <h4 className={styles.label}>Profile Details</h4>
              <ul className={styles.infoList}>
                <li className={styles.infoRow}>
                  <span className={styles.infoLabel}>Mobile Number</span>
                  <span className={styles.infoValue}>
                    <div className={styles.editGroup}>
                      <input
                        className={styles.editInput}
                        value={mobileDraft}
                        onChange={(e) => setMobileDraft(e.target.value)}
                        placeholder="Enter mobile number"
                        disabled={isLoading}
                      />
                      <button
                        className={styles.editButton}
                        onClick={handleSaveMobile}
                        disabled={isLoading}
                      >
                        {isLoading ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </span>
                </li>
                <li className={styles.infoRow}>
                  <span className={styles.infoLabel}>Profile Created</span>
                  <span className={styles.infoValue}>
                    {formatValue(
                      ((profile as Record<string, unknown>)?.profileCreatedAt as unknown) ||
                        ((profile as Record<string, unknown>)?.createdAt as unknown)
                    )}
                  </span>
                </li>
              </ul>
            </div>
          </section>
        ) : (
          <section className={styles.empty}>
            <h3>No profile found</h3>
            <p>Please login to view your profile.</p>
            <button
              type="button"
              className={styles.primary}
              onClick={() => router.push("/login")}
            >
              Go to Login
            </button>
          </section>
        )}
      </div>
    </Layout>
  );
}
