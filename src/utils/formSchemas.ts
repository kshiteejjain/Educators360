import type { Schema } from "./schemaUtils";

export type RegisterFormRecord = {
  name: string;
  email: string;
  mobileNumber: string;
  city: string;
  currentRole: string;
  subject: string;
  board: string;
  organizationName: string;
};

export const registerFormSchema: Schema<RegisterFormRecord> = {
  name: "registerForm",
  storageKey: "rnw-register-form",
  columns: {
    name: "",
    email: "",
    mobileNumber: "",
    city: "",
    currentRole: "",
    subject: "",
    board: "",
    organizationName: "",
  },
};

export type RegisterRecord = {
  name: string;
  email: string;
  mobileNumber: string;
  city: string;
  currentRole: string;
  subject: string;
  board: string;
  organizationName: string;
  createdAt: string;
  registeredAt?: string;
};

export const registerSchema: Schema<RegisterRecord> = {
  name: "register",
  storageKey: "rnw-register",
  columns: {
    name: "",
    email: "",
    mobileNumber: "",
    city: "",
    currentRole: "",
    subject: "",
    board: "",
    organizationName: "",
    createdAt: "",
    registeredAt: "",
  },
};

export type ProjectFormRecord = {
  name: string;
  durationDays: string;
  category: string;
  techStack: string[];
  description: string;
  startDate: string;
  budget: string;
};

export const projectFormSchema: Schema<ProjectFormRecord> = {
  name: "projectForm",
  storageKey: "rnw-project-form",
  columns: {
    name: "",
    durationDays: "",
    category: "",
    techStack: [],
    description: "",
    startDate: "",
    budget: "",
  },
};

export type InterviewAttemptRecord = {
  username: string;
  category: string;
  answers: Record<number, string>;
  score: number | null;
  total: number;
  percent: number;
  createdAt: string;
};

export const interviewAttemptSchema: Schema<InterviewAttemptRecord> = {
  name: "interviewAttempt",
  storageKey: "rnw-interview-attempts",
  columns: {
    username: "",
    category: "fullstack",
    answers: {},
    score: null,
    total: 0,
    percent: 0,
    createdAt: "",
  },
};
