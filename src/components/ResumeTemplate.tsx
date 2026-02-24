import React from "react";
import type { ResumeData, SectionKey } from "../types/resume";
import "./ResumeTemplate.css";

interface ResumeTemplateProps {
  data: ResumeData;
  highlightKeywords?: string[];
}

const ResumeTemplate = React.forwardRef<HTMLDivElement, ResumeTemplateProps>(
  ({ data, highlightKeywords = [] }, ref) => {
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

    const renderSection = (key: SectionKey) => {
      switch (key) {
        case "summary":
          return (
            <section key="summary" className="resume-section">
              <h2 className="section-title">SUMMARY</h2>
              <div className="section-divider"></div>
              <p className="summary-text">{highlightText(data.summary)}</p>
            </section>
          );

        case "education":
          return (
            <section key="education" className="resume-section">
              <h2 className="section-title">EDUCATION</h2>
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
              <h2 className="section-title">EXPERIENCE</h2>
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
              <h2 className="section-title">PROJECTS</h2>
              <div className="section-divider"></div>
              {data.projects.map((project, i) => (
                <div key={i} className="project-item">
                  <div className="project-header">
                    <span className="project-title">{project.title}</span>
                    <span className="project-links">
                      {project.githubLink && (
                        <>
                          {" | "}
                          <a href={project.githubLink}>Github</a>
                        </>
                      )}
                      {project.liveLink && (
                        <>
                          {" | "}
                          <a href={project.liveLink}>Live Demo</a>
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
              <h2 className="section-title">SKILLS</h2>
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
              <h2 className="section-title">ACHIEVEMENTS</h2>
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
              <h2 className="section-title">CERTIFICATES</h2>
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

    return (
      <div className="resume-page" ref={ref}>
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
