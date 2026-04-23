import type { NextApiRequest, NextApiResponse } from "next";
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
import { getDb } from "@/utils/firebase";
import { normalizeProject, type Project } from "@/utils/projectData";

type CreateProjectBody = {
  name?: string;
  category?: string;
  description?: string;
  startDate?: string;
  deadline?: string;
  participants?: string[];
  techStack?: string[];
  durationDays?: number;
  owner?: string;
  ownerId?: string;
  budget?: string | number;
  source?: Project["source"];
  status?: string;
};

type UpdateProjectBody = Partial<CreateProjectBody> & {
  id?: string;
  progress?: number | string;
  participant?: string;
  action?: "add" | "remove";
  participantRole?: string;
  participantContribution?: string;
};

const allowedStatuses = ["Backlog", "In Progress", "Completed"] as const;

function normalizeStatus(value?: string | null): string {
  if (!value) return "Backlog";
  const formatted = value
    .trim()
    .split(" ")
    .map(
      (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ")
    .trim();
  return allowedStatuses.includes(formatted as (typeof allowedStatuses)[number])
    ? formatted
    : "Backlog";
}

function serializeProject(data: Partial<Project>, id: string): Project {
  const createdAt =
    typeof data.createdAt === "string"
      ? data.createdAt
      : data.createdAt && typeof (data.createdAt as Record<string, unknown>).toDate === "function"
      ? ((data.createdAt as Record<string, unknown>).toDate as () => Date)().toISOString()
      : undefined;

  const normalizeDateField = (value: unknown) => {
    if (typeof value === "string") return value;
    if (value && typeof (value as Record<string, unknown>).toDate === "function") {
      return ((value as Record<string, unknown>).toDate as () => Date)().toISOString().slice(0, 10);
    }
    return value ? String(value) : "";
  };

  return normalizeProject(
    {
      ...data,
      startDate: normalizeDateField(data.startDate),
      deadline: normalizeDateField(data.deadline),
      createdAt,
    },
    id
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const db = getDb();
  const projectsRef = collection(db, "Educators360");
  const projectId =
    typeof req.query.id === "string"
      ? req.query.id
      : typeof req.body?.id === "string"
      ? req.body.id
      : null;

  if (req.method === "GET") {
    try {
      if (projectId) {
        const snap = await getDoc(doc(projectsRef, projectId));
        if (!snap.exists()) {
          return res.status(404).json({ message: "Project not found" });
        }
        return res.status(200).json(serializeProject(snap.data(), snap.id));
      }

      const snapshot = await getDocs(projectsRef);
      const items = snapshot.docs.map((docSnap) =>
        serializeProject(docSnap.data(), docSnap.id)
      );
      return res.status(200).json(items);
    } catch (error) {
      console.error("Failed to fetch projects", error);
      const message =
        error instanceof Error ? error.message : "Failed to fetch projects";
      return res.status(500).json({ message });
    }
  }

  if (req.method === "POST") {
    const {
      name,
      category,
      description,
      startDate,
      deadline,
      participants = [],
      techStack = [],
      durationDays = 0,
      owner,
      ownerId,
      budget,
      source = "custom",
      status = "",
    } = req.body as CreateProjectBody;

    if (!name || !startDate || !deadline) {
      return res
        .status(400)
        .json({ message: "name, startDate, and deadline are required." });
    }

    try {
      const normalizedStatus = normalizeStatus(status);

      const parsedBudget =
        typeof budget === "string"
          ? parseFloat(budget.replace(/[^\d.-]/g, ""))
          : budget;
      const budgetValue =
        typeof parsedBudget === "number" ? parsedBudget : Number.NaN;
      const safeBudget = Number.isFinite(budgetValue) ? budgetValue : 0;

      const payload: Omit<Project, "id"> = {
        name: name.trim(),
        category: (category ?? "General").trim(),
        description:
          description?.trim() ||
          "Project scope and milestones are being defined.",
        startDate,
        deadline,
        participants,
        participantNotes: {},
        progress: 0,
        techStack,
        status: normalizedStatus,
        durationDays,
        owner: owner?.trim() || "Project Owner",
        ownerId: ownerId?.trim() || undefined,
        budget: safeBudget,
        source: source === "ai" ? "ai" : "custom",
        createdAt: undefined,
      };

      const docRef = await addDoc(projectsRef, {
        ...payload,
        createdAt: serverTimestamp(),
      });

      const normalized = serializeProject(
        { ...payload, createdAt: new Date().toISOString() },
        docRef.id
      );

      return res.status(201).json(normalized);
    } catch (error) {
      console.error("Failed to create project", error);
      const message =
        error instanceof Error ? error.message : "Failed to create project";
      return res.status(500).json({ message });
    }
  }

  if (req.method === "PATCH") {
    if (!projectId) {
      return res
        .status(400)
        .json({ message: "id is required to update a project." });
    }

    const {
      participant,
      action,
      progress,
      durationDays,
      budget,
      techStack,
      participantRole,
      participantContribution,
      ...rest
    } = req.body as UpdateProjectBody;

    const participantName = participant?.trim();

    try {
      const projectRef = doc(projectsRef, projectId);
      const snap = await getDoc(projectRef);
      if (!snap.exists()) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updates: Record<string, unknown> = {};

      if (participantName) {
        updates.participants =
          action === "remove"
            ? arrayRemove(participantName)
            : arrayUnion(participantName);

        if (action !== "remove") {
          const safeRole = participantRole?.trim() || undefined;
          const safeContribution = participantContribution?.trim() || undefined;
          if (safeRole || safeContribution) {
            updates[`participantNotes.${participantName}`] = {
              role: safeRole,
              contribution: safeContribution,
            };
          }
        } else {
          updates[`participantNotes.${participantName}`] = deleteField();
        }
      }

      const normalizedProgress = Number(progress);
      if (!Number.isNaN(normalizedProgress)) {
        updates.progress = Math.min(100, Math.max(0, normalizedProgress));
      }

      const normalizedDuration = Number(durationDays);
      if (!Number.isNaN(normalizedDuration)) {
        updates.durationDays = Math.max(0, normalizedDuration);
      }

      if (Array.isArray(techStack)) {
        updates.techStack = techStack
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean);
      }

      const parsedBudget =
        typeof budget === "string"
          ? parseFloat(budget.replace(/[^\d.-]/g, ""))
          : budget;
      if (typeof parsedBudget === "number" && Number.isFinite(parsedBudget)) {
        updates.budget = parsedBudget;
      }

      (
        [
          "name",
          "category",
          "description",
          "startDate",
          "deadline",
          "owner",
          "ownerId",
          "status",
          "source",
        ] as const
      ).forEach((field) => {
        const value = rest[field];
        if (typeof value === "string") {
          updates[field] =
            field === "status" ? normalizeStatus(value) : value.trim();
        }
      });

      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ message: "No valid fields were provided to update." });
      }

      await updateDoc(projectRef, updates);
      const updatedSnap = await getDoc(projectRef);
      return res
        .status(200)
        .json(serializeProject(updatedSnap.data() || {}, updatedSnap.id));
    } catch (error) {
      console.error("Failed to update project", error);
      const message =
        error instanceof Error ? error.message : "Failed to update project";
      return res.status(500).json({ message });
    }
  }

  if (req.method === "DELETE") {
    if (!projectId) {
      return res
        .status(400)
        .json({ message: "id is required to delete a project." });
    }

    try {
      const projectRef = doc(projectsRef, projectId);
      const snap = await getDoc(projectRef);
      if (!snap.exists()) {
        return res.status(404).json({ message: "Project not found" });
      }

      await deleteDoc(projectRef);
      return res.status(200).json({ message: "Project deleted" });
    } catch (error) {
      console.error("Failed to delete project", error);
      const message =
        error instanceof Error ? error.message : "Failed to delete project";
      return res.status(500).json({ message });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ message: "Method Not Allowed" });
}

