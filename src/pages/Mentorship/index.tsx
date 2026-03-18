import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import Layout from "@/components/Layout/Layout";
import styles from "./Mentorship.module.css";

type TimeSlot = {
  time: string;
  available: boolean;
};

type BookingStep = "mentor" | "date" | "time" | "details" | "confirmation";

const MENTORS = [
  {
    id: 1,
    name: "Ankush Bhandari",
    title: "Founder",
    company: "upEducators",
    bio: "Founder upEducators - Google For Education Partner Company - offering Online Professional Development Courses to Educators. We have trained 10,000+ Educators teachers from nearly about 3,000+ Educational Institutes in India.",
    expertise: ["Entrepreneurship", "Portfolio Management", "Training", "Wealth Management"],
    experience: "10+ Years",
    avatar: "ðŸ‘¤",
    photo: "/ankush-bhandari.jpg",
    color: "gradient-blue",
    rating: 4.9,
    reviews: 145,
  },
];

const TIME_SLOTS: TimeSlot[] = [
  { time: "09:00 AM", available: true },
  { time: "09:30 AM", available: true },
  { time: "10:00 AM", available: false },
  { time: "10:30 AM", available: true },
  { time: "02:00 PM", available: true },
  { time: "02:30 PM", available: true },
  { time: "03:00 PM", available: false },
  { time: "03:30 PM", available: true },
  { time: "04:00 PM", available: true },
  { time: "04:30 PM", available: true },
];

export default function Mentorship() {
  const [currentStep, setCurrentStep] = useState<BookingStep>("mentor");
  const [selectedMentor, setSelectedMentor] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [bookingDetails, setBookingDetails] = useState({
    name: "",
    email: "",
    phone: "",
    topic: "",
    message: "",
  });

  const getNextAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const availableDates = useMemo(() => getNextAvailableDates(), []);

  const _formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleMentorSelect = (mentorId: number) => {
    setSelectedMentor(mentorId);
    setCurrentStep("date");
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date.toISOString().split("T")[0]);
    setCurrentStep("time");
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setCurrentStep("details");
  };

  const handleDetailsChange = (field: string, value: string) => {
    setBookingDetails((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleBooking = async () => {
    // Validate all fields
    if (
      !bookingDetails.name ||
      !bookingDetails.email ||
      !bookingDetails.phone ||
      !bookingDetails.topic
    ) {
      alert("Please fill in all required fields");
      return;
    }

    // Here you would typically send the booking to your backend
    console.log({
      mentor: MENTORS.find((m) => m.id === selectedMentor),
      date: selectedDate,
      time: selectedTime,
      details: bookingDetails,
    });

    setCurrentStep("confirmation");
  };

  const handleBookAnother = () => {
    setCurrentStep("mentor");
    setSelectedMentor(null);
    setSelectedDate("");
    setSelectedTime("");
    setBookingDetails({
      name: "",
      email: "",
      phone: "",
      topic: "",
      message: "",
    });
  };

  const currentMentor = MENTORS.find((m) => m.id === selectedMentor);

  return (
    <Layout>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1>Schedule 1:1 Mentorship Call</h1>
          <p>Get personalized guidance from industry experts</p>
        </div>

        {/* Progress Indicator */}
        <div className={styles.progressBar}>
          <div className={`${styles.step} ${currentStep === "mentor" || ["date", "time", "details", "confirmation"].includes(currentStep) ? styles.active : ""}`}>
            <span>1</span>
            <p>Select Mentor</p>
          </div>
          <div className={styles.connector} />
          <div className={`${styles.step} ${currentStep === "date" || ["time", "details", "confirmation"].includes(currentStep) ? styles.active : ""}`}>
            <span>2</span>
            <p>Choose Date</p>
          </div>
          <div className={styles.connector} />
          <div className={`${styles.step} ${currentStep === "time" || ["details", "confirmation"].includes(currentStep) ? styles.active : ""}`}>
            <span>3</span>
            <p>Select Time</p>
          </div>
          <div className={styles.connector} />
          <div className={`${styles.step} ${currentStep === "details" || currentStep === "confirmation" ? styles.active : ""}`}>
            <span>4</span>
            <p>Your Details</p>
          </div>
        </div>

        {/* Step Content */}
        {currentStep === "mentor" && (
          <div className={styles.stepContent}>
            <div className={styles.mentorGrid}>
              {MENTORS.map((mentor) => (
                <div
                  key={mentor.id}
                  className={`${styles.mentorCard} ${selectedMentor === mentor.id ? styles.selected : ""}`}
                  onClick={() => handleMentorSelect(mentor.id)}
                >
                  <div className={styles.mentorHeader}>
                    <div className={`${styles.avatar} ${styles[mentor.color]}`}>
                      {mentor.photo ? (
                        <Image src={mentor.photo} alt={mentor.name} className={styles.avatarImage} width={80} height={80} />
                      ) : (
                        mentor.avatar
                      )}
                    </div>
                    <div className={styles.rating}>
                      <span className={styles.stars}>â­ {mentor.rating}</span>
                      <span className={styles.reviews}>({mentor.reviews} reviews)</span>
                    </div>
                  </div>

                  <h3>{mentor.name}</h3>
                  <p className={styles.title}>{mentor.title}</p>
                  <p className={styles.company}>{mentor.company}</p>

                  <p className={styles.bio}>{mentor.bio}</p>

                  <div className={styles.expertise}>
                    {mentor.expertise.map((skill, idx) => (
                      <span key={idx} className={styles.expertiseTag}>
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className={styles.meta}>
                    <span>ðŸ• {mentor.experience}</span>
                  </div>

                  <button className={styles.selectBtn}>
                    {selectedMentor === mentor.id ? "âœ“ Selected" : "Schedule Call"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === "date" && currentMentor && (
          <div className={styles.stepContent}>
            <div className={styles.datePickerSection}>
              <h2>Select a Date</h2>
              <p>Choose your preferred date for the meeting</p>

              <div className={styles.dateGrid}>
                {availableDates.map((date) => (
                  <button
                    key={date.toISOString()}
                    onClick={() => handleDateSelect(date)}
                    className={`${styles.dateOption} ${
                      selectedDate === date.toISOString().split("T")[0] ? styles.selected : ""
                    }`}
                  >
                    <span className={styles.dayOfWeek}>
                      {date.toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span className={styles.dateNumber}>{date.getDate()}</span>
                    <span className={styles.month}>
                      {date.toLocaleDateString("en-US", { month: "short" })}
                    </span>
                  </button>
                ))}
              </div>

              <div className={styles.actionButtons}>
                <button onClick={() => setCurrentStep("mentor")} className={styles.backBtn}>
                  â† Back
                </button>
                <button
                  onClick={() => setCurrentStep("time")}
                  disabled={!selectedDate}
                  className={styles.nextBtn}
                >
                  Next â†’
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === "time" && selectedDate && (
          <div className={styles.stepContent}>
            <div className={styles.timePickerSection}>
              <h2>Select a Time</h2>
              <p>Available slots on {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>

              <div className={styles.timeGrid}>
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot.time}
                    onClick={() => {
                      if (slot.available) handleTimeSelect(slot.time);
                    }}
                    disabled={!slot.available}
                    className={`${styles.timeOption} ${
                      slot.available ? "" : styles.unavailable
                    } ${selectedTime === slot.time ? styles.selected : ""}`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>

              <div className={styles.actionButtons}>
                <button onClick={() => setCurrentStep("date")} className={styles.backBtn}>
                  â† Back
                </button>
                <button
                  onClick={() => setCurrentStep("details")}
                  disabled={!selectedTime}
                  className={styles.nextBtn}
                >
                  Next â†’
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === "details" && selectedTime && (
          <div className={styles.stepContent}>
            <div className={styles.detailsSection}>
              <h2>Your Details</h2>

              <div className={styles.meetingPreview}>
                <div className={styles.previewItem}>
                  <span className={styles.previewLabel}>Mentor</span>
                  <span className={styles.previewValue}>{currentMentor?.name}</span>
                </div>
                <div className={styles.previewItem}>
                  <span className={styles.previewLabel}>Date & Time</span>
                  <span className={styles.previewValue}>
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })} at {selectedTime}
                  </span>
                </div>
              </div>

              <form className={styles.form}>
                <div className="form-group">
                  <label htmlFor="name">Full Name *</label>
                  <input
                    id="name"
                    type="text"
                    value={bookingDetails.name}
                    onChange={(e) => handleDetailsChange("name", e.target.value)}
                    placeholder="Enter your full name"
                    className="form-control"
                  />
                </div>

                <div className={styles.formRow}>
                  <div className="form-group">
                    <label htmlFor="email">Email *</label>
                    <input
                      id="email"
                      type="email"
                      value={bookingDetails.email}
                      onChange={(e) => handleDetailsChange("email", e.target.value)}
                      placeholder="your@email.com"
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone Number *</label>
                    <input
                      id="phone"
                      type="tel"
                      value={bookingDetails.phone}
                      onChange={(e) => handleDetailsChange("phone", e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="topic">Discussion Topic *</label>
                  <input
                    id="topic"
                    type="text"
                    value={bookingDetails.topic}
                    onChange={(e) => handleDetailsChange("topic", e.target.value)}
                    placeholder="What would you like to discuss?"
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="message">Additional Message</label>
                  <textarea
                    id="message"
                    value={bookingDetails.message}
                    onChange={(e) => handleDetailsChange("message", e.target.value)}
                    placeholder="Any additional information..."
                    className="form-control"
                    rows={4}
                  />
                </div>
              </form>

              <div className={styles.actionButtons}>
                <button onClick={() => setCurrentStep("time")} className={styles.backBtn}>
                  â† Back
                </button>
                <button onClick={handleBooking} className={styles.confirmBtn}>
                  Schedule Call
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === "confirmation" && (
          <div className={styles.stepContent}>
            <div className={styles.confirmationSection}>
              <div className={styles.successIcon}>ðŸŽ‰</div>
              <h2>Booking Confirmed!</h2>
              <p className={styles.successMessage}>
                Your mentorship call has been scheduled successfully.
              </p>

              <div className={styles.confirmationDetails}>
                <div className={styles.detailsGroup}>
                  <h3>Meeting Details</h3>
                  <div className={styles.detail}>
                    <span className={styles.label}>Mentor:</span>
                    <span className={styles.value}>{currentMentor?.name}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Company:</span>
                    <span className={styles.value}>{currentMentor?.company}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Date & Time:</span>
                    <span className={styles.value}>
                      {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })} at {selectedTime}
                    </span>
                  </div>
                </div>

                <div className={styles.detailsGroup}>
                  <h3>Your Information</h3>
                  <div className={styles.detail}>
                    <span className={styles.label}>Name:</span>
                    <span className={styles.value}>{bookingDetails.name}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Email:</span>
                    <span className={styles.value}>{bookingDetails.email}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Topic:</span>
                    <span className={styles.value}>{bookingDetails.topic}</span>
                  </div>
                </div>
              </div>

              <div className={styles.nextSteps}>
                <h3>What happens next?</h3>
                <ul>
                  <li>A confirmation email will be sent to your inbox</li>
                  <li>Video call link will be shared before the meeting</li>
                  <li>You can reschedule anytime from your dashboard</li>
                  <li>Come prepared with your questions!</li>
                </ul>
              </div>

              <div className={styles.actionButtons}>
                <button onClick={handleBookAnother} className={styles.bookAnotherBtn}>
                  Schedule Another Call
                </button>
                <Link href="/Dashboard" className={styles.dashboardBtn}>
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

