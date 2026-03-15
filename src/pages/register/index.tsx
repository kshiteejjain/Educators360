import { useState } from "react";
import { useRouter } from "next/router";
import styles from "./Register.module.css";
import { createRecordFromSchema } from "@/utils/schemaUtils";
import {
  registerFormSchema,
  type RegisterFormRecord,
} from "@/utils/formSchemas";
import { toast } from "react-toastify";
import { useLoader } from "@/components/Loader/LoaderProvider";

const initialFormState: RegisterFormRecord = {
  ...createRecordFromSchema(registerFormSchema),
};

const currentRoles = [
  "Teacher - Pre Primary",
  "Teacher - 1 to 5 Grade",
  "Teacher - 6 to 12 Grade",
  "College Faculty",
  "School Leadership / Management",
  "Coach / Trainer / Private Tutor",
  "Fresh Graduate / Trainee Teacher",
  "Student",
  "Homemaker",
  "Not from Teaching background",
  "ATL Trainer / Robotics Teacher",
  "Other",
];

const subjects = [
  "Pre-Primary - All Subjects",
  "Primary - All Subjects",
  "Mathematics",
  "Science",
  "Social Science",
  "Language",
  "ICT / Computer Science",
  "Other",
  "Non Teaching Role",
];

const boards = [
  "State Board",
  "CBSE",
  "ICSE",
  "Cambridge (IGCSE)",
  "IB",
  "Not Applicable",
];

export default function Register() {
  const router = useRouter();
  const [formData, setFormData] = useState<RegisterFormRecord>(initialFormState);
  const [step, setStep] = useState<1 | 2>(1);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { withLoader, isLoading } = useLoader();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const field = e.target.name as keyof RegisterFormRecord;
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value } as RegisterFormRecord));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[field];
        return nextErrors;
      });
    }
  };

  const validateFields = (fields: (keyof RegisterFormRecord)[]) => {
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      const value = String(formData[field] ?? "").trim();
      if (!value) {
        nextErrors[field] = "This field is required.";
      }
    });
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    const stepOneFields: (keyof RegisterFormRecord)[] = [
      "name",
      "email",
      "mobileNumber",
      "city",
    ];
    if (validateFields(stepOneFields)) {
      setStep(2);
    }
  };

  const handleBack = () => setStep(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1) {
      handleNext();
      return;
    }

    const allFields: (keyof RegisterFormRecord)[] = [
      "name",
      "email",
      "mobileNumber",
      "city",
      "currentRole",
      "subject",
      "board",
      "organizationName",
      "password",
    ];

    if (!validateFields(allFields)) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const record = {
      name: formData.name,
      email: formData.email,
      mobileNumber: formData.mobileNumber,
      city: formData.city,
      currentRole: formData.currentRole,
      subject: formData.subject,
      board: formData.board,
      organizationName: formData.organizationName,
      password: formData.password,
      createdAt: new Date().toISOString(),
    };

    try {
      await withLoader(async () => {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
        const response = await fetch(`${apiBaseUrl}/api/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message =
            (errorBody as { message?: string }).message ??
            "Could not register right now. Please try again.";
          toast.error(message);
          return;
        }

        toast.success(`Welcome ${formData.name}! Your registration is complete.`);
        router.push("/login");
      }, "Creating your account...");
    } catch (error) {
      console.error("Failed to register via API", error);
      toast.error("Could not register right now. Please try again.");
    }
  };

  return (
    <div className={styles.registerPage}>
      {/* Left Section (Same visual as login) */}
      <div className={styles.leftSection}>
        <div className="overlay">
          <h1 className={styles.brand}>upEducatePlus</h1>
          <p className={styles.tagline}>
            Join our vibrant learning community and unlock your potential.
          </p>
        </div>
      </div>

      {/* Right Section (Form) */}
      <div className={styles.rightSection}>
        <div className={styles.formContainer}>
          <h2 className={styles.heading}>Create Your Account</h2>
          <p className={styles.subHeading}>
            Register to start your journey with upEducatePlus
          </p>

          <form onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    name="name"
                    className="form-control"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                  {fieldErrors.name && (
                    <p className={styles.fieldError}>{fieldErrors.name}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                  {fieldErrors.email && (
                    <p className={styles.fieldError}>{fieldErrors.email}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Mobile Number *</label>
                  <input
                    type="tel"
                    name="mobileNumber"
                    className="form-control"
                    placeholder="Enter mobile number"
                    value={formData.mobileNumber}
                    onChange={handleChange}
                    required
                  />
                  {fieldErrors.mobileNumber && (
                    <p className={styles.fieldError}>{fieldErrors.mobileNumber}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>City *</label>
                  <input
                    type="text"
                    name="city"
                    className="form-control"
                    placeholder="Enter your city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                  />
                  {fieldErrors.city && (
                    <p className={styles.fieldError}>{fieldErrors.city}</p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                  disabled={isLoading}
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>What is your current role? *</label>
                  <select
                    name="currentRole"
                    className="form-control"
                    value={formData.currentRole}
                    onChange={handleChange}
                    required
                  >
                    <option value="" disabled>
                      Select your current role
                    </option>
                    {currentRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.currentRole && (
                    <p className={styles.fieldError}>{fieldErrors.currentRole}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Which Subject do you teach or want to teach? *</label>
                  <select
                    name="subject"
                    className="form-control"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                  >
                    <option value="" disabled>
                      Select subject
                    </option>
                    {subjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.subject && (
                    <p className={styles.fieldError}>{fieldErrors.subject}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>You teach students from which Board? *</label>
                  <select
                    name="board"
                    className="form-control"
                    value={formData.board}
                    onChange={handleChange}
                    required
                  >
                    <option value="" disabled>
                      Select board
                    </option>
                    {boards.map((board) => (
                      <option key={board} value={board}>
                        {board}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.board && (
                    <p className={styles.fieldError}>{fieldErrors.board}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Name of the Organisation you work in *</label>
                  <input
                    type="text"
                    name="organizationName"
                    className="form-control"
                    placeholder="Enter organisation name"
                    value={formData.organizationName}
                    onChange={handleChange}
                    required
                  />
                  {fieldErrors.organizationName && (
                    <p className={styles.fieldError}>
                      {fieldErrors.organizationName}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    name="password"
                    className="form-control"
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  {fieldErrors.password && (
                    <p className={styles.fieldError}>{fieldErrors.password}</p>
                  )}
                </div>

                <div className={styles.stepActions}>
                  <button
                    type="button"
                    className={`btn-secondary ${styles.btnSecondary}`}
                    onClick={handleBack}
                    disabled={isLoading}
                  >
                    Back
                  </button>
                  <button type="submit" className="btn-primary" disabled={isLoading}>
                    {isLoading ? "Registering..." : "Register"}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className={styles.terms}>
            Already have an account?{" "}
            <a
              href="#"
              onClick={() => router.push("/login")}
              className="link"
            >
              Login here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
