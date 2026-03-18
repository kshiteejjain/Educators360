import { useMemo, useState, useRef, useEffect } from "react";
import Image, { type StaticImageData } from "next/image";
import type { FormEvent } from "react";
import Layout from "@/components/Layout/Layout";
import styles from "./ResumeBuilder.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";
import { getSession } from "@/utils/authSession";
import { getDb } from "@/utils/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import placeholderTeacher from "../../../public/placeholder-teacher.jpg";
import morden from "../../../public/morden.png";
import classic from "../../../public/classic.png";
import minimal from "../../../public/minimal.png";

type Experience = {
  role: string;
  company: string;
  dates: string;
  bullets: string[];
};

type Education = {
  school: string;
  degree: string;
  dates: string;
};

type SkillItem = {
  name: string;
  rating: number;
};

type ResumeTemplate = {
  id: string;
  name: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  photo?: string | StaticImageData;
  summary: string;
  skills: SkillItem[];
  languages: string[];
  experiences: Experience[];
  education: Education[];
  certifications: string[];
};

type AiResumeResult = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  rewriteSummary: string;
  keywords: string[];
  parsedResume?: ResumeTemplate;
};

const templates: ResumeTemplate[] = [
  {
    id: "navy",
    name: "Anjali Shaw",
    title: "High School English Teacher",
    location: "Pune, Maharashtra",
    email: "anjalishaw@gmail.com",
    phone: "+91 123-456-7890",
    photo: placeholderTeacher,
    summary:
      "Student-centered English teacher with 6+ years of experience designing engaging curriculum, improving literacy outcomes, and fostering inclusive classrooms. Skilled in differentiated instruction, data-informed lesson planning, and parent collaboration.",
    skills: [
      { name: "Lesson Planning", rating: 5 },
      { name: "Classroom Management", rating: 5 },
      { name: "Differentiated Instruction", rating: 4 },
      { name: "Assessment & Data Analysis", rating: 4 },
      { name: "Curriculum Design", rating: 4 },
      { name: "Parent Communication", rating: 5 },
      { name: "EdTech Integration", rating: 4 },
    ],
    languages: ["English (Fluent)", "Hindi (Fluent)", "Spanish (Intermediate)"],
    certifications: [
      "TESOL Certification (2021)",
      "State Teaching License (Grades 6-12) (2020)",
      "Google Certified Educator Level 1 (2020)",
    ],
    experiences: [
      {
        role: "English Teacher",
        company: "Austin Independent School District",
        dates: "2022 - Present",
        bullets: [
          "Designed standards-aligned units for grades 9-11, improving writing proficiency by 18% on district benchmarks.",
          "Implemented differentiated instruction and small-group interventions for diverse learning needs.",
          "Partnered with families and counselors to support student growth and attendance.",
        ],
      },
      {
        role: "English Teacher",
        company: "Round Rock High School",
        dates: "2019 - 2022",
        bullets: [
          "Led project-based learning units integrating research, presentation, and peer review.",
          "Analyzed assessment data to target instruction and close literacy gaps.",
        ],
      },
      {
        role: "Student Teacher",
        company: "Cedar Ridge High School",
        dates: "2018 - 2019",
        bullets: [
          "Co-taught 10th grade English and supported classroom routines and formative assessments.",
        ],
      },
    ],
    education: [
      {
        school: "The University of Texas at Austin",
        degree: "M.Ed. in Curriculum & Instruction",
        dates: "2019 - 2021",
      },
      {
        school: "The University of Texas at Austin",
        degree: "B.A. in English",
        dates: "2015 - 2019",
      },
    ],
  },
];

const emptyState = (template: ResumeTemplate): ResumeTemplate => ({
  ...template,
  summary: template.summary || "Add your professional summary here.",
});

export default function ResumeBuilder() {
  const [selectedId, setSelectedId] = useState<string>(templates[0].id);
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? templates[0],
    [selectedId]
  );
  const [form, setForm] = useState<ResumeTemplate>(() => emptyState(templates[0]));
  const [skillInput, setSkillInput] = useState("");
  const [skillRating, setSkillRating] = useState(3);
  const [languageInput, setLanguageInput] = useState("");
  const [certificationInput, setCertificationInput] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const previewHeaderRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  const [previewTemplate, setPreviewTemplate] = useState<"navy" | "clean" | "slate">("navy");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<AiResumeResult | null>(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [targetJob, setTargetJob] = useState("");
  const [manualMode, setManualMode] = useState<"build" | "edit">("build");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { withLoader } = useLoader();
  const aiResultRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const hasHydratedResume = useRef(false);
  const hasHydratedTargetRole = useRef(false);

  const scrollToPreviewHeader = () => {
    previewHeaderRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    if (aiResult && aiResultRef.current) {
      aiResultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [aiResult]);

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedResume.current) return;
    hasHydratedResume.current = true;
    try {
      const raw = window.localStorage.getItem("upeducateJobPrefix");
      const cached = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const resumeRecord = cached?.resume;
      if (!resumeRecord || typeof resumeRecord !== "object") return;
      const resumeData =
        (resumeRecord as Record<string, unknown>)?.data &&
        typeof (resumeRecord as Record<string, unknown>).data === "object"
          ? ((resumeRecord as Record<string, unknown>).data as Record<string, unknown>)
          : null;
      if (!resumeData) return;

      const normalizedSkills = Array.isArray(resumeData.skills)
        ? (resumeData.skills as unknown[]).map((skill) =>
            typeof skill === "string"
              ? { name: skill, rating: 3 }
              : {
                  name: String((skill as Record<string, unknown>)?.name ?? ""),
                  rating: Math.max(
                    1,
                    Math.min(5, Number((skill as Record<string, unknown>)?.rating ?? 3))
                  ),
                }
          )
        : [];

      const nextForm: ResumeTemplate = {
        ...emptyState(templates[0]),
        name: String(resumeData.name ?? ""),
        title: String(resumeData.title ?? ""),
        location: String(resumeData.location ?? ""),
        email: String(resumeData.email ?? ""),
        phone: String(resumeData.phone ?? ""),
        photo: (resumeData.photo as string) || "",
        summary: String(resumeData.summary ?? ""),
        skills: normalizedSkills,
        languages: Array.isArray(resumeData.languages)
          ? (resumeData.languages as unknown[]).map((lang) => String(lang))
          : [],
        certifications: Array.isArray(resumeData.certifications)
          ? (resumeData.certifications as unknown[]).map((cert) => String(cert))
          : [],
        experiences: Array.isArray(resumeData.experiences)
          ? (resumeData.experiences as unknown[]).map((exp) => ({
              role: String((exp as Record<string, unknown>)?.role ?? ""),
              company: String((exp as Record<string, unknown>)?.company ?? ""),
              dates: String((exp as Record<string, unknown>)?.dates ?? ""),
              bullets: Array.isArray((exp as Record<string, unknown>)?.bullets)
                ? ((exp as Record<string, unknown>)?.bullets as unknown[]).map(
                    (bullet) => String(bullet)
                  )
                : [],
            }))
          : [],
        education: Array.isArray(resumeData.education)
          ? (resumeData.education as unknown[]).map((edu) => ({
              school: String((edu as Record<string, unknown>)?.school ?? ""),
              degree: String((edu as Record<string, unknown>)?.degree ?? ""),
              dates: String((edu as Record<string, unknown>)?.dates ?? ""),
            }))
          : [],
      };

      setForm(nextForm);

      const templateId = String((resumeRecord as Record<string, unknown>).templateId ?? "");
      if (templateId) {
        setSelectedId(templateId);
      }
      const preview = String((resumeRecord as Record<string, unknown>).previewTemplate ?? "");
      if (preview === "navy" || preview === "clean" || preview === "slate") {
        setPreviewTemplate(preview);
      }

      const storedTargetRole =
        typeof cached?.targetRole === "string" ? cached.targetRole.trim() : "";
      if (storedTargetRole) {
        setTargetJob(storedTargetRole);
      }
    } catch (error) {
      console.warn("Failed to hydrate resume from local storage", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedTargetRole.current) return;
    const session = getSession();
    if (!session?.email) return;
    hasHydratedTargetRole.current = true;

    const hydrateTargetRole = async () => {
      try {
        const db = getDb();
        const userRef = doc(db, "upEducatePlusUsers", session.email.toLowerCase());
        const snap = await getDoc(userRef);
        if (!snap.exists()) return;
        const data = snap.data() as { targetRole?: unknown };
        const nextTargetRole =
          typeof data?.targetRole === "string" ? data.targetRole.trim() : "";
        if (!nextTargetRole) return;
        setTargetJob(nextTargetRole);
        try {
          const raw = window.localStorage.getItem("upeducateJobPrefix");
          const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          const next = { ...existing, targetRole: nextTargetRole };
          window.localStorage.setItem("upeducateJobPrefix", JSON.stringify(next));
        } catch (error) {
          console.warn("Failed to store target role from firestore", error);
        }
      } catch (error) {
        console.warn("Failed to hydrate target role from firestore", error);
      }
    };

    void hydrateTargetRole();
  }, []);

  useEffect(() => {
    const trimmed = targetJob.trim();
    if (!trimmed || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("upeducateJobPrefix");
      const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const next = { ...existing, targetRole: trimmed };
      window.localStorage.setItem("upeducateJobPrefix", JSON.stringify(next));
    } catch (error) {
      console.warn("Failed to store target role", error);
    }

    const session = getSession();
    if (!session?.email) return;
    const persistTargetRole = async () => {
      try {
        const db = getDb();
        const userRef = doc(db, "upEducatePlusUsers", session.email.toLowerCase());
        await setDoc(
          userRef,
          { targetRole: trimmed, targetRoleUpdatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (error) {
        console.warn("Failed to store target role in firestore", error);
      }
    };

    void persistTargetRole();
  }, [targetJob]);

  const loadTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id) ?? templates[0];
    setSelectedId(id);
    setForm(emptyState(tpl));
  };

  const updateField = (key: keyof ResumeTemplate, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateExperience = (index: number, key: keyof Experience, value: unknown) => {
    setForm((prev) => {
      const next = [...prev.experiences];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, experiences: next };
    });
  };

  const updateEducation = (index: number, key: keyof Education, value: unknown) => {
    setForm((prev) => {
      const next = [...prev.education];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, education: next };
    });
  };

  const addEducation = () => {
    setForm((prev) => ({
      ...prev,
      education: [...prev.education, { school: "", degree: "", dates: "" }],
    }));
  };

  const addExperience = () => {
    setForm((prev) => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        { role: "", company: "", dates: "", bullets: [] },
      ],
    }));
  };

  const removeEducation = (index: number) => {
    setForm((prev) => ({
      ...prev,
      education: prev.education.filter((_, idx) => idx !== index),
    }));
  };

  const removeExperience = (index: number) => {
    setForm((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, idx) => idx !== index),
    }));
  };

  const addSkill = () => {
    const value = skillInput.trim();
    if (!value) return;
    setForm((prev) =>
      prev.skills.some((s) => s.name.toLowerCase() === value.toLowerCase())
        ? prev
        : { ...prev, skills: [...prev.skills, { name: value, rating: skillRating }] }
    );
    setSkillInput("");
    setSkillRating(3);
  };

  const removeSkill = (skillName: string) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s.name !== skillName),
    }));
  };

  const updateSkillRating = (skillName: string, rating: number) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.map((s) =>
        s.name === skillName ? { ...s, rating } : s
      ),
    }));
  };

  const addLanguage = () => {
    const value = languageInput.trim();
    if (!value) return;
    setForm((prev) =>
      prev.languages.some((lang) => lang.toLowerCase() === value.toLowerCase())
        ? prev
        : { ...prev, languages: [...prev.languages, value] }
    );
    setLanguageInput("");
  };

  const removeLanguage = (langName: string) => {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.filter((lang) => lang !== langName),
    }));
  };

  const addCertification = () => {
    const value = certificationInput.trim();
    if (!value) return;
    setForm((prev) =>
      prev.certifications.some((cert) => cert.toLowerCase() === value.toLowerCase())
        ? prev
        : { ...prev, certifications: [...prev.certifications, value] }
    );
    setCertificationInput("");
  };

  const removeCertification = (certName: string) => {
    setForm((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((cert) => cert !== certName),
    }));
  };

  const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) updateField("photo", result);
    };
    reader.readAsDataURL(file);
  };

  const saveDownloadResume = async () => {
    if (!previewRef.current) return;
    const session = getSession();
    if (!session?.email) {
      toast.error("Please log in to save your resume.");
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      await withLoader(async () => {
        const db = getDb();
        const userRef = doc(db, "upEducatePlusUsers", session.email.toLowerCase());
        const resumePayload = {
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.title || "",
          previewTemplate,
          updatedAt: serverTimestamp(),
          data: {
            name: form.name,
            title: form.title,
            location: form.location,
            email: form.email,
            phone: form.phone,
            photo: form.photo ?? "",
            summary: form.summary,
            skills: form.skills,
            languages: form.languages,
            experiences: form.experiences,
            education: form.education,
            certifications: form.certifications,
          },
        };

        await setDoc(userRef, { resume: resumePayload }, { merge: true });

        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem("upeducateJobPrefix");
            const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const next = { ...existing, resume: resumePayload };
            window.localStorage.setItem("upeducateJobPrefix", JSON.stringify(next));
          } catch (error) {
            console.warn("Failed to store resume in local storage", error);
          }
        }

        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);

        if ("fonts" in document) {
          await (document as Document & { fonts: FontFaceSet }).fonts.ready;
        }

        const target = previewRef.current;
        if (!target) return;

        const canvas = await html2canvas(target, {
          useCORS: true,
          scale: 2,
          backgroundColor: "#ffffff",
          windowWidth: target.scrollWidth,
          windowHeight: target.scrollHeight,
          scrollY: -window.scrollY,
        });

        const pageWidth = 595.28; // A4 width in points
        const renderHeight = (canvas.height * pageWidth) / canvas.width;
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "pt",
          format: [pageWidth, renderHeight],
        });

        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          0,
          0,
          pageWidth,
          renderHeight
        );

        const nameSlug = (form.name || "resume").replace(/\s+/g, "-").toLowerCase();
        const roleSlug = (form.title || selectedTemplate.title || "role")
          .replace(/\s+/g, "-")
          .toLowerCase();
        pdf.save(`${nameSlug}-${roleSlug}.pdf`);
      }, "Saving and downloading your resume...");
      toast.success("Resume saved and downloaded.");
    } catch (err) {
      console.error("Failed to save resume or generate PDF", err);
      toast.error("Could not save or download the resume. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const extractTextFromPdf = async (file: File) => {
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    (pdfjs as any).GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    const data = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => {
          const text = "str" in item ? item.str : "";
          const suffix = item?.hasEOL ? "\n" : " ";
          return `${text}${suffix}`;
        })
        .join("");
      fullText += `${pageText}\n`;
    }
    return fullText.trim();
  };

  const extractTextFromDocx = async (file: File) => {
    const mammoth = await import("mammoth/mammoth.browser");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  };

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setAiResult(null);
    setExtractedText("");

    const name = file.name.toLowerCase();
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
    const isDocx =
      name.endsWith(".docx") ||
      file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isDoc = name.endsWith(".doc") || file.type === "application/msword";

    if (!isPdf && !isDocx && !isDoc) {
      setUploadError("Only PDF or Word (.doc, .docx) files are supported.");
      return;
    }

    setIsExtracting(true);
    let text = "";
    try {
      text = isPdf ? await extractTextFromPdf(file) : await extractTextFromDocx(file);
      if (!text || text.replace(/\s/g, "").length < 50) {
        setUploadError(
          "No extractable text found. Please upload a text-based PDF or a Word file (.doc, .docx)."
        );
        return;
      }
      setExtractedText(text);
    } catch (error) {
      console.error("Resume text extraction failed", error);
      setUploadError("Could not extract text from the uploaded file.");
      return;
    } finally {
      setIsExtracting(false);
    }

  };

  const handleUploadSubmit = (event: FormEvent) => {
    event.preventDefault();
    runAiReview();
  };

  const runAiReview = async () => {
    if (!extractedText) {
      setUploadError("Please upload a resume first.");
      return;
    }
    if (isAnalyzing) return;
    setUploadError(null);
    setIsAnalyzing(true);
    try {
      await withLoader(async () => {
        const response = await fetch("/api/resumeImprove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userResume: extractedText,
            targetJob: targetJob.trim(),
            jobDescription: targetJob.trim(),
          }),
        });
        const data = (await response.json()) as AiResumeResult & { message?: string };
        if (!response.ok) {
          setUploadError(
            data?.message ||
            "AI review failed. Please try again or continue editing manually."
          );
          return;
        }
        setAiResult(data);
        const targetJobValue = targetJob.trim();
        if (data.parsedResume) {
          const normalized = normalizeParsedResume(data.parsedResume);
          if (normalized) {
            setForm((prev) => ({
              ...prev,
              ...normalized,
              title: targetJobValue || normalized.title || prev.title,
              photo: normalized.photo || prev.photo,
              summary: data.rewriteSummary || normalized.summary || prev.summary,
            }));
          } else if (targetJobValue) {
            setForm((prev) => ({
              ...prev,
              title: targetJobValue,
            }));
          }
        } else if (data.rewriteSummary) {
          setForm((prev) => ({
            ...prev,
            summary: data.rewriteSummary,
          }));
        } else if (targetJobValue) {
          setForm((prev) => ({
            ...prev,
            title: targetJobValue,
          }));
        }
      }, "Generating AI feedback...");
    } catch (error) {
      console.error("Resume AI failed", error);
      setUploadError(
        error instanceof Error ? error.message : "Failed to generate AI improvements."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderStars = (rating: number) => {
    const safe = Math.max(1, Math.min(5, Math.round(rating)));
    return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
  };

  const renderAiItem = (item: unknown) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "name" in item) {
      const name = (item as { name?: unknown }).name;
      return typeof name === "string" ? name : JSON.stringify(item);
    }
    return String(item ?? "");
  };

  const normalizeParsedResume = (parsed?: ResumeTemplate): ResumeTemplate | null => {
    if (!parsed) return null;
    const safeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const safeArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

    const skills = safeArray(parsed.skills).map((skill: any) =>
      typeof skill === "string"
        ? { name: skill, rating: 3 }
        : {
            name: safeString(skill?.name),
            rating: Math.max(1, Math.min(5, Number(skill?.rating ?? 3))),
          }
    );

    const experiences = safeArray(parsed.experiences)
      .map((exp: any) => ({
        role: safeString(exp?.role),
        company: safeString(exp?.company),
        dates: safeString(exp?.dates),
        bullets: safeArray(exp?.bullets).map((bullet) => safeString(bullet)).filter(Boolean),
      }))
      .filter((exp) => exp.role || exp.company || exp.dates || exp.bullets.length);

    const education = safeArray(parsed.education)
      .map((edu: any) => ({
        school: safeString(edu?.school),
        degree: safeString(edu?.degree),
        dates: safeString(edu?.dates),
      }))
      .filter((edu) => edu.school || edu.degree || edu.dates);

    const languages = safeArray(parsed.languages)
      .map((lang) => safeString(lang))
      .filter(Boolean);

    const certifications = safeArray(parsed.certifications)
      .map((cert: any) => {
        if (typeof cert === "string") return safeString(cert);
        if (cert && typeof cert === "object") {
          return safeString(cert?.name ?? cert?.title ?? cert?.certificate);
        }
        return "";
      })
      .filter(Boolean);

    const normalized: ResumeTemplate = {
      ...emptyState(templates[0]),
      name: safeString(parsed.name),
      title: safeString(parsed.title),
      location: safeString(parsed.location),
      email: safeString(parsed.email),
      phone: safeString(parsed.phone),
      photo: typeof parsed.photo === "string" ? parsed.photo : "",
      summary: safeString(parsed.summary),
      skills,
      languages,
      certifications,
      experiences,
      education,
    };

    const hasCore =
      normalized.name ||
      normalized.title ||
      normalized.summary ||
      normalized.skills.length ||
      normalized.experiences.length ||
      normalized.education.length ||
      normalized.certifications.length;

    return hasCore ? normalized : null;
  };

  const templateOptions = [
    {
      id: "navy",
      label: "Classic",
      description: "Educator-focused classic layout",
      image: classic,
    },
    {
      id: "clean",
      label: "Minimal White",
      description: "Bright, minimal white layout",
      image: minimal,
    },
    {
      id: "slate",
      label: "Modern Slate",
      description: "Modern slate style with bold typography",
      image: morden,
    },
  ] as const;

  const resolvePhotoSrc = (photo?: string | StaticImageData) => {
    if (typeof photo === "string") {
      const trimmed = photo.trim();
      return trimmed ? trimmed : placeholderTeacher;
    }
    return photo ?? placeholderTeacher;
  };

  const renderNavyTemplate = () => {
    const photoSrc = resolvePhotoSrc(form.photo);
    return (
      <div ref={previewRef} className={styles.navyWrapper} data-resume-template="navy">
        <div className={styles.navySidebar} data-resume-sidebar>
          <div
            className={styles.photoCircle}
            role="button"
            tabIndex={0}
            onClick={() => photoInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                photoInputRef.current?.click();
              }
            }}
            aria-label="Upload profile photo"
          >
            <Image src={photoSrc} alt="Profile" width={120} height={120} />
            <span className={styles.photoCamera} aria-hidden="true">
              📷
            </span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className={styles.photoInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(file);
              }}
            />
          </div>
          <div className={styles.sidebarBlock}>
            <h4>CONTACT</h4>
            <ul>
              <li>{form.phone}</li>
              <li>{form.email}</li>
              <li>{form.location}</li>
            </ul>
          </div>
          <div className={styles.sidebarBlock}>
            <h4>EDUCATION</h4>
            <ul>
              {form.education.map((edu, idx) => (
                <li key={idx}>
                  <div className={styles.bold}>{edu.school}</div>
                  <div>{edu.degree}</div>
                  <div>{edu.dates}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.sidebarBlock}>
            <h4>SKILLS</h4>
            <ul>
              {form.skills.map((skill, idx) => (
                <li key={idx} className={styles.skillRow}>
                  <span className={styles.skillName}>{skill.name}</span>
                  <span className={styles.skillStars}>{renderStars(skill.rating)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.sidebarBlock}>
            <h4>LANGUAGES</h4>
            <ul>
              {form.languages.map((lang, idx) => (
                <li key={idx}>{lang}</li>
              ))}
            </ul>
          </div>
          {form.certifications.length > 0 && (
            <div className={styles.sidebarBlock}>
              <h4>CERTIFICATIONS</h4>
              <ul>
                {form.certifications.map((cert, idx) => (
                  <li key={idx}>{cert}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.navyMain}>
          <div className={styles.navyHeaderText}>
            <div className={styles.resumeName}>{form.name}</div>
            <div className={styles.resumeTitle}>{form.title}</div>
          </div>

          <div className={styles.divider} />

          <div className={styles.resumeSection}>
            <h4>PROFILE</h4>
            <div className={styles.resumeList} style={{ listStyle: "none", paddingLeft: 0 }}>
              <div>{form.summary}</div>
            </div>
          </div>

          <div className={styles.resumeSection}>
            <h4>WORK EXPERIENCE</h4>
            <ul className={styles.resumeList}>
              {form.experiences.map((exp, idx) => (
                <li key={idx}>
                  <div className={styles.resumeItemTitle}>{exp.company}</div>
                  <div className={styles.resumeTitleSmall}>{exp.role}</div>
                  <div className={styles.resumeMeta}>{exp.dates}</div>
                  <ul className={styles.resumeList}>
                    {exp.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderCleanTemplate = () => {
    const photoSrc = resolvePhotoSrc(form.photo);
    return (
      <div ref={previewRef} className={styles.cleanWrapper}>
        <div className={styles.cleanHeader}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div>
                <div className={styles.cleanName}>{form.name}</div>
                <div className={styles.cleanTitle}>{form.title}</div>
              </div>
          </div>
          <div className={`${styles.cleanMeta} ${styles.personalMeta}`}>
            <span>✉ {form.email}</span>
            <span>☎ {form.phone}</span>
            <span>📍 {form.location}</span>
          </div>
        </div>

        <div className={styles.cleanDivider} />
        <div className={styles.cleanGrid}>
          <div>
            <div className={styles.cleanSection}>
              <h4>Profile</h4>
              <p>{form.summary}</p>
            </div>
            <div className={styles.cleanSection}>
              <h4>Experience</h4>
              {form.experiences.map((exp, idx) => (
                <div key={idx} className={styles.cleanItem}>
                  <div className={styles.cleanItemTitle}>
                    {exp.role} — {exp.company}
                  </div>
                  <div className={styles.cleanItemMeta}>{exp.dates}</div>
                  <ul>
                    {exp.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.cleanSection}>
              <h4>Skills</h4>
              <ul>
                {form.skills.map((skill, idx) => (
                  <li key={idx} className={styles.skillRow}>
                    <span className={styles.skillName}>{skill.name}</span>
                    <span className={styles.skillStars}>{renderStars(skill.rating)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.cleanSection}>
              <h4>Education</h4>
              {form.education.map((edu, idx) => (
                <div key={idx} className={styles.cleanItem}>
                  <div className={styles.cleanItemTitle}>{edu.school}</div>
                  <div>{edu.degree}</div>
                  <div className={styles.cleanItemMeta}>{edu.dates}</div>
                </div>
              ))}
            </div>
            <div className={styles.cleanSection}>
              <h4>Languages</h4>
              <ul>
                {form.languages.map((lang, idx) => (
                  <li key={idx}>{lang}</li>
                ))}
              </ul>
            </div>
            {form.certifications.length > 0 && (
              <div className={styles.cleanSection}>
                <h4>Certifications</h4>
                <ul>
                  {form.certifications.map((cert, idx) => (
                    <li key={idx}>{cert}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSlateTemplate = () => {
    const photoSrc = resolvePhotoSrc(form.photo);
    return (
      <div ref={previewRef} className={styles.slateWrapper}>
        <div className={styles.slateHeader}>
          <div className={styles.slatePhoto}>
            <Image src={photoSrc} alt="Profile" width={90} height={90} />
          </div>
          <div>
            <div className={styles.slateName}>{form.name}</div>
            <div className={styles.slateTitle}>{form.title}</div>
            <div className={`${styles.slateMeta} ${styles.personalMeta}`}>
              {form.email} • {form.phone} • {form.location}
            </div>
          </div>
        </div>
        <div className={styles.slateDivider} />
        <div className={styles.slateSection}>
          <h4>Summary</h4>
          <p>{form.summary}</p>
        </div>
        <div className={styles.slateTwoCol}>
          <div>
            <div className={styles.slateSection}>
              <h4>Experience</h4>
              {form.experiences.map((exp, idx) => (
                <div key={idx} className={styles.slateItem}>
                  <div className={styles.slateItemTitle}>{exp.role}</div>
                  <div className={styles.slateItemMeta}>
                    {exp.company} • {exp.dates}
                  </div>
                  <ul>
                    {exp.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.slateSection}>
              <h4>Skills</h4>
              <ul>
                {form.skills.map((skill, idx) => (
                  <li key={idx} className={styles.skillRow}>
                    <span className={styles.skillName}>{skill.name}</span>
                    <span className={styles.skillStars}>{renderStars(skill.rating)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.slateSection}>
              <h4>Education</h4>
              {form.education.map((edu, idx) => (
                <div key={idx} className={styles.slateItem}>
                  <div className={styles.slateItemTitle}>{edu.school}</div>
                  <div className={styles.slateItemMeta}>{edu.degree}</div>
                  <div className={styles.slateItemMeta}>{edu.dates}</div>
                </div>
              ))}
            </div>
            <div className={styles.slateSection}>
              <h4>Languages</h4>
              <ul>
                {form.languages.map((lang, idx) => (
                  <li key={idx}>{lang}</li>
                ))}
              </ul>
            </div>
            {form.certifications.length > 0 && (
              <div className={styles.slateSection}>
                <h4>Certifications</h4>
                <ul>
                  {form.certifications.map((cert, idx) => (
                    <li key={idx}>{cert}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

    return (
      <Layout>
      <>
        <div className={`${styles.header} ${styles.noPrint}`}>
          <div>
            <h2 className={styles.title}>AI Resume Builder</h2>
            <p className={styles.subtitle}>
              Pick a template and personalize it with your info, skills, and experience.
            </p>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabButton} ${activeTab === "upload" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            🚀 Upload Resume
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "manual" && manualMode === "build" ? styles.tabActive : ""}`}
            onClick={() => {
              setActiveTab("manual");
              setManualMode("build");
            }}
          >
            💼 Build Manually
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "manual" && manualMode === "edit" ? styles.tabActive : ""}`}
            onClick={() => {
              setActiveTab("manual");
              setManualMode("edit");
            }}
          >
            ✏️ Edit Resume
          </button>
        </div>

        <div className={styles.layout}>
          <div className={`${styles.card} ${styles.noPrint}`}>
            {activeTab === "upload" && (
              <>
                <form className={styles.uploadCard} onSubmit={handleUploadSubmit}>
                  <div className={styles.formHeader}>
                    <h3 className={styles.sectionTitle}>Upload your CV</h3>
                  </div>
                  <p className={styles.uploadHint}>
                    Upload a PDF or Word document (.doc, .docx). We will extract the text before
                    sending it to AI.
                  </p>
                  <div className="form-group">
                    <label htmlFor="target-job">Target Role or Job Description *</label>
                    <input
                      id="target-job"
                      type="text"
                      className="form-control"
                      value={targetJob}
                      onChange={(e) => {
                        setTargetJob(e.target.value);
                      }}
                      placeholder="e.g. High School English Teacher or paste a short job summary"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <div className={styles.uploadRow}>
                        <label className={styles.fileButton}>
                          📄 Upload your resume here
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className={styles.fileInputHidden}
                            required
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setUploadFileName(file.name);
                                handleFileUpload(file);
                              }
                            }}
                          />
                        </label>
                        <span className={styles.fileName}>
                          {uploadFileName || "No file selected"}
                        </span>
                      </div>
                      {isExtracting && <p className={styles.uploadStatus}>Extracting text...</p>}
                      {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
                    </div>
                  <div className="form-group">
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={
                        isExtracting ||
                        isAnalyzing ||
                        !targetJob.trim() ||
                        !extractedText.trim()
                      }
                      aria-busy={isAnalyzing}
                    >
                      {isAnalyzing ? "Submitting..." : "Submit"}
                    </button>
                  </div>

                </form>


                {aiResult && (
                  <>
                  <h2 className={styles.aiResumeTitle}>AI Feedback based on target role</h2>
                  <div ref={aiResultRef} className={styles.aiCard}>
                      <div className={styles.aiHeader}>
                        <h3 className={styles.sectionTitle}>✨ AI Resume Review</h3>
                        <span className={styles.aiScore}>⭐ {aiResult.score}/100</span>
                      </div>
                      <p className={styles.aiSummary}>{aiResult.summary}</p>
                      {!!aiResult.strengths.length && (
                        <div className={styles.aiBlock}>
                          <h4>✅ Strengths</h4>
                          <ul>
                            {aiResult.strengths.map((item, idx) => (
                              <li key={idx}>{renderAiItem(item)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!!aiResult.improvements.length && (
                        <div className={styles.aiBlock}>
                          <h4>🛠️ Improvements</h4>
                          <ul>
                            {aiResult.improvements.map((item, idx) => (
                              <li key={idx}>{renderAiItem(item)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!!aiResult.suggestions.length && (
                        <div className={styles.aiBlock}>
                          <h4>💡 Suggestions</h4>
                          <ul>
                            {aiResult.suggestions.map((item, idx) => (
                              <li key={idx}>{renderAiItem(item)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiResult.rewriteSummary && (
                        <div className={styles.aiBlock}>
                          <h4>📝 Suggested Summary</h4>
                          <p>{aiResult.rewriteSummary}</p>
                        </div>
                      )}
                      {!!aiResult.keywords.length && (
                        <div className={styles.aiBlock}>
                          <h4>🏷️ Suggested Keywords</h4>
                          <div className={styles.keywordList}>
                            {aiResult.keywords.map((item, idx) => (
                              <span key={idx} className={styles.keywordTag}>
                                {renderAiItem(item)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className={styles.aiBlock}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setActiveTab("manual")}
                        >
                          Edit Resume
                        </button>
                      </div>
                    </div></>
                )}
              </>
            )}

            {activeTab === "manual" && (
              <>
                <div className={styles.formHeader}>
                  <h3 className={styles.sectionTitle}>Fill your details</h3>
                </div>
                <details className={styles.accordion} open>
                  <summary className={styles.accordionHeader}>Basic Info</summary>
                  <div className={styles.accordionBody}>
                    <div className={styles.formGrid}>
                      <div className="form-group">
                        <label >Full Name</label>
                        <input
                          className="form-control"
                          value={form.name}
                          placeholder="Jane Doe"
                          onChange={(e) => updateField("name", e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label >Title</label>
                        <input
                          className="form-control"
                          value={form.title}
                          placeholder="High School English Teacher"
                          onChange={(e) => updateField("title", e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label >Location</label>
                        <input
                          className="form-control"
                          value={form.location}
                          placeholder="City, Country"
                          onChange={(e) => updateField("location", e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label >Email</label>
                        <input
                          className="form-control"
                          value={form.email}
                          placeholder="you@example.com"
                          onChange={(e) => updateField("email", e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label >Phone</label>
                        <input
                          className="form-control"
                          value={form.phone}
                          placeholder="+1 234 567 8901"
                          onChange={(e) => updateField("phone", e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label >Photo URL (optional)</label>
                        <input
                          className="form-control"
                          value={typeof form.photo === "string" ? form.photo : ""}
                          placeholder="https://example.com/photo.jpg"
                          onChange={(e) => updateField("photo", e.target.value)}
                        />
                        <input
                          type="file"
                          accept="image/*"
                          className={styles.fileInputSmall}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </details>

                <details className={styles.accordion}>
                  <summary className={styles.accordionHeader}>Profile Summary</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label >Profile Summary</label>
                      <textarea
                        className="form-control"
                        value={form.summary}
                        placeholder="Summarize your experience and value in 3-5 sentences."
                        onChange={(e) => updateField("summary", e.target.value)}
                      />
                    </div>
                  </div>
                </details>

                <details className={styles.accordion}>
                  <summary className={styles.accordionHeader}>Skills</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label >Skills (tags)</label>
                      <div className={styles.skillsRow}>
                        <input
                          className={`form-control ${styles.skillInput}`}
                          value={skillInput}
                          placeholder="e.g., Lesson Planning, Differentiated Instruction"
                          onChange={(e) => setSkillInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addSkill();
                            }
                          }}
                        />
                        <select
                          className={styles.ratingSelect}
                          value={skillRating}
                          onChange={(e) => setSkillRating(Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5].map((r) => (
                            <option key={r} value={r}>
                              {r}/5
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn-primary" onClick={addSkill}>
                          Add
                        </button>
                      </div>
                      <div className={styles.tagList}>
                        {form.skills.map((skill) => (
                          <div key={skill.name} className={styles.tag}>
                            <span>{skill.name}</span>
                            <span className={styles.starText}>{renderStars(skill.rating)}</span>
                            <select
                              className={styles.ratingSelectSmall}
                              value={skill.rating}
                              onChange={(e) =>
                                updateSkillRating(skill.name, Number(e.target.value))
                              }
                            >
                              {[1, 2, 3, 4, 5].map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => removeSkill(skill.name)}>
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <details className={styles.accordion}>
                  <summary className={styles.accordionHeader}>Languages</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label >Languages</label>
                      <div className={styles.skillsRow}>
                        <input
                          className="form-control"
                          value={languageInput}
                          placeholder="e.g., English, Hindi"
                          onChange={(e) => setLanguageInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addLanguage();
                            }
                          }}
                        />
                        <button type="button" className="btn-primary" onClick={addLanguage}>
                          Add
                        </button>
                      </div>
                      <div className={styles.tagList}>
                        {form.languages.map((lang) => (
                          <div key={lang} className={styles.tag}>
                            <span>{lang}</span>
                            <button type="button" onClick={() => removeLanguage(lang)}>
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <details className={styles.accordion}>
                  <summary className={styles.accordionHeader}>Certifications</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label>Certifications</label>
                      <div className={styles.skillsRow}>
                        <input
                          className="form-control"
                          value={certificationInput}
                          placeholder="e.g., TESOL Certification"
                          onChange={(e) => setCertificationInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCertification();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={addCertification}
                        >
                          Add
                        </button>
                      </div>
                      <div className={styles.tagList}>
                        {form.certifications.map((cert) => (
                          <div key={cert} className={styles.tag}>
                            <span>{cert}</span>
                            <button type="button" onClick={() => removeCertification(cert)}>
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <details className={styles.accordion}>
                  <summary className={styles.accordionHeader}>Experience</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label>Experiences</label>
                      {form.experiences.map((exp, idx) => (
                        <div key={idx} className={styles.card} style={{ padding: 12, marginBottom: 8 }}>
                          <div className={styles.formGrid}>
                            <div className="form-group">
                              <label >Role</label>
                              <input
                                className="form-control"
                                value={exp.role}
                                onChange={(e) => updateExperience(idx, "role", e.target.value)}
                                placeholder="English Teacher"
                              />
                            </div>
                            <div className="form-group">
                              <label >Company</label>
                              <input
                                className="form-control"
                                value={exp.company}
                                onChange={(e) => updateExperience(idx, "company", e.target.value)}
                                placeholder="School Name"
                              />
                            </div>
                            <div className="form-group">
                              <label >Dates</label>
                              <input
                                className="form-control"
                                value={exp.dates}
                                onChange={(e) => updateExperience(idx, "dates", e.target.value)}
                                placeholder="2023 - Present"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label >Highlights (one per line)</label>
                            <textarea
                              className="form-control"
                              value={exp.bullets.join("\n")}
                              onChange={(e) =>
                                updateExperience(idx, "bullets", e.target.value.split("\n").filter(Boolean))
                              }
                            />
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => removeExperience(idx)}
                          >
                            Remove Experience
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn-primary" onClick={addExperience}>
                        Add Experience
                      </button>
                    </div>
                  </div>
                </details>

                <details className={styles.accordion}>
                  <summary className={styles.accordionHeader}>Education</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label >Education</label>
                      {form.education.map((edu, idx) => (
                        <div key={idx} className={styles.card} style={{ padding: 12, marginBottom: 8 }}>
                          <div className={styles.formGrid}>
                            <div className="form-group">
                              <label >School</label>
                              <input
                                className="form-control"
                                value={edu.school}
                                onChange={(e) => updateEducation(idx, "school", e.target.value)}
                                placeholder="University Name"
                              />
                            </div>
                            <div className="form-group">
                              <label >Degree</label>
                              <input
                                className="form-control"
                                value={edu.degree}
                                onChange={(e) => updateEducation(idx, "degree", e.target.value)}
                                placeholder="Degree / Major"
                              />
                            </div>
                            <div className="form-group">
                              <label >Dates</label>
                              <input
                                className="form-control"
                                value={edu.dates}
                                onChange={(e) => updateEducation(idx, "dates", e.target.value)}
                                placeholder="2019 - 2023"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => removeEducation(idx)}
                          >
                            Remove Education
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn-primary" onClick={addEducation}>
                        Add Education
                      </button>
                    </div>
                  </div>
                </details>
        <div className={`${styles.downloadActions} ${styles.noPrint}`}>
          <button
            type="button"
            className={`btn-primary ${styles.tabButton}`}
            onClick={() => {
              scrollToPreviewHeader();
            }}
          >
            Review Resume
          </button>
          <button
            type="button"
            className={`btn-primary ${styles.downloadResume}`}
            title="Save and Download PDF"
            onClick={saveDownloadResume}
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving..." : "Save and Download"}
          </button>
        </div>

              </>
            )}
          </div>

          <div className={`${styles.card} ${styles.previewCard} ${styles.printArea}`}>
            <div ref={previewHeaderRef} className={styles.previewHeader}>
              <h3 className={styles.sectionTitle}>Preview</h3>
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setIsTemplateModalOpen(true)}
                >
                  Choose Template
                </button>
              </div>
            </div>
            <div className={styles.selectedTemplateInfo}>
              <span className={styles.selectedTemplateLabel}>Selected Template</span>
              <span className={styles.selectedTemplateValue}>
                {templateOptions.find((option) => option.id === previewTemplate)?.label ??
                  "Classic"}
              </span>
            </div>

            {isTemplateModalOpen && (
              <div
                className={styles.templateModalBackdrop}
                role="dialog"
                aria-modal="true"
                aria-label="Choose a template"
                onClick={() => setIsTemplateModalOpen(false)}
              >
                <div
                  className={styles.templateModal}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={styles.templateModalHeader}>
                    <div>
                      <h4 className={styles.templateModalTitle}>Choose a Template</h4>
                      <p className={styles.templateModalSubtitle}>
                        Pick a classic, minimal, or modern layout for your resume preview.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.templateModalClose}
                      onClick={() => setIsTemplateModalOpen(false)}
                      aria-label="Close template chooser"
                    >
                      ✕
                    </button>
                  </div>

                  <div className={styles.templateModalGrid}>
                    {templateOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`${styles.templateCard} ${previewTemplate === option.id
                          ? styles.templateCardActive
                          : ""
                          }`}
                        onClick={() => {
                          setPreviewTemplate(option.id);
                          setIsTemplateModalOpen(false);
                        }}
                      >
                        <div className={styles.templateThumb} aria-hidden="true">
                          <Image
                            src={option.image}
                            alt={`${option.label} template preview`}
                            className={styles.templateThumbImage}
                          />
                        </div>
                        <div className={styles.templateCardText}>
                          <div className={styles.templateCardTitle}>{option.label}</div>
                          <div className={styles.templateCardSubtitle}>
                            {option.description}
                          </div>
                        </div>
                        {previewTemplate === option.id && (
                          <span className={styles.templateCardBadge}>Selected</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {previewTemplate === "navy"
              ? renderNavyTemplate()
              : previewTemplate === "clean"
                ? renderCleanTemplate()
                : renderSlateTemplate()}

            <div className={styles.downloadActions}>
              <button
                type="button"
                className={`btn-primary ${styles.downloadResume}`}
                title="Save and Download PDF"
                onClick={saveDownloadResume}
                disabled={isSaving}
                aria-busy={isSaving}
              >
                {isSaving ? "Saving..." : "Save and Download"}
              </button>
              <button
                type="button"
                className={`btn-primary ${styles.tabButton}`}
                onClick={() => {
                  setActiveTab("manual");
                  setManualMode("edit");
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                ✏️ Edit Resume
              </button>
            </div>
          </div>
        </div>
      </>
    </Layout>
  );
}








