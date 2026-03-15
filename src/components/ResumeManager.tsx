import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/clerk-react";
import { useAppStore } from "../store/appStore";
import {
  loadAllResumes,
  deleteResume,
  renameResume,
  type ResumeRow,
} from "../services/resumeService";
import { FileText, Plus, Trash2, Edit3, X, Check } from "lucide-react";
import "./ResumeManager.css";

interface ResumeManagerProps {
  onClose: () => void;
}

export default function ResumeManager({ onClose }: ResumeManagerProps) {
  const { user } = useUser();
  const userId = user?.id;
  const setResumeData = useAppStore((s) => s.setResumeData);
  const setStep = useAppStore((s) => s.setStep);
  const startOver = useAppStore((s) => s.startOver);

  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPercent, setLoadingPercent] = useState(20);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!loading) return;
    const interval = window.setInterval(() => {
      setLoadingPercent((previous) => Math.min(previous + 12, 90));
    }, 350);
    return () => window.clearInterval(interval);
  }, [loading]);

  const fetchResumes = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadingPercent(20);
    const rows = await loadAllResumes(userId);
    setResumes(rows);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      const rows = await loadAllResumes(userId);
      if (!active) return;
      setResumes(rows);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const handleSelect = (row: ResumeRow) => {
    setResumeData(row.data, false);
    setStep("editor");
    onClose();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this resume? This cannot be undone.")) return;
    await deleteResume(id);
    await fetchResumes();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renameResume(id, editName.trim());
    setEditingId(null);
    await fetchResumes();
  };

  const handleNew = () => {
    startOver();
    onClose();
  };

  return (
    <div
      className="rm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="My Resumes"
    >
      <div className="rm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rm-header">
          <h2>My Resumes</h2>
          <button className="rm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="rm-loading">
            <strong>{loadingPercent}%</strong>
            <span>Loading resumes...</span>
          </div>
        ) : (
          <div className="rm-list">
            <button className="rm-new" onClick={handleNew}>
              <Plus size={16} />
              Create New Resume
            </button>

            {resumes.length === 0 && (
              <p className="rm-empty">
                No resumes yet. Create one to get started!
              </p>
            )}

            {resumes.map((row) => (
              <div key={row.id} className="rm-item">
                <div className="rm-item-icon">
                  <FileText size={20} />
                </div>
                <div className="rm-item-info">
                  {editingId === row.id ? (
                    <div className="rm-rename">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(row.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        aria-label="Resume name"
                      />
                      <button
                        onClick={() => handleRename(row.id)}
                        aria-label="Confirm rename"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="rm-name">
                        {row.name || "Untitled Resume"}
                      </span>
                      <span className="rm-date">
                        {new Date(row.updated_at).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
                <div className="rm-item-actions">
                  <button
                    className="rm-btn"
                    onClick={() => handleSelect(row)}
                    title="Open"
                  >
                    Open
                  </button>
                  <button
                    className="rm-btn-icon"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditName(row.name || "");
                    }}
                    title="Rename"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    className="rm-btn-icon rm-btn-danger"
                    onClick={() => handleDelete(row.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
