import React, { useMemo } from "react";
import { Github, House, Linkedin, Mail, Phone } from "lucide-react";
import type { ResumeData, SectionKey } from "../types/resume";
import { DEFAULT_SECTION_LABELS } from "../types/resume";
import type { TemplateCustomization } from "../types/templates";
import { useAppStore } from "../store/appStore";
import "./ResumeTemplate.css";

interface ResumeTemplateProps {
  data: ResumeData;
  highlightKeywords?: string[];
  customizationOverride?: Partial<TemplateCustomization>;
  forExport?: boolean;
}

const FONT_SIZE_MAP = {
  small: "8.5pt",
  medium: "9pt",
  large: "9.5pt",
} as const;
const FONT_SCALE_MAP = {
  small: 0.94,
  medium: 1,
  large: 1.08,
} as const;
const LINE_HEIGHT_MAP = { compact: 1.2, normal: 1.3, relaxed: 1.5 } as const;
const SPACING_MAP = { tight: "2px", normal: "4px", spacious: "8px" } as const;

const ResumeTemplate = React.forwardRef<HTMLDivElement, ResumeTemplateProps>(
  ({ data, highlightKeywords = [], customizationOverride, forExport }, ref) => {
    const templateId = useAppStore((s) => s.templateId);
    const customization = useAppStore((s) => s.customization);

    const resolvedCustomization = useMemo(
      () => ({ ...customization, ...(customizationOverride || {}) }),
      [customization, customizationOverride],
    );

    const rootStyle = useMemo(
      () =>
        ({
          "--resume-primary": resolvedCustomization.primaryColor,
          "--resume-secondary": resolvedCustomization.secondaryColor,
          "--resume-font": `"${resolvedCustomization.fontFamily}", "Segoe UI", Arial, sans-serif`,
          "--resume-font-size": FONT_SIZE_MAP[resolvedCustomization.fontSize],
          "--resume-font-scale": FONT_SCALE_MAP[resolvedCustomization.fontSize],
          "--resume-line-height":
            LINE_HEIGHT_MAP[resolvedCustomization.lineHeight],
          "--resume-section-spacing":
            SPACING_MAP[resolvedCustomization.sectionSpacing],
        }) as React.CSSProperties,
      [resolvedCustomization],
    );
    const highlightText = (text: string): React.ReactNode => {
      if (highlightKeywords.length === 0) return text;

      // Sort keywords by length (longest first) to match longer phrases first
      const sorted = [...highlightKeywords].sort((a, b) => b.length - a.length);
      const escapedKeywords = sorted.map((k) =>
        k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      const pattern = new RegExp(`(${escapedKeywords.join("|")})`, "gi");

      const parts = text.split(pattern);
      return parts.map((part, i) => {
        const isHighlighted = escapedKeywords.some((k) =>
          new RegExp(`^${k}$`, "i").test(part),
        );
        return isHighlighted ? (
          <mark key={i} className="keyword-highlight">
            {part}
          </mark>
        ) : (
          part
        );
      });
    };

    const sectionOrder: SectionKey[] =
      data.sectionOrder && data.sectionOrder.length > 0
        ? data.sectionOrder
        : [
            "summary",
            "education",
            "experience",
            "projects",
            "skills",
            "achievements",
            "certificates",
          ];

    const getSectionTitle = (key: SectionKey): string => {
      const label = data.sectionLabels?.[key] || DEFAULT_SECTION_LABELS[key];
      return label.toUpperCase();
    };

    const renderSection = (key: SectionKey) => {
      switch (key) {
        case "summary":
          return (
            <section key="summary" className="resume-section">
              <h2 className="section-title">{getSectionTitle("summary")}</h2>
              <div className="section-divider"></div>
              <p className="summary-text">{highlightText(data.summary)}</p>
            </section>
          );

        case "education":
          return (
            <section key="education" className="resume-section">
              <h2 className="section-title">{getSectionTitle("education")}</h2>
              <div className="section-divider"></div>
              {data.education.map((edu, i) => (
                <div key={i} className="education-item">
                  <div className="education-row">
                    <div>
                      <strong>{edu.university}</strong>
                    </div>
                    <div className="education-year">{edu.yearRange}</div>
                  </div>
                  <div className="education-row">
                    <div className="education-degree">{edu.degree}</div>
                    <div className="education-cgpa">{edu.cgpa}</div>
                  </div>
                </div>
              ))}
            </section>
          );

        case "experience":
          if (
            !data.showExperience ||
            !data.experience ||
            data.experience.length === 0
          )
            return null;
          return (
            <section key="experience" className="resume-section">
              <h2 className="section-title">{getSectionTitle("experience")}</h2>
              <div className="section-divider"></div>
              {data.experience.map((exp, i) => (
                <div key={i} className="experience-item">
                  <div className="experience-header">
                    <div>
                      <strong>{exp.role}</strong>
                      {" — "}
                      <span className="experience-company">{exp.company}</span>
                    </div>
                    <div className="experience-date">{exp.dateRange}</div>
                  </div>
                  {exp.location && (
                    <div className="experience-location">{exp.location}</div>
                  )}
                  <ul className="experience-bullets">
                    {exp.bullets.map((bullet, j) => (
                      <li key={j}>{highlightText(bullet)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );

        case "projects":
          return (
            <section key="projects" className="resume-section">
              <h2 className="section-title">{getSectionTitle("projects")}</h2>
              <div className="section-divider"></div>
              {data.projects.map((project, i) => (
                <div key={i} className="project-item">
                  <div className="project-header">
                    <span className="project-title">{project.title}</span>
                    <span className="project-links">
                      {project.githubLink && (
                        <>
                          {" | "}
                          <a
                            href={project.githubLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Github
                          </a>
                        </>
                      )}
                      {project.liveLink && (
                        <>
                          {" | "}
                          <a
                            href={project.liveLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Live Demo
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="project-tech">
                    <strong>Tech Stack:</strong>{" "}
                    {highlightText(project.techStack)}
                  </div>
                  <ul className="project-bullets">
                    {project.bullets.map((bullet, j) => (
                      <li key={j}>{highlightText(bullet)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );

        case "skills":
          return (
            <section key="skills" className="resume-section">
              <h2 className="section-title">{getSectionTitle("skills")}</h2>
              <div className="section-divider"></div>
              <ul className="skills-list">
                {data.skills.map((skill, i) => (
                  <li key={i}>
                    <strong>{skill.label}:</strong>{" "}
                    {highlightText(skill.skills)}
                  </li>
                ))}
              </ul>
            </section>
          );

        case "achievements":
          if (!data.achievements || data.achievements.length === 0) return null;
          return (
            <section key="achievements" className="resume-section">
              <h2 className="section-title">
                {getSectionTitle("achievements")}
              </h2>
              <div className="section-divider"></div>
              <ul className="achievements-list">
                {data.achievements.map((ach, i) => (
                  <li key={i}>
                    {highlightText(ach.text)}
                    {ach.githubLink && (
                      <>
                        {" "}
                        <a
                          href={ach.githubLink}
                          target="_blank"
                          rel="noreferrer"
                          className="github-badge"
                        >
                          GITHUB LINK
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );

        case "certificates":
          if (
            !data.showCertificates ||
            !data.certificates ||
            data.certificates.length === 0
          )
            return null;
          return (
            <section key="certificates" className="resume-section">
              <h2 className="section-title">
                {getSectionTitle("certificates")}
              </h2>
              <div className="section-divider"></div>
              <ul className="certificates-list">
                {data.certificates.map((cert, i) => (
                  <li key={i} className="certificate-item">
                    <strong>{cert.name}</strong>
                    {" — "}
                    <span>{cert.description}</span>
                    {cert.link && (
                      <>
                        {" "}
                        <a
                          href={cert.link}
                          target="_blank"
                          rel="noreferrer"
                          className="cert-link"
                        >
                          View Certificate
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );

        default:
          return null;
      }
    };

    const renderPortfolioTemplate = () => {
      const headline =
        data.experience.find((exp) => exp.role.trim())?.role ||
        data.skills.find((skill) => skill.label.trim())?.label ||
        "";

      const projects = data.projects.filter(
        (project) =>
          project.title.trim() ||
          project.techStack.trim() ||
          project.bullets.some((bullet) => bullet.trim()),
      );

      const experienceEntries = (data.experience || []).filter(
        (exp) =>
          exp.company.trim() ||
          exp.role.trim() ||
          exp.dateRange.trim() ||
          exp.bullets.some((bullet) => bullet.trim()),
      );

      const educationEntries = data.education.filter(
        (edu) =>
          edu.university.trim() ||
          edu.degree.trim() ||
          edu.yearRange.trim() ||
          edu.cgpa.trim(),
      );

      const skillEntries = data.skills.filter(
        (skill) => skill.label.trim() || skill.skills.trim(),
      );

      const achievements = (data.achievements || []).filter((achievement) =>
        achievement.text.trim(),
      );

      const certificates = (data.certificates || []).filter(
        (cert) =>
          cert.name.trim() || cert.description.trim() || cert.link.trim(),
      );

      return (
        <div
          className={`resume-page template-${templateId}${forExport ? " resume-page--export" : ""}`}
          ref={ref}
          style={rootStyle}
        >
          <div className="resume-header portfolio-header">
            <h1 className="resume-name">{data.contact.name}</h1>
            {headline && <p className="portfolio-subtitle">{headline}</p>}

            <div className="resume-contact portfolio-contact">
              {data.contact.portfolio && (
                <a
                  href={data.contact.portfolio}
                  target="_blank"
                  rel="noreferrer"
                  className="portfolio-contact-item"
                >
                  <House size={13} strokeWidth={1.8} />
                  <span>Portfolio</span>
                </a>
              )}

              {data.contact.github && (
                <a
                  href={data.contact.github}
                  target="_blank"
                  rel="noreferrer"
                  className="portfolio-contact-item"
                >
                  <Github size={13} strokeWidth={1.8} />
                  <span>GitHub</span>
                </a>
              )}

              {data.contact.linkedin && (
                <a
                  href={data.contact.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="portfolio-contact-item"
                >
                  <Linkedin size={13} strokeWidth={1.8} />
                  <span>LinkedIn</span>
                </a>
              )}

              {data.contact.email && (
                <a
                  href={`mailto:${data.contact.email}`}
                  className="portfolio-contact-item"
                >
                  <Mail size={13} strokeWidth={1.8} />
                  <span>{data.contact.email}</span>
                </a>
              )}

              {data.contact.phone && (
                <a
                  href={`tel:${data.contact.phone}`}
                  className="portfolio-contact-item"
                >
                  <Phone size={13} strokeWidth={1.8} />
                  <span>{data.contact.phone}</span>
                </a>
              )}
            </div>
          </div>

          <div className="portfolio-layout">
            <main className="portfolio-main">
              {data.summary.trim() && (
                <section className="resume-section">
                  <h2 className="section-title">
                    {getSectionTitle("summary")}
                  </h2>
                  <p className="summary-text">{highlightText(data.summary)}</p>
                </section>
              )}

              {projects.length > 0 && (
                <section className="resume-section">
                  <h2 className="section-title">
                    {getSectionTitle("projects")}
                  </h2>
                  {projects.map((project, i) => {
                    const hasProjectLinks = Boolean(
                      project.githubLink || project.liveLink,
                    );

                    return (
                      <div
                        key={i}
                        className="project-item portfolio-project-item"
                      >
                        <div className="project-header portfolio-project-header">
                          <span className="project-title">{project.title}</span>
                          {hasProjectLinks && (
                            <span className="project-links portfolio-project-links">
                              {project.githubLink && (
                                <>
                                  {" | "}
                                  <a
                                    href={project.githubLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Github
                                  </a>
                                </>
                              )}
                              {project.liveLink && (
                                <>
                                  {" | "}
                                  <a
                                    href={project.liveLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Live Demo
                                  </a>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        {project.techStack.trim() && (
                          <div className="project-tech portfolio-project-tech">
                            <strong>Tech Stack:</strong>{" "}
                            {highlightText(project.techStack)}
                          </div>
                        )}
                        <ul className="project-bullets portfolio-project-bullets">
                          {project.bullets
                            .filter((bullet) => bullet.trim())
                            .map((bullet, j) => (
                              <li key={j}>{highlightText(bullet)}</li>
                            ))}
                        </ul>
                      </div>
                    );
                  })}
                </section>
              )}

              {data.showExperience && experienceEntries.length > 0 && (
                <section className="resume-section">
                  <h2 className="section-title">
                    {getSectionTitle("experience")}
                  </h2>
                  {experienceEntries.map((exp, i) => (
                    <div
                      key={i}
                      className="experience-item portfolio-experience-item"
                    >
                      <div className="experience-header portfolio-experience-header">
                        <strong>{exp.company}</strong>
                        {exp.role && (
                          <span className="portfolio-experience-role">
                            | {exp.role}
                          </span>
                        )}
                      </div>
                      {exp.dateRange && (
                        <div className="experience-date portfolio-experience-date">
                          {exp.dateRange}
                        </div>
                      )}
                      <ul className="experience-bullets portfolio-experience-bullets">
                        {exp.bullets
                          .filter((bullet) => bullet.trim())
                          .map((bullet, j) => (
                            <li key={j}>{highlightText(bullet)}</li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}

              {achievements.length > 0 && (
                <section className="resume-section">
                  <h2 className="section-title">
                    {getSectionTitle("achievements")}
                  </h2>
                  <ul className="achievements-list portfolio-achievements-list">
                    {achievements.map((achievement, i) => (
                      <li key={i}>
                        {highlightText(achievement.text)}
                        {achievement.githubLink && (
                          <>
                            {" "}
                            <a
                              href={achievement.githubLink}
                              target="_blank"
                              rel="noreferrer"
                              className="github-badge portfolio-achievement-link"
                            >
                              GITHUB LINK
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.showCertificates && certificates.length > 0 && (
                <section className="resume-section">
                  <h2 className="section-title">
                    {getSectionTitle("certificates")}
                  </h2>
                  <ul className="certificates-list portfolio-certificates-list">
                    {certificates.map((cert, i) => {
                      const title = cert.name.trim() || cert.description.trim();
                      return (
                        <li
                          key={i}
                          className="certificate-item portfolio-certificate-item"
                        >
                          <span className="portfolio-cert-name">{title}</span>
                          {cert.link && (
                            <a
                              href={cert.link}
                              target="_blank"
                              rel="noreferrer"
                              className="cert-link portfolio-cert-link"
                            >
                              View Certificate
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </main>

            <aside className="portfolio-sidebar">
              {skillEntries.length > 0 && (
                <section className="resume-section">
                  <h2 className="section-title">{getSectionTitle("skills")}</h2>
                  <div className="portfolio-skills-list">
                    {skillEntries.map((skill, i) => (
                      <div key={i} className="portfolio-skills-group">
                        <p className="portfolio-skills-label">{skill.label}</p>
                        <p className="portfolio-skills-text">
                          {highlightText(skill.skills)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {educationEntries.length > 0 && (
                <section className="resume-section">
                  <h2 className="section-title">
                    {getSectionTitle("education")}
                  </h2>
                  {educationEntries.map((edu, i) => (
                    <div
                      key={i}
                      className="education-item portfolio-education-item"
                    >
                      <p className="portfolio-education-school">
                        {edu.university}
                      </p>
                      <p className="portfolio-education-degree">{edu.degree}</p>
                      <p className="portfolio-education-meta">
                        {edu.yearRange}
                      </p>
                      {edu.cgpa && (
                        <p className="portfolio-education-meta">{edu.cgpa}</p>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </aside>
          </div>
        </div>
      );
    };

    if (templateId === "portfolio") {
      return renderPortfolioTemplate();
    }

    return (
      <div
        className={`resume-page template-${templateId}${forExport ? " resume-page--export" : ""}`}
        ref={ref}
        style={rootStyle}
      >
        {/* Header */}
        <div className="resume-header">
          <h1 className="resume-name">{data.contact.name}</h1>
          <div className="resume-contact">
            <span>{data.contact.phone}</span>
            <span className="separator">|</span>
            <a href={`mailto:${data.contact.email}`}>{data.contact.email}</a>
            {data.contact.linkedin && (
              <>
                <span className="separator">|</span>
                <a
                  href={data.contact.linkedin}
                  target="_blank"
                  rel="noreferrer"
                >
                  Linkedin
                </a>
              </>
            )}
            {data.contact.github && (
              <>
                <span className="separator">|</span>
                <a href={data.contact.github} target="_blank" rel="noreferrer">
                  Github
                </a>
              </>
            )}
            {data.contact.portfolio && (
              <>
                <span className="separator">|</span>
                <a
                  href={data.contact.portfolio}
                  target="_blank"
                  rel="noreferrer"
                >
                  Portfolio
                </a>
              </>
            )}
          </div>
        </div>

        {/* Sections in user-defined order */}
        {sectionOrder.map((key) => renderSection(key))}
      </div>
    );
  },
);

ResumeTemplate.displayName = "ResumeTemplate";

export default ResumeTemplate;
