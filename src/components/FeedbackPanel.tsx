import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, MessageSquare, Shield, Star, X } from "lucide-react";
import {
  loadAdminFeedbackForRemoval,
  loadMyFeedback,
  loadPublicFeedback,
  moderateFeedback,
  upsertMyFeedback,
} from "../services/feedbackService";
import {
  loadPopularitySnapshot,
  subscribeToPopularity,
} from "../services/popularityService";
import {
  buildFeedbackSummary,
  emptyPopularitySnapshot,
  maskEmailAddress,
  type PopularityMetricKey,
  type PopularitySnapshot,
  type FeedbackRow,
} from "../types/feedback";
import { trackEvent } from "../utils/analytics";
import "./FeedbackPanel.css";

type FeedbackTab = "my" | "community" | "admin";

interface FeedbackPanelProps {
  onClose: () => void;
  userId: string;
  userEmail: string;
  isAdmin: boolean;
  initialTab?: FeedbackTab;
  requireFeedbackForDownload?: boolean;
  onFeedbackSubmitted?: (saved: FeedbackRow) => void;
}

const COMMENT_MIN_LENGTH = 10;

const POPULARITY_ORDER: PopularityMetricKey[] = [
  "ats_resume_edit",
  "resume_edit",
  "create_resume",
  "resume_download",
];

const POPULARITY_LABELS: Record<PopularityMetricKey, string> = {
  ats_resume_edit: "ATS + Optimize",
  resume_edit: "Resume Edit",
  create_resume: "Create Resume",
  resume_download: "Resume Downloads",
};

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  onClose,
  userId,
  userEmail,
  isAdmin,
  initialTab = "community",
  requireFeedbackForDownload = false,
  onFeedbackSubmitted,
}) => {
  const [activeTab, setActiveTab] = useState<FeedbackTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [myFeedback, setMyFeedback] = useState<FeedbackRow | null>(null);
  const [publicFeedback, setPublicFeedback] = useState<FeedbackRow[]>([]);
  const [adminQueue, setAdminQueue] = useState<FeedbackRow[]>([]);
  const [popularity, setPopularity] = useState<PopularitySnapshot>(
    emptyPopularitySnapshot,
  );

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const summary = useMemo(
    () => buildFeedbackSummary(publicFeedback),
    [publicFeedback],
  );

  const loadMine = useCallback(async () => {
    const mine = await loadMyFeedback(userId);
    setMyFeedback(mine);
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment);
      setIsPublic(mine.is_public);
    }
  }, [userId]);

  const loadCommunity = useCallback(async () => {
    const rows = await loadPublicFeedback();
    setPublicFeedback(rows);
  }, []);

  const loadPopularity = useCallback(async () => {
    const snapshot = await loadPopularitySnapshot();
    setPopularity(snapshot);
  }, []);

  const loadAdminQueue = useCallback(async () => {
    if (!isAdmin) return;
    const rows = await loadAdminFeedbackForRemoval();
    setAdminQueue(rows);
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setNotice(null);

    void (async () => {
      try {
        await Promise.all([
          loadMine(),
          loadCommunity(),
          loadAdminQueue(),
          loadPopularity(),
        ]);
      } catch (err) {
        console.error(err);
        setError("Failed to load feedback. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMine, loadCommunity, loadAdminQueue, loadPopularity]);

  useEffect(() => {
    const unsubscribe = subscribeToPopularity((snapshot) => {
      setPopularity(snapshot);
    });

    return unsubscribe;
  }, []);

  const handleSubmit = async () => {
    setError(null);
    setNotice(null);

    const trimmed = comment.trim();
    if (trimmed.length < COMMENT_MIN_LENGTH) {
      setError(
        `Please write at least ${COMMENT_MIN_LENGTH} characters for feedback.`,
      );
      return;
    }

    setLoading(true);
    const saved = await upsertMyFeedback({
      userId,
      userEmail,
      rating,
      comment: trimmed,
      isPublic,
    });
    setLoading(false);

    if (!saved) {
      setError("Could not submit feedback right now. Please try again.");
      return;
    }

    setMyFeedback(saved);
    setNotice(
      requireFeedbackForDownload
        ? "Thanks. Your feedback is submitted. Continuing your download..."
        : "Thanks. Your feedback is now visible in the community.",
    );
    trackEvent("feedback_submitted", {
      rating: saved.rating,
      is_public: saved.is_public,
      status: saved.status,
      is_edit: Boolean(myFeedback),
    });

    onFeedbackSubmitted?.(saved);

    await loadCommunity();
    if (isAdmin) {
      await loadAdminQueue();
    }
  };

  const handleModeration = async (row: FeedbackRow) => {
    setError(null);
    setNotice(null);
    setLoading(true);

    const updated = await moderateFeedback(row.id, userEmail);

    setLoading(false);

    if (!updated) {
      setError("Could not remove feedback. Please retry.");
      return;
    }

    setNotice("Feedback removed from community.");
    trackEvent("feedback_moderated", {
      action: "removed",
      feedback_id: row.id,
    });

    await Promise.all([loadAdminQueue(), loadCommunity()]);
  };

  const renderStars = (value: number, interactive = false) => (
    <div className="feedback-stars" role={interactive ? "group" : undefined}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <button
            key={star}
            type="button"
            className={`feedback-star ${filled ? "filled" : ""} ${interactive ? "interactive" : "readonly"}`}
            onClick={interactive ? () => setRating(star) : undefined}
            disabled={!interactive}
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
          >
            <Star size={16} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="feedback-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Feedback and Ratings"
    >
      <div className="feedback-panel" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-header">
          <h3>
            <MessageSquare size={18} /> Feedback & Ratings
          </h3>
          <button
            className="feedback-close"
            onClick={onClose}
            aria-label="Close feedback panel"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="feedback-tabs"
          role="tablist"
          aria-label="Feedback tabs"
        >
          <button
            className={`feedback-tab ${activeTab === "my" ? "active" : ""}`}
            onClick={() => setActiveTab("my")}
            role="tab"
            aria-selected={activeTab === "my"}
          >
            My Feedback
          </button>
          <button
            className={`feedback-tab ${activeTab === "community" ? "active" : ""}`}
            onClick={() => setActiveTab("community")}
            role="tab"
            aria-selected={activeTab === "community"}
          >
            Community
          </button>
          {isAdmin && (
            <button
              className={`feedback-tab ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
              role="tab"
              aria-selected={activeTab === "admin"}
            >
              <Shield size={14} /> Admin
            </button>
          )}
        </div>

        {loading && <p className="feedback-message">Loading...</p>}
        {error && <p className="feedback-error">{error}</p>}
        {notice && <p className="feedback-success">{notice}</p>}

        {activeTab === "my" && (
          <section className="feedback-section">
            {requireFeedbackForDownload && (
              <p className="feedback-gate-note">
                Give feedback once to unlock this download. After submitting,
                your future downloads will work directly.
              </p>
            )}

            <p className="feedback-muted">
              Rate your experience and share what can be improved.
            </p>

            <label className="feedback-label">Your Rating</label>
            {renderStars(rating, true)}

            <label className="feedback-label" htmlFor="feedback-comment">
              Feedback
            </label>
            <textarea
              id="feedback-comment"
              className="feedback-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what helped and what should improve."
              rows={5}
              maxLength={2000}
            />

            <label className="feedback-checkbox">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span>Allow this feedback to appear publicly.</span>
            </label>

            <button className="feedback-submit" onClick={handleSubmit}>
              <Check size={14} />
              {requireFeedbackForDownload && !myFeedback
                ? "Submit Feedback & Continue Download"
                : myFeedback
                  ? "Update Feedback"
                  : "Submit Feedback"}
            </button>
          </section>
        )}

        {activeTab === "community" && (
          <section className="feedback-section">
            <div className="popularity-section">
              <div className="popularity-header">
                <strong>Live Popularity</strong>
                {popularity.updatedAt && (
                  <small>
                    Updated {new Date(popularity.updatedAt).toLocaleString()}
                  </small>
                )}
              </div>

              <div className="popularity-grid">
                {POPULARITY_ORDER.map((metricKey) => {
                  const metric = popularity[metricKey];
                  return (
                    <article key={metricKey} className="popularity-card">
                      <h5>{POPULARITY_LABELS[metricKey]}</h5>
                      <p>{metric.totalCount.toLocaleString()} total uses</p>
                      <small>
                        {metric.uniqueUsers.toLocaleString()} unique users
                      </small>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="feedback-summary-card">
              <strong>{summary.averageRating.toFixed(1)} / 5</strong>
              <span>{summary.totalRatings} public review(s)</span>
              {renderStars(Math.round(summary.averageRating), false)}
            </div>

            <div className="feedback-list">
              {publicFeedback.length === 0 && (
                <p className="feedback-muted">No public reviews yet.</p>
              )}
              {publicFeedback.map((row) => (
                <article key={row.id} className="feedback-item">
                  <div className="feedback-item-header">
                    {renderStars(row.rating, false)}
                    <small>
                      {new Date(row.created_at).toLocaleDateString()}
                    </small>
                  </div>
                  <p>{row.comment}</p>
                  <small className="feedback-author">
                    by {maskEmailAddress(row.user_email)}
                  </small>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "admin" && isAdmin && (
          <section className="feedback-section">
            <p className="feedback-muted">
              All public feedback appears here. Remove items that are not good.
            </p>

            <div className="feedback-list">
              {adminQueue.length === 0 && (
                <p className="feedback-muted">No public feedback to remove.</p>
              )}
              {adminQueue.map((row) => (
                <article key={row.id} className="feedback-item admin-item">
                  <div className="feedback-item-header">
                    <strong>{row.user_email}</strong>
                    <small>
                      {new Date(row.created_at).toLocaleDateString()}
                    </small>
                  </div>

                  <div className="feedback-item-rating">
                    {renderStars(row.rating)}
                  </div>
                  <p>{row.comment}</p>

                  <div className="feedback-admin-actions">
                    <button
                      className="feedback-reject"
                      onClick={() => handleModeration(row)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default FeedbackPanel;
