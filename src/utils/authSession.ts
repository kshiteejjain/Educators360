export type AuthUser = {
  email: string;
  name?: string;
  role?: string;
  userId?: string;
};

const STORAGE_KEY = "educators360JobPrefix";

function isBrowser() {
  return typeof window !== "undefined";
}

export function saveSession(user: AuthUser) {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getSession(): AuthUser | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch (error) {
    console.warn("Failed to parse stored session", error);
    clearSession();
    return null;
  }
}

