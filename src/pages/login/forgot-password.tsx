import Link from "next/link";
import { useRouter } from "next/router";
import { type FormEvent, useState } from "react";
import { toast } from "react-toastify";
import styles from "./Login.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const router = useRouter();
  const { withLoader, isLoading } = useLoader();

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isEmailVerified) {
      await resetPassword();
    } else {
      await verifyEmail();
    }
  };

  const verifyEmail = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email.");
      return;
    }

    try {
      await withLoader(async () => {
        const response = await fetch(`${apiBaseUrl}/api/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message =
            (errorBody as { message?: string }).message ??
            "Account not found. Please check your email.";
          toast.error(message);
          return;
        }

        toast.success("Account found. Choose a new password.");
        setIsEmailVerified(true);
      }, "Verifying your account...");
    } catch (error) {
      console.error("Failed to verify email for password reset", error);
      toast.error("Could not verify your email right now.");
    }
  };

  const resetPassword = async () => {
    const trimmedPassword = newPassword.trim();
    if (!trimmedPassword || !confirmPassword.trim()) {
      toast.error("Enter and confirm your new password.");
      return;
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      toast.error("Passwords do not match.");
      return;
    }

    try {
      await withLoader(async () => {
        const response = await fetch(`${apiBaseUrl}/api/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, newPassword: trimmedPassword }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message =
            (errorBody as { message?: string }).message ??
            "Unable to update your password right now.";
          toast.error(message);
          return;
        }

        toast.success("Password updated. Please login with your new password.");
        router.push("/login");
      }, "Updating your password...");
    } catch (error) {
      console.error("Failed to reset password", error);
      toast.error("Could not reset your password.");
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.leftSection}>
        <div className="overlay">
          <h1 className={styles.brand}>Educators360</h1>
          <p className={styles.tagline}>
            Your AI-powered career companion delivering skills, mentorship,
            and opportunities for professional growth
          </p>
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.formContainer}>
          <h2 className={styles.heading}>Reset Password</h2>
          <p className={styles.subHeading}>
            First verify your email, then set a new password.
          </p>

          <form onSubmit={handleSubmit} className={styles.formBox}>
            {!isEmailVerified ? (
              <>
                <div className="form-group">
                  <label>Email Address:</label>
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <p className={styles.helperNote}>
                  We will verify your account in Firestore before allowing a
                  reset.
                </p>
              </>
            ) : (
              <div className={styles.noticeBox}>
                <div>
                  <p className={styles.noticeTitle}>Email verified</p>
                  <p className={styles.noticeSubtitle}>{email}</p>
                </div>
                <button
                  type="button"
                  className={styles.changeButton}
                  onClick={() => {
                    setIsEmailVerified(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  disabled={isLoading}
                >
                  Change email
                </button>
              </div>
            )}

            {isEmailVerified ? (
              <>
                <div className="form-group">
                  <label>Choose Password:</label>
                  <div className={styles.passwordInputWrap}>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      className={`form-control ${styles.passwordInput}`}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Enter new password"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      className={styles.eyeButton}
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className={styles.eyeIcon}
                        aria-hidden="true"
                      >
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="2.75"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Confirm Password:</label>
                  <div className={styles.passwordInputWrap}>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className={`form-control ${styles.passwordInput}`}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter new password"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      className={styles.eyeButton}
                      onClick={() =>
                        setShowConfirmPassword((prev) => !prev)
                      }
                      aria-label={
                        showConfirmPassword ? "Hide password" : "Show password"
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className={styles.eyeIcon}
                        aria-hidden="true"
                      >
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="2.75"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading
                ? isEmailVerified
                  ? "Updating..."
                  : "Checking..."
                : isEmailVerified
                  ? "Update Password"
                  : "Continue"}
            </button>
          </form>

          <p className={styles.terms}>
            Remembered your password?{" "}
            <Link href="/login" className={styles.link}>
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
