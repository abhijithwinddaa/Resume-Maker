import React, { useState, lazy, Suspense } from "react";
import type {
  ResumeData,
  Project,
  Achievement,
  SkillCategory,
  Education,
  Certificate,
  Experience,
  SectionKey,
} from "../types/resume";
import { DEFAULT_SECTION_ORDER } from "../types/resume";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  Layers,
} from "lucide-react";
import "./ResumeEditor.css";
import CompletenessBar from "./CompletenessBar";

const DnDSectionOrder = lazy(() => import("./DnDSectionOrder"));

interface ResumeEditorProps {
  data: ResumeData;
  onChange: (data: ResumeData) => void;
}

type SectionName =
  | "contact"
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "achievements"
  | "certificates"
  | "sectionOrder";

const ResumeEditor: React.FC<ResumeEditorProps> = ({ data, onChange }) => {
  const [expandedSections, setExpandedSections] = useState<Set<SectionName>>(
    new Set([
      "contact",
      "summary",
      "education",
      "experience",
      "projects",
      "skills",
      "achievements",
      "certificates",
    ]),
  );

  const toggleSection = (section: SectionName) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const updateContact = (field: string, value: string) => {
    onChange({ ...data, contact: { ...data.contact, [field]: value } });
  };

  const updateSummary = (value: string) => {
    onChange({ ...data, summary: value });
  };

  // Education helpers
  const updateEducation = (
    index: number,
    field: keyof Education,
    value: string,
  ) => {
    const updated = [...data.education];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, education: updated });
  };

  const addEducation = () => {
    onChange({
      ...data,
      education: [
        ...data.education,
        { university: "", location: "", degree: "", yearRange: "", cgpa: "" },
      ],
    });
  };

  const removeEducation = (index: number) => {
    onChange({
      ...data,
      education: data.education.filter((_, i) => i !== index),
    });
  };

  // Project helpers
  const updateProject = (
    index: number,
    field: keyof Project,
    value: string | string[],
  ) => {
    const updated = [...data.projects];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, projects: updated });
  };

  const addProject = () => {
    onChange({
      ...data,
      projects: [
        ...data.projects,
        {
          title: "",
          githubLink: "#",
          liveLink: "#",
          techStack: "",
          bullets: [""],
        },
      ],
    });
  };

  const removeProject = (index: number) => {
    onChange({
      ...data,
      projects: data.projects.filter((_, i) => i !== index),
    });
  };

  const addBullet = (projectIndex: number) => {
    const updated = [...data.projects];
    updated[projectIndex] = {
      ...updated[projectIndex],
      bullets: [...updated[projectIndex].bullets, ""],
    };
    onChange({ ...data, projects: updated });
  };

  const removeBullet = (projectIndex: number, bulletIndex: number) => {
    const updated = [...data.projects];
    updated[projectIndex] = {
      ...updated[projectIndex],
      bullets: updated[projectIndex].bullets.filter(
        (_, i) => i !== bulletIndex,
      ),
    };
    onChange({ ...data, projects: updated });
  };

  const updateBullet = (
    projectIndex: number,
    bulletIndex: number,
    value: string,
  ) => {
    const updated = [...data.projects];
    const bullets = [...updated[projectIndex].bullets];
    bullets[bulletIndex] = value;
    updated[projectIndex] = { ...updated[projectIndex], bullets };
    onChange({ ...data, projects: updated });
  };

  // Skill helpers
  const updateSkill = (
    index: number,
    field: keyof SkillCategory,
    value: string,
  ) => {
    const updated = [...data.skills];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, skills: updated });
  };

  const addSkill = () => {
    onChange({ ...data, skills: [...data.skills, { label: "", skills: "" }] });
  };

  const removeSkill = (index: number) => {
    onChange({ ...data, skills: data.skills.filter((_, i) => i !== index) });
  };

  // Achievement helpers
  const updateAchievement = (
    index: number,
    field: keyof Achievement,
    value: string,
  ) => {
    const updated = [...data.achievements];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, achievements: updated });
  };

  const addAchievement = () => {
    onChange({
      ...data,
      achievements: [...data.achievements, { text: "", githubLink: "" }],
    });
  };

  const removeAchievement = (index: number) => {
    onChange({
      ...data,
      achievements: data.achievements.filter((_, i) => i !== index),
    });
  };

  // Certificate helpers
  const updateCertificate = (
    index: number,
    field: keyof Certificate,
    value: string,
  ) => {
    const updated = [...(data.certificates || [])];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, certificates: updated });
  };

  const addCertificate = () => {
    onChange({
      ...data,
      certificates: [
        ...(data.certificates || []),
        { name: "", description: "", link: "" },
      ],
    });
  };

  const removeCertificate = (index: number) => {
    onChange({
      ...data,
      certificates: (data.certificates || []).filter((_, i) => i !== index),
    });
  };

  const toggleCertificates = () => {
    onChange({ ...data, showCertificates: !data.showCertificates });
  };

  // Experience helpers
  const updateExperience = (
    index: number,
    field: keyof Experience,
    value: string | string[],
  ) => {
    const updated = [...(data.experience || [])];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...data, experience: updated });
  };

  const addExperience = () => {
    onChange({
      ...data,
      experience: [
        ...(data.experience || []),
        { company: "", role: "", location: "", dateRange: "", bullets: [""] },
      ],
    });
  };

  const removeExperience = (index: number) => {
    onChange({
      ...data,
      experience: (data.experience || []).filter((_, i) => i !== index),
    });
  };

  const addExpBullet = (expIndex: number) => {
    const updated = [...(data.experience || [])];
    updated[expIndex] = {
      ...updated[expIndex],
      bullets: [...updated[expIndex].bullets, ""],
    };
    onChange({ ...data, experience: updated });
  };

  const removeExpBullet = (expIndex: number, bulletIndex: number) => {
    const updated = [...(data.experience || [])];
    updated[expIndex] = {
      ...updated[expIndex],
      bullets: updated[expIndex].bullets.filter((_, i) => i !== bulletIndex),
    };
    onChange({ ...data, experience: updated });
  };

  const updateExpBullet = (
    expIndex: number,
    bulletIndex: number,
    value: string,
  ) => {
    const updated = [...(data.experience || [])];
    const bullets = [...updated[expIndex].bullets];
    bullets[bulletIndex] = value;
    updated[expIndex] = { ...updated[expIndex], bullets };
    onChange({ ...data, experience: updated });
  };

  const toggleExperience = () => {
    onChange({ ...data, showExperience: !data.showExperience });
  };

  // Section order helpers
  const sectionOrder: SectionKey[] =
    data.sectionOrder && data.sectionOrder.length > 0
      ? data.sectionOrder
      : DEFAULT_SECTION_ORDER;

  const handleSectionOrderChange = (newOrder: SectionKey[]) => {
    onChange({ ...data, sectionOrder: newOrder });
  };

  const handleSectionLabelChange = (key: SectionKey, label: string) => {
    onChange({
      ...data,
      sectionLabels: { ...data.sectionLabels, [key]: label },
    });
  };

  const handleSectionDelete = (key: SectionKey) => {
    const newOrder = sectionOrder.filter((k) => k !== key);
    onChange({ ...data, sectionOrder: newOrder });
  };

  const sectionLabels: Record<SectionKey, string> = {
    summary: "Summary",
    education: "Education",
    experience: "Experience",
    projects: "Projects",
    skills: "Skills",
    achievements: "Achievements",
    certificates: "Certificates",
  };

  const SectionHeader: React.FC<{ title: string; section: SectionName }> = ({
    title,
    section,
  }) => (
    <button
      type="button"
      className="editor-section-header"
      onClick={() => toggleSection(section)}
      aria-expanded={expandedSections.has(section)}
      aria-label={`${title} section`}
    >
      <h3>{title}</h3>
      {expandedSections.has(section) ? (
        <ChevronUp size={18} />
      ) : (
        <ChevronDown size={18} />
      )}
    </button>
  );

  return (
    <div className="resume-editor" role="form" aria-label="Resume editor form">
      <h2 className="editor-title">Resume Editor</h2>

      <CompletenessBar data={data} />

      {/* Section Order */}
      <div className="editor-section">
        <button
          type="button"
          className="editor-section-header"
          onClick={() => toggleSection("sectionOrder")}
          aria-expanded={expandedSections.has("sectionOrder")}
          aria-label="Section Order"
        >
          <h3>
            <Layers
              size={16}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            Section Order
          </h3>
          {expandedSections.has("sectionOrder") ? (
            <ChevronUp size={18} />
          ) : (
            <ChevronDown size={18} />
          )}
        </button>
        {expandedSections.has("sectionOrder") && (
          <div className="editor-fields">
            <Suspense fallback={<div style={{ padding: 8 }}>Loading...</div>}>
              <DnDSectionOrder
                sectionOrder={sectionOrder}
                onChange={handleSectionOrderChange}
                sectionLabels={data.sectionLabels}
                onLabelChange={handleSectionLabelChange}
                onDelete={handleSectionDelete}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Contact Information */}
      <div className="editor-section">
        <SectionHeader title="Contact Information" section="contact" />
        {expandedSections.has("contact") && (
          <div className="editor-fields">
            <div className="field-group">
              <label>Full Name</label>
              <input
                type="text"
                value={data.contact.name}
                onChange={(e) => updateContact("name", e.target.value)}
              />
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Phone</label>
                <input
                  type="text"
                  value={data.contact.phone}
                  onChange={(e) => updateContact("phone", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Email</label>
                <input
                  type="email"
                  value={data.contact.email}
                  onChange={(e) => updateContact("email", e.target.value)}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>LinkedIn</label>
                <input
                  type="text"
                  value={data.contact.linkedin}
                  onChange={(e) => updateContact("linkedin", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>GitHub</label>
                <input
                  type="text"
                  value={data.contact.github}
                  onChange={(e) => updateContact("github", e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Portfolio</label>
                <input
                  type="text"
                  value={data.contact.portfolio}
                  onChange={(e) => updateContact("portfolio", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="editor-section">
        <SectionHeader title="Summary" section="summary" />
        {expandedSections.has("summary") && (
          <div className="editor-fields">
            <textarea
              rows={4}
              value={data.summary}
              onChange={(e) => updateSummary(e.target.value)}
              placeholder="Professional summary..."
            />
          </div>
        )}
      </div>

      {/* Education */}
      <div className="editor-section">
        <SectionHeader title="Education" section="education" />
        {expandedSections.has("education") && (
          <div className="editor-fields">
            {data.education.map((edu, i) => (
              <div key={i} className="editor-card">
                <div className="card-header">
                  <span className="card-number">#{i + 1}</span>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => removeEducation(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>University</label>
                    <input
                      type="text"
                      value={edu.university}
                      onChange={(e) =>
                        updateEducation(i, "university", e.target.value)
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label>Year Range</label>
                    <input
                      type="text"
                      value={edu.yearRange}
                      onChange={(e) =>
                        updateEducation(i, "yearRange", e.target.value)
                      }
                      placeholder="2023 - 2025"
                    />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Degree</label>
                    <input
                      type="text"
                      value={edu.degree}
                      onChange={(e) =>
                        updateEducation(i, "degree", e.target.value)
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label>CGPA</label>
                    <input
                      type="text"
                      value={edu.cgpa}
                      onChange={(e) =>
                        updateEducation(i, "cgpa", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            <button className="btn-add" onClick={addEducation}>
              <Plus size={14} /> Add Education
            </button>
          </div>
        )}
      </div>

      {/* Experience */}
      <div className="editor-section">
        <div
          className="editor-section-header"
          onClick={() => toggleSection("experience")}
        >
          <h3>Experience</h3>
          <div className="section-header-right">
            <button
              className={`toggle-cert-btn ${data.showExperience ? "on" : "off"}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleExperience();
              }}
              title={
                data.showExperience
                  ? "Hide experience on resume"
                  : "Show experience on resume"
              }
            >
              {data.showExperience ? (
                <ToggleRight size={20} />
              ) : (
                <ToggleLeft size={20} />
              )}
              <span className="toggle-label-text">
                {data.showExperience ? "Visible" : "Hidden"}
              </span>
            </button>
            {expandedSections.has("experience") ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </div>
        </div>
        {expandedSections.has("experience") && (
          <div className="editor-fields">
            {!data.showExperience && (
              <div className="toggle-hint">
                Experience section is hidden on the resume. Toggle it on to
                show.
              </div>
            )}
            {(data.experience || []).map((exp, i) => (
              <div key={i} className="editor-card">
                <div className="card-header">
                  <span className="card-number">Experience #{i + 1}</span>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => removeExperience(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Role / Title</label>
                    <input
                      type="text"
                      value={exp.role}
                      onChange={(e) =>
                        updateExperience(i, "role", e.target.value)
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label>Company</label>
                    <input
                      type="text"
                      value={exp.company}
                      onChange={(e) =>
                        updateExperience(i, "company", e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>Location</label>
                    <input
                      type="text"
                      value={exp.location}
                      onChange={(e) =>
                        updateExperience(i, "location", e.target.value)
                      }
                      placeholder="City, State"
                    />
                  </div>
                  <div className="field-group">
                    <label>Date Range</label>
                    <input
                      type="text"
                      value={exp.dateRange}
                      onChange={(e) =>
                        updateExperience(i, "dateRange", e.target.value)
                      }
                      placeholder="Jan 2023 - Present"
                    />
                  </div>
                </div>
                <div className="bullets-section">
                  <label>Bullet Points</label>
                  {exp.bullets.map((bullet, j) => (
                    <div key={j} className="bullet-row">
                      <textarea
                        rows={2}
                        value={bullet}
                        onChange={(e) => updateExpBullet(i, j, e.target.value)}
                        placeholder={`Bullet point ${j + 1}...`}
                      />
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => removeExpBullet(i, j)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn-add btn-small"
                    onClick={() => addExpBullet(i)}
                  >
                    <Plus size={12} /> Add Bullet
                  </button>
                </div>
              </div>
            ))}
            <button className="btn-add" onClick={addExperience}>
              <Plus size={14} /> Add Experience
            </button>
          </div>
        )}
      </div>

      {/* Projects */}
      <div className="editor-section">
        <SectionHeader title="Projects" section="projects" />
        {expandedSections.has("projects") && (
          <div className="editor-fields">
            {data.projects.map((project, i) => (
              <div key={i} className="editor-card">
                <div className="card-header">
                  <span className="card-number">Project #{i + 1}</span>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => removeProject(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="field-group">
                  <label>Project Title</label>
                  <input
                    type="text"
                    value={project.title}
                    onChange={(e) => updateProject(i, "title", e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label>GitHub Link</label>
                    <input
                      type="text"
                      value={project.githubLink}
                      onChange={(e) =>
                        updateProject(i, "githubLink", e.target.value)
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label>Live Demo Link</label>
                    <input
                      type="text"
                      value={project.liveLink}
                      onChange={(e) =>
                        updateProject(i, "liveLink", e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="field-group">
                  <label>Tech Stack</label>
                  <input
                    type="text"
                    value={project.techStack}
                    onChange={(e) =>
                      updateProject(i, "techStack", e.target.value)
                    }
                  />
                </div>
                <div className="bullets-section">
                  <label>Bullet Points</label>
                  {project.bullets.map((bullet, j) => (
                    <div key={j} className="bullet-row">
                      <textarea
                        rows={2}
                        value={bullet}
                        onChange={(e) => updateBullet(i, j, e.target.value)}
                        placeholder={`Bullet point ${j + 1}...`}
                      />
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => removeBullet(i, j)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn-add btn-small"
                    onClick={() => addBullet(i)}
                  >
                    <Plus size={12} /> Add Bullet
                  </button>
                </div>
              </div>
            ))}
            <button className="btn-add" onClick={addProject}>
              <Plus size={14} /> Add Project
            </button>
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="editor-section">
        <SectionHeader title="Skills" section="skills" />
        {expandedSections.has("skills") && (
          <div className="editor-fields">
            {data.skills.map((skill, i) => (
              <div key={i} className="skill-row">
                <div className="field-group skill-label-group">
                  <input
                    type="text"
                    value={skill.label}
                    onChange={(e) => updateSkill(i, "label", e.target.value)}
                    placeholder="Category"
                  />
                </div>
                <div className="field-group skill-value-group">
                  <input
                    type="text"
                    value={skill.skills}
                    onChange={(e) => updateSkill(i, "skills", e.target.value)}
                    placeholder="Skill1, Skill2, Skill3"
                  />
                </div>
                <button
                  className="btn-icon btn-danger"
                  onClick={() => removeSkill(i)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="btn-add" onClick={addSkill}>
              <Plus size={14} /> Add Skill Category
            </button>
          </div>
        )}
      </div>

      {/* Achievements */}
      <div className="editor-section">
        <SectionHeader title="Achievements" section="achievements" />
        {expandedSections.has("achievements") && (
          <div className="editor-fields">
            {data.achievements.map((ach, i) => (
              <div key={i} className="editor-card">
                <div className="card-header">
                  <span className="card-number">#{i + 1}</span>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => removeAchievement(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="field-group">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={ach.text}
                    onChange={(e) =>
                      updateAchievement(i, "text", e.target.value)
                    }
                    placeholder="Achievement description..."
                  />
                </div>
                <div className="field-group">
                  <label>GitHub Link (optional)</label>
                  <input
                    type="text"
                    value={ach.githubLink || ""}
                    onChange={(e) =>
                      updateAchievement(i, "githubLink", e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
            <button className="btn-add" onClick={addAchievement}>
              <Plus size={14} /> Add Achievement
            </button>
          </div>
        )}
      </div>

      {/* Certificates */}
      <div className="editor-section">
        <div
          className="editor-section-header"
          onClick={() => toggleSection("certificates")}
        >
          <h3>Certificates</h3>
          <div className="section-header-right">
            <button
              className={`toggle-cert-btn ${data.showCertificates ? "on" : "off"}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleCertificates();
              }}
              title={
                data.showCertificates
                  ? "Hide certificates on resume"
                  : "Show certificates on resume"
              }
            >
              {data.showCertificates ? (
                <ToggleRight size={20} />
              ) : (
                <ToggleLeft size={20} />
              )}
              <span className="toggle-label-text">
                {data.showCertificates ? "Visible" : "Hidden"}
              </span>
            </button>
            {expandedSections.has("certificates") ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </div>
        </div>
        {expandedSections.has("certificates") && (
          <div className="editor-fields">
            {!data.showCertificates && (
              <div className="toggle-hint">
                Certificates section is hidden on the resume. Toggle it on to
                show.
              </div>
            )}
            {(data.certificates || []).map((cert, i) => (
              <div key={i} className="cert-editor-row">
                <div className="cert-fields">
                  <input
                    type="text"
                    value={cert.name}
                    onChange={(e) =>
                      updateCertificate(i, "name", e.target.value)
                    }
                    placeholder="Certificate Name"
                    className="cert-name-input"
                  />
                  <input
                    type="text"
                    value={cert.description}
                    onChange={(e) =>
                      updateCertificate(i, "description", e.target.value)
                    }
                    placeholder="Issuer / Description"
                    className="cert-desc-input"
                  />
                  <input
                    type="text"
                    value={cert.link}
                    onChange={(e) =>
                      updateCertificate(i, "link", e.target.value)
                    }
                    placeholder="https://certificate-link.com"
                    className="cert-link-input"
                  />
                </div>
                <button
                  className="btn-icon btn-danger"
                  onClick={() => removeCertificate(i)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="btn-add" onClick={addCertificate}>
              <Plus size={14} /> Add Certificate
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeEditor;
