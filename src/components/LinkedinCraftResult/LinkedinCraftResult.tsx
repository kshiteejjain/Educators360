import styles from "./LinkedinCraftResult.module.css";

type CraftResult = {
  targetRoleSummary: string;
  profileBlueprint: {
    headline: string;
    about: string;
    experienceBullets: string[];
    skills: string[];
    activityIdeas: string[];
  };
  strategicKeywordCloud: string[];
  actionPlan: string[];
};

type Props = {
  result: CraftResult;
  targetRole: string;
};

const listOrEmpty = (items?: string[]) =>
  items && items.length > 0 ? items : [];

export default function LinkedinCraftResult({ result, targetRole }: Props) {
  return (
    <section id="linkedin-craft-result" className={styles.wrapper}>
      <div className={styles.hero}>
        <div>
          <p className={styles.kicker}>LinkedIn Profile Craft</p>
          <h2 className={styles.title}>Professional Profile Blueprint</h2>
          <p className={styles.subtitle}>
            Crafted for <strong>{targetRole || "your target role"}</strong> based on your resume.
          </p>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.card}>
          <h3>Target Role Summary</h3>
          <p>{result.targetRoleSummary || "Role summary not available."}</p>
        </div>
        <div className={styles.card}>
          <h3>Action Plan</h3>
          <ol>
            {listOrEmpty(result.actionPlan).map((item, idx) => (
              <li key={`plan-${idx}`}>{item}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className={styles.craftGrid}>
        <div className={styles.card}>
          <h3>Crafted Headline</h3>
          <p className={styles.highlight}>
            {result.profileBlueprint.headline || "Add a headline."}
          </p>
        </div>
        <div className={styles.card}>
          <h3>About Section Draft</h3>
          <p>{result.profileBlueprint.about || "Add an About section."}</p>
        </div>
        <div className={styles.card}>
          <h3>Experience Bullet Blueprint</h3>
          <ul>
            {listOrEmpty(result.profileBlueprint.experienceBullets).map((item, idx) => (
              <li key={`exp-${idx}`} className={styles.listItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.card}>
          <h3>Skill Stack</h3>
          <div className={styles.tagRow}>
            {listOrEmpty(result.profileBlueprint.skills).map((item, idx) => (
              <span key={`skill-${idx}`} className={styles.tag}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <h3>Featured / Activity Ideas</h3>
          <ul>
            {listOrEmpty(result.profileBlueprint.activityIdeas).map((item, idx) => (
              <li key={`act-${idx}`} className={styles.listItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.card}>
        <h3>Strategic Keyword Cloud</h3>
        <div className={styles.tagRow}>
          {listOrEmpty(result.strategicKeywordCloud).map((item, idx) => (
            <span key={`kw-${idx}`} className={styles.tagAlt}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
