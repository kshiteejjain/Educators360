import { useMemo, useState, useRef, useEffect } from "react";
import Image, { type StaticImageData } from "next/image";
import type { FormEvent } from "react";
import Layout from "@/components/Layout/Layout";
import styles from "./ResumeBuilder.module.css";
import { useLoader } from "@/components/Loader/LoaderProvider";
import { getSession } from "@/utils/authSession";
import { getDb } from "@/utils/firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  const [previewTemplate, setPreviewTemplate] = useState<"navy" | "clean" | "slate">("navy");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<AiResumeResult | null>(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [targetJob, setTargetJob] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [manualMode, setManualMode] = useState<"build" | "edit">("build");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { withLoader } = useLoader();
  const aiResultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiResult && aiResultRef.current) {
      aiResultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [aiResult]);

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

  const removeEducation = (index: number) => {
    setForm((prev) => ({
      ...prev,
      education: prev.education.filter((_, idx) => idx !== index),
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

    try {
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
        },
      };

      await setDoc(userRef, { resume: resumePayload }, { merge: true });

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
        backgroundColor: null,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = pageWidth / canvas.width;
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = 0;
      const y = 0;
      pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);

      const nameSlug = (form.name || "resume").replace(/\s+/g, "-").toLowerCase();
      const roleSlug = (form.title || selectedTemplate.title || "role")
        .replace(/\s+/g, "-")
        .toLowerCase();
      pdf.save(`${nameSlug}-${roleSlug}.pdf`);
      toast.success("Resume saved and downloaded.");
    } catch (err) {
      console.error("Failed to save resume or generate PDF", err);
      toast.error("Could not save or download the resume. Please try again.");
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
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
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
      setUploadError("Only PDF or Word (.docx) files are supported.");
      return;
    }

    if (isDoc) {
      setUploadError("Please upload a .docx file (legacy .doc is not supported).");
      return;
    }

    setIsExtracting(true);
    let text = "";
    try {
      text = isPdf ? await extractTextFromPdf(file) : await extractTextFromDocx(file);
      if (!text || text.replace(/\s/g, "").length < 50) {
        setUploadError(
          "No extractable text found. Please upload a text-based PDF or a DOCX file."
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
            jobDescription: jobDescription.trim(),
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
        if (data.parsedResume) {
          const parsedResume = data.parsedResume;
          const normalizedSkills = (parsedResume.skills || []).map((skill: any) =>
            typeof skill === "string"
              ? { name: skill, rating: 3 }
              : {
                name: String(skill?.name ?? ""),
                rating: Math.max(1, Math.min(5, Number(skill?.rating ?? 3))),
              }
          );
          setForm((prev) => ({
            ...prev,
            ...parsedResume,
            photo: parsedResume.photo || prev.photo,
            skills: normalizedSkills,
            languages: parsedResume.languages || [],
            experiences: parsedResume.experiences || [],
            education: parsedResume.education || [],
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
      <div ref={previewRef} className={styles.navyWrapper}>
        <div className={styles.navySidebar}>
          <div className={styles.photoCircle}>
            <Image src={photoSrc} alt="Profile" width={120} height={120} />
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
          <div className={styles.cleanMeta}>
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
            <div className={styles.slateMeta}>
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
                    Upload a PDF or DOCX. We will extract the text before sending it to AI.
                  </p>
                  <div className="form-group">
                    <label htmlFor="target-job">Target Role *</label>
                    <input
                      id="target-job"
                      type="text"
                      className="form-control"
                      value={targetJob}
                      onChange={(e) => {
                        setTargetJob(e.target.value);
                      }}
                      placeholder="e.g. Primary English Teacher"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="job-description">Job Description *</label>
                    <textarea
                      id="job-description"
                      className="form-control"
                      value={jobDescription}
                      onChange={(e) => {
                        setJobDescription(e.target.value);
                      }}
                      placeholder="Paste the job description here..."
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
                        disabled={isExtracting || isAnalyzing}
                      aria-busy={isAnalyzing}
                    >
                      {isAnalyzing ? "Submitting..." : "Submit"}
                    </button>
                  </div>

                </form>


                {aiResult && (
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
                  </div>
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
                          placeholder="Product Manager"
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
                          placeholder="e.g., React, SQL, Leadership"
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
                  <summary className={styles.accordionHeader}>Experience</summary>
                  <div className={styles.accordionBody}>
                    <div className="form-group">
                      <label >Experiences</label>
                      {form.experiences.map((exp, idx) => (
                        <div key={idx} className={styles.card} style={{ padding: 12, marginBottom: 8 }}>
                          <div className={styles.formGrid}>
                            <div className="form-group">
                              <label >Role</label>
                              <input
                                className="form-control"
                                value={exp.role}
                                onChange={(e) => updateExperience(idx, "role", e.target.value)}
                                placeholder="Job Title"
                              />
                            </div>
                            <div className="form-group">
                              <label >Company</label>
                              <input
                                className="form-control"
                                value={exp.company}
                                onChange={(e) => updateExperience(idx, "company", e.target.value)}
                                placeholder="Company"
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
                        </div>
                      ))}
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

              </>
            )}
          </div>

          <div className={`${styles.card} ${styles.previewCard} ${styles.printArea}`}>
            <div className={styles.previewHeader}>
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

            <button
              type="button"
              className={`btn-primary ${styles.downloadResume}`}
              title="Save and Download PDF"
              onClick={saveDownloadResume}
            >
              Save and Download
            </button>
          </div>
        </div>
      </>
    </Layout>
  );
}








