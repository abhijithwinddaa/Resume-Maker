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
  ToggleLeft,
  ToggleRight,
  Layers,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { postServerAIRequest } from "../utils/aiService";
import FormatToolbar from "./FormatToolbar";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./ResumeEditor.css";
import CompletenessBar from "./CompletenessBar";
import BulletCoach from "./BulletCoach";
import AINotice from "./AINotice";
import { detectRoleFamily } from "../utils/quantify";

const DnDSectionOrder = lazy(() => import("./DnDSectionOrder"));

interface ResumeEditorProps {
  data: ResumeData;
  onChange: (data: ResumeData) => void;
}

/** Collision-safe ids for list entries (crypto where available). */
function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

type BulletKind = "exp" | "proj";

/**
 * Applies an async bullet result to the LATEST resume (not the render that
 * started the request). The bullet is found by entry id (else index) and only
 * replaced if it still holds the text the request was made from; if bullets
 * above it were removed meanwhile it is found by that text instead. Returns
 * null when the bullet changed, so nothing is overwritten.
 */
function applyBulletResult(
  latest: ResumeData,
  kind: BulletKind,
  entryId: string | undefined,
  entryIndex: number,
  bulletIndex: number,
  baseText: string,
  newText: string,
): ResumeData | null {
  const listKey = kind === "exp" ? "experience" : "projects";
  const entries = (latest[listKey] || []) as Array<Experience | Project>;
  let at = entryId ? entries.findIndex((e) => e.id === entryId) : -1;
  if (at === -1 && !entryId) at = entryIndex;
  const entry = entries[at];
  if (!entry) return null;

  let target = -1;
  if (entry.bullets[bulletIndex] === baseText) {
    target = bulletIndex;
  } else {
    const matches = entry.bullets.flatMap((b, i) => (b === baseText ? [i] : []));
    if (matches.length === 1) target = matches[0];
  }
  if (target === -1) return null;

  const bullets = [...entry.bullets];
  bullets[target] = newText;
  const nextEntries = [...entries];
  nextEntries[at] = { ...entry, bullets };
  return { ...latest, [listKey]: nextEntries } as ResumeData;
}

const BULLET_CHANGED_NOTICE =
  "This bullet changed while the AI was working, so the suggestion wasn't applied. Try again on the current text.";



interface SortableExperienceItemProps {
  exp: Experience;
  index: number;
  updateExperience: (index: number, field: keyof Experience, value: string | string[]) => void;
  removeExperience: (index: number) => void;
  updateExpBullet: (expIndex: number, bulletIndex: number, value: string) => void;
  removeExpBullet: (expIndex: number, bulletIndex: number) => void;
  addExpBullet: (expIndex: number) => void;
  onEnhanceBullet: (bulletIndex: number, currentText: string) => Promise<void>;
  onApplyBullet: (bulletIndex: number, baseText: string, newText: string) => void;
  optimizingBullets: Record<string, boolean>;
  bulletNotices: Record<string, string>;
}

const SortableExperienceItem: React.FC<SortableExperienceItemProps> = ({
  exp,
  index,
  updateExperience,
  removeExperience,
  updateExpBullet,
  removeExpBullet,
  addExpBullet,
  onEnhanceBullet,
  onApplyBullet,
  optimizingBullets,
  bulletNotices,
}) => {
  const id = exp.id || `exp-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="editor-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="dnd-grip"
            {...attributes}
            {...listeners}
            aria-label="Drag experience"
          >
            <GripVertical size={16} />
          </button>
          <span className="card-number">Experience #{index + 1}</span>
        </div>
        <button
          className="btn-icon btn-danger"
          onClick={() => removeExperience(index)}
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
            onChange={(e) => updateExperience(index, "role", e.target.value)}
          />
        </div>
        <div className="field-group">
          <label>Company</label>
          <input
            type="text"
            value={exp.company}
            onChange={(e) => updateExperience(index, "company", e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label>Location</label>
          <input
            type="text"
            value={exp.location}
            onChange={(e) => updateExperience(index, "location", e.target.value)}
            placeholder="City, State"
          />
        </div>
        <div className="field-group">
          <label>Date Range</label>
          <input
            type="text"
            value={exp.dateRange}
            onChange={(e) => updateExperience(index, "dateRange", e.target.value)}
            placeholder="Jan 2023 - Present"
          />
        </div>
      </div>
      <div className="bullets-section">
        <label>Bullet Points</label>
        <FormatToolbar />
        {exp.bullets.map((bullet, j) => {
          const bulletKey = `exp-${index}-bullet-${j}`;
          const isOptimizing = optimizingBullets[bulletKey];
          return (
            <div key={j} className="bullet-item">
              <div className="bullet-row">
                <textarea
                  rows={2}
                  value={bullet}
                  onChange={(e) => updateExpBullet(index, j, e.target.value)}
                  placeholder={`Bullet point ${j + 1}...`}
                  disabled={isOptimizing}
                />
                <div className="bullet-actions">
                  <button
                    type="button"
                    className="btn-icon btn-enhance"
                    disabled={!bullet.trim() || isOptimizing}
                    onClick={() => onEnhanceBullet(j, bullet)}
                    title="Enhance bullet point with AI"
                  >
                    {isOptimizing ? "⏳" : "✨"}
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    onClick={() => removeExpBullet(index, j)}
                    disabled={isOptimizing}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <BulletCoach
                text={bullet}
                roleFamily={detectRoleFamily(exp.role)}
                onApply={(newText) => onApplyBullet(j, bullet, newText)}
                disabled={isOptimizing}
              />
              {bulletNotices[bulletKey] && (
                <p className="quantify-error" role="alert">
                  {bulletNotices[bulletKey]}
                </p>
              )}
            </div>
          );
        })}
        <button
          className="btn-add btn-small"
          onClick={() => addExpBullet(index)}
        >
          <Plus size={12} /> Add Bullet
        </button>
      </div>
    </div>
  );
};

interface SortableEducationItemProps {
  edu: Education;
  index: number;
  updateEducation: (index: number, field: keyof Education, value: string) => void;
  removeEducation: (index: number) => void;
}

const SortableEducationItem: React.FC<SortableEducationItemProps> = ({
  edu,
  index,
  updateEducation,
  removeEducation,
}) => {
  const id = edu.id || `edu-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="editor-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button type="button" className="dnd-grip" {...attributes} {...listeners} aria-label="Drag education">
            <GripVertical size={16} />
          </button>
          <span className="card-number">#{index + 1}</span>
        </div>
        <button
          className="btn-icon btn-danger"
          onClick={() => removeEducation(index)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <FormatToolbar />
      <div className="field-row">
        <div className="field-group">
          <label>University</label>
          <input
            type="text"
            value={edu.university}
            onChange={(e) => updateEducation(index, "university", e.target.value)}
          />
        </div>
        <div className="field-group">
          <label>Year Range</label>
          <input
            type="text"
            value={edu.yearRange}
            onChange={(e) => updateEducation(index, "yearRange", e.target.value)}
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
            onChange={(e) => updateEducation(index, "degree", e.target.value)}
          />
        </div>
        <div className="field-group">
          <label>CGPA</label>
          <input
            type="text"
            value={edu.cgpa}
            onChange={(e) => updateEducation(index, "cgpa", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

interface SortableProjectItemProps {
  project: Project;
  index: number;
  updateProject: (index: number, field: keyof Project, value: string | string[]) => void;
  removeProject: (index: number) => void;
  updateBullet: (projectIndex: number, bulletIndex: number, value: string) => void;
  removeBullet: (projectIndex: number, bulletIndex: number) => void;
  addBullet: (projectIndex: number) => void;
  onEnhanceBullet: (bulletIndex: number, currentText: string) => Promise<void>;
  onApplyBullet: (bulletIndex: number, baseText: string, newText: string) => void;
  optimizingBullets: Record<string, boolean>;
  bulletNotices: Record<string, string>;
}

const SortableProjectItem: React.FC<SortableProjectItemProps> = ({
  project,
  index,
  updateProject,
  removeProject,
  updateBullet,
  removeBullet,
  addBullet,
  onEnhanceBullet,
  onApplyBullet,
  optimizingBullets,
  bulletNotices,
}) => {
  const id = project.id || `proj-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="editor-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button type="button" className="dnd-grip" {...attributes} {...listeners} aria-label="Drag project">
            <GripVertical size={16} />
          </button>
          <span className="card-number">Project #{index + 1}</span>
        </div>
        <button
          className="btn-icon btn-danger"
          onClick={() => removeProject(index)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="field-group">
        <label>Project Title</label>
        <input
          type="text"
          value={project.title}
          onChange={(e) => updateProject(index, "title", e.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field-group">
          <label>GitHub Link</label>
          <input
            type="text"
            value={project.githubLink}
            onChange={(e) => updateProject(index, "githubLink", e.target.value)}
          />
        </div>
        <div className="field-group">
          <label>Live Demo Link</label>
          <input
            type="text"
            value={project.liveLink}
            onChange={(e) => updateProject(index, "liveLink", e.target.value)}
          />
        </div>
      </div>
      <div className="field-group">
        <label>Tech Stack</label>
        <input
          type="text"
          value={project.techStack}
          onChange={(e) => updateProject(index, "techStack", e.target.value)}
        />
      </div>
      <div className="bullets-section">
        <label>Bullet Points</label>
        <FormatToolbar />
        {project.bullets.map((bullet, j) => {
          const bulletKey = `proj-${index}-bullet-${j}`;
          const isOptimizing = optimizingBullets[bulletKey];
          return (
            <div key={j} className="bullet-item">
              <div className="bullet-row">
                <textarea
                  rows={2}
                  value={bullet}
                  onChange={(e) => updateBullet(index, j, e.target.value)}
                  placeholder={`Bullet point ${j + 1}...`}
                  disabled={isOptimizing}
                />
                <div className="bullet-actions">
                  <button
                    type="button"
                    className="btn-icon btn-enhance"
                    disabled={!bullet.trim() || isOptimizing}
                    onClick={() => onEnhanceBullet(j, bullet)}
                    title="Enhance bullet point with AI"
                  >
                    {isOptimizing ? "⏳" : "✨"}
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    onClick={() => removeBullet(index, j)}
                    disabled={isOptimizing}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <BulletCoach
                text={bullet}
                roleFamily={detectRoleFamily("", project.techStack)}
                onApply={(newText) => onApplyBullet(j, bullet, newText)}
                disabled={isOptimizing}
              />
              {bulletNotices[bulletKey] && (
                <p className="quantify-error" role="alert">
                  {bulletNotices[bulletKey]}
                </p>
              )}
            </div>
          );
        })}
        <button className="btn-add btn-small" onClick={() => addBullet(index)}>
          <Plus size={12} /> Add Bullet
        </button>
      </div>
    </div>
  );
};

interface SortableSkillItemProps {
  skill: SkillCategory;
  index: number;
  updateSkill: (index: number, field: keyof SkillCategory, value: string) => void;
  removeSkill: (index: number) => void;
}

const SortableSkillItem: React.FC<SortableSkillItemProps> = ({
  skill,
  index,
  updateSkill,
  removeSkill,
}) => {
  const id = skill.id || `skill-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    width: "100%",
    borderBottom: "1px solid var(--border-color)",
    paddingBottom: "12px",
    marginBottom: "12px",
  };

  return (
    <div ref={setNodeRef} style={style} className="skill-row-container">
      <FormatToolbar />
      <div className="skill-row" style={{ marginBottom: 0 }}>
        <button type="button" className="dnd-grip" {...attributes} {...listeners} aria-label="Drag skill" style={{ background: 'none', border: 'none', cursor: 'grab', padding: '4px', color: '#666' }}>
          <GripVertical size={16} />
        </button>
        <div className="field-group skill-label-group">
          <input
            type="text"
            value={skill.label}
            onChange={(e) => updateSkill(index, "label", e.target.value)}
            placeholder="Category"
          />
        </div>
        <div className="field-group skill-value-group">
          <input
            type="text"
            value={skill.skills}
            onChange={(e) => updateSkill(index, "skills", e.target.value)}
            placeholder="Skill1, Skill2, Skill3"
          />
        </div>
        <button
          className="btn-icon btn-danger"
          onClick={() => removeSkill(index)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const ResumeEditor: React.FC<ResumeEditorProps> = ({ data, onChange }) => {
  const activeSection = useAppStore((s) => s.activeSection) || "contact";
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const templateId = useAppStore((s) => s.templateId);

  const [optimizingBullets, setOptimizingBullets] = useState<Record<string, boolean>>({});
  const [bulletNotices, setBulletNotices] = useState<Record<string, string>>({});
  const jdText = useAppStore((s) => s.jdText);

  const setNotice = (key: string, message: string | null) =>
    setBulletNotices((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });

  /** Writes `newText` into the bullet it was made for, on top of the latest resume. */
  const applyToBullet = (
    kind: BulletKind,
    entryId: string | undefined,
    entryIndex: number,
    bulletIndex: number,
    baseText: string,
    newText: string,
  ): boolean => {
    const key = `${kind}-${entryIndex}-bullet-${bulletIndex}`;
    const latest = useAppStore.getState().resumeData ?? data;
    const updated = applyBulletResult(
      latest,
      kind,
      entryId,
      entryIndex,
      bulletIndex,
      baseText,
      newText,
    );
    if (!updated) {
      setNotice(key, BULLET_CHANGED_NOTICE);
      return false;
    }
    setNotice(key, null);
    onChange(updated);
    return true;
  };

  const handleEnhanceBullet = async (
    kind: BulletKind,
    entryIndex: number,
    bulletIndex: number,
    currentText: string,
  ) => {
    if (!currentText.trim()) return;
    const key = `${kind}-${entryIndex}-bullet-${bulletIndex}`;
    const entryId = (kind === "exp" ? data.experience : data.projects)?.[entryIndex]?.id;
    setNotice(key, null);
    setOptimizingBullets((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await postServerAIRequest<
        { bulletText: string; jobDescription?: string },
        { optimizedText: string }
      >(
        "/api/optimize/bullet",
        {
          bulletText: currentText,
          jobDescription: jdText || undefined,
        }
      );
      if (response && response.optimizedText) {
        applyToBullet(kind, entryId, entryIndex, bulletIndex, currentText, response.optimizedText);
      }
    } catch (error) {
      console.error("Failed to enhance bullet:", error);
      setNotice(
        key,
        error instanceof Error ? error.message : "Failed to optimize bullet point.",
      );
    } finally {
      setOptimizingBullets((prev) => ({ ...prev, [key]: false }));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Give list entries stable ids (needed for drag and drop). This is not a user
  // edit, so it must not add an undo entry or clear the redo stack.
  React.useEffect(() => {
    let changed = false;
    const withIds = <T extends { id?: string }>(items: T[] | undefined, prefix: string): T[] =>
      (items || []).map((item) => {
        if (item.id) return item;
        changed = true;
        return { ...item, id: newId(prefix) };
      });

    const next = {
      ...data,
      experience: withIds(data.experience, "exp"),
      education: withIds(data.education, "edu"),
      projects: withIds(data.projects, "proj"),
      skills: withIds(data.skills, "skill"),
    };

    if (changed) {
      const store = useAppStore.getState();
      // Only write when the store still holds the snapshot we were given;
      // otherwise a newer edit would be overwritten and the next render retries.
      if (store.resumeData === data) store.setResumeData(next, false);
    }
  }, [data]);

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
        { id: newId("edu"), university: "", location: "", degree: "", yearRange: "", cgpa: "" },
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
          id: newId("proj"),
          title: "",
          githubLink: "",
          liveLink: "",
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
    onChange({ ...data, skills: [...data.skills, { id: newId("skill"), label: "", skills: "" }] });
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
        { id: newId("exp"), company: "", role: "", location: "", dateRange: "", bullets: [""] },
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

  const handleDragEndExperience = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = (data.experience || []).findIndex((exp) => exp.id === active.id);
      const newIndex = (data.experience || []).findIndex((exp) => exp.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange({ ...data, experience: arrayMove(data.experience, oldIndex, newIndex) });
      }
    }
  };

  const handleDragEndEducation = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = (data.education || []).findIndex((edu) => edu.id === active.id);
      const newIndex = (data.education || []).findIndex((edu) => edu.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange({ ...data, education: arrayMove(data.education, oldIndex, newIndex) });
      }
    }
  };

  const handleDragEndProject = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = (data.projects || []).findIndex((proj) => proj.id === active.id);
      const newIndex = (data.projects || []).findIndex((proj) => proj.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange({ ...data, projects: arrayMove(data.projects, oldIndex, newIndex) });
      }
    }
  };

  const handleDragEndSkill = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = (data.skills || []).findIndex((skill) => skill.id === active.id);
      const newIndex = (data.skills || []).findIndex((skill) => skill.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange({ ...data, skills: arrayMove(data.skills, oldIndex, newIndex) });
      }
    }
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

  const tabs = [
    { id: "contact", label: "Contact" },
    { id: "summary", label: "Summary" },
    { id: "experience", label: "Experience" },
    { id: "education", label: "Education" },
    { id: "projects", label: "Projects" },
    { id: "skills", label: "Skills" },
    { id: "achievements", label: "Achievements" },
    { id: "certificates", label: "Certificates" },
    { id: "sectionOrder", label: "Layout" },
  ];

  return (
    <div className="resume-editor" role="form" aria-label="Resume editor form">
      {/* Kept for screen readers; visually it repeated the page context. */}
      <h2 className="sr-only">Resume Editor</h2>

      <CompletenessBar data={data} />

      {/* Editor Tabs Navigation */}
      <div className="editor-tabs-nav" data-tour="editor-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`editor-tab-btn ${activeSection === tab.id ? "active" : ""}`}
            onClick={() => setActiveSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ATS Formatting Warning */}
      {templateId === "portfolio" && (
        <div className="ats-layout-warning">
          <AlertTriangle size={16} className="warning-icon" />
          <span>
            <strong>ATS Formatting Warning:</strong> Two-column layouts (like the Portfolio template) may be parsed incorrectly/out of order by older ATS portals. Consider using the <strong>ATS</strong> template for online portal applications.
          </span>
        </div>
      )}

      {/* Active Tab Content */}
      <div className="editor-tab-content">
        {activeSection === "contact" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Contact Information</h3>
              </div>
              <div className="field-group">
                <label htmlFor="contact-name">Full Name</label>
                <input
                  id="contact-name"
                  type="text"
                  value={data.contact.name}
                  onChange={(e) => updateContact("name", e.target.value)}
                  aria-invalid={!data.contact.name.trim()}
                  aria-describedby={
                    data.contact.name.trim() ? undefined : "contact-name-hint"
                  }
                />
                {!data.contact.name.trim() && (
                  // Parsing leaves this empty when the PDF's name was an image
                  // or styled heading that text extraction couldn't read.
                  <p id="contact-name-hint" className="field-hint-required">
                    Add your name — it's needed before you can download.
                  </p>
                )}
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
          </div>
        )}

        {activeSection === "summary" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Summary</h3>
              </div>
              <FormatToolbar />
              <textarea
                rows={6}
                value={data.summary}
                onChange={(e) => updateSummary(e.target.value)}
                placeholder="Professional summary..."
              />
            </div>
          </div>
        )}

        {activeSection === "education" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Education History</h3>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndEducation}
              >
                <SortableContext
                  items={(data.education || []).map((edu) => edu.id || "")}
                  strategy={verticalListSortingStrategy}
                >
                  {data.education.map((edu, i) => (
                    <SortableEducationItem
                      key={edu.id || i}
                      edu={edu}
                      index={i}
                      updateEducation={updateEducation}
                      removeEducation={removeEducation}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <button className="btn-add" onClick={addEducation}>
                <Plus size={14} /> Add Education
              </button>
            </div>
          </div>
        )}

        {activeSection === "experience" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Work Experience</h3>
                <button
                  type="button"
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
              </div>
              {!data.showExperience && (
                <div className="toggle-hint">
                  Experience section is hidden on the resume. Toggle it on to
                  show.
                </div>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndExperience}
              >
                <SortableContext
                  items={(data.experience || []).map((exp) => exp.id || "")}
                  strategy={verticalListSortingStrategy}
                >
                  {(data.experience || []).map((exp, i) => (
                    <SortableExperienceItem
                      key={exp.id || i}
                      exp={exp}
                      index={i}
                      updateExperience={updateExperience}
                      removeExperience={removeExperience}
                      updateExpBullet={updateExpBullet}
                      removeExpBullet={removeExpBullet}
                      addExpBullet={addExpBullet}
                      onEnhanceBullet={(bulletIndex, currentText) =>
                        handleEnhanceBullet("exp", i, bulletIndex, currentText)
                      }
                      onApplyBullet={(bulletIndex, baseText, newText) =>
                        applyToBullet("exp", exp.id, i, bulletIndex, baseText, newText)
                      }
                      optimizingBullets={optimizingBullets}
                      bulletNotices={bulletNotices}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <button className="btn-add" onClick={addExperience}>
                <Plus size={14} /> Add Experience
              </button>
            </div>
          </div>
        )}

        {activeSection === "projects" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Projects</h3>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndProject}
              >
                <SortableContext
                  items={(data.projects || []).map((proj) => proj.id || "")}
                  strategy={verticalListSortingStrategy}
                >
                  {data.projects.map((project, i) => (
                    <SortableProjectItem
                      key={project.id || i}
                      project={project}
                      index={i}
                      updateProject={updateProject}
                      removeProject={removeProject}
                      updateBullet={updateBullet}
                      removeBullet={removeBullet}
                      addBullet={addBullet}
                      onEnhanceBullet={(bulletIndex, currentText) =>
                        handleEnhanceBullet("proj", i, bulletIndex, currentText)
                      }
                      onApplyBullet={(bulletIndex, baseText, newText) =>
                        applyToBullet("proj", project.id, i, bulletIndex, baseText, newText)
                      }
                      optimizingBullets={optimizingBullets}
                      bulletNotices={bulletNotices}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <button className="btn-add" onClick={addProject}>
                <Plus size={14} /> Add Project
              </button>
            </div>
          </div>
        )}

        {activeSection === "skills" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Skills</h3>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndSkill}
              >
                <SortableContext
                  items={(data.skills || []).map((skill) => skill.id || "")}
                  strategy={verticalListSortingStrategy}
                >
                  {data.skills.map((skill, i) => (
                    <SortableSkillItem
                      key={skill.id || i}
                      skill={skill}
                      index={i}
                      updateSkill={updateSkill}
                      removeSkill={removeSkill}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <button className="btn-add" onClick={addSkill}>
                <Plus size={14} /> Add Skill Category
              </button>
            </div>
          </div>
        )}

        {activeSection === "achievements" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Achievements</h3>
              </div>
              {/* Achievement has no id in the type, so rows are keyed by index. */}
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
                    <FormatToolbar />
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
          </div>
        )}

        {activeSection === "certificates" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>Certificates</h3>
                <button
                  type="button"
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
              </div>
              {!data.showCertificates && (
                <div className="toggle-hint">
                  Certificates section is hidden on the resume. Toggle it on to
                  show.
                </div>
              )}
              {/* Certificate has no id in the type, so rows are keyed by index. */}
              {(data.certificates || []).map((cert, i) => (
                <div key={i} className="cert-editor-row-container" style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px", marginBottom: "12px" }}>
                  <FormatToolbar />
                  <div className="cert-editor-row" style={{ display: "flex", gap: "6px", width: "100%", alignItems: "flex-start", marginBottom: 0 }}>
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
                </div>
              ))}
              <button className="btn-add" onClick={addCertificate}>
                <Plus size={14} /> Add Certificate
              </button>
            </div>
          </div>
        )}

        {activeSection === "sectionOrder" && (
          <div className="editor-section">
            <div className="editor-fields">
              <div className="tab-section-header">
                <h3>
                  <Layers
                    size={16}
                    style={{ marginRight: 6, verticalAlign: "middle" }}
                  />
                  Section Order Layout
                </h3>
              </div>
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
          </div>
        )}
      </div>

      <AINotice className="ai-notice--editor" />
    </div>
  );
};

export default ResumeEditor;
