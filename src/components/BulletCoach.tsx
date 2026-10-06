import React, { useId, useMemo, useState } from "react";
import { analyzeBullet, type BulletCheck } from "../utils/bulletCoach";
import {
  hasPlaceholder,
  insertBlank,
  metricIdeasFor,
  type ChangeIdea,
  type RoleFamily,
} from "../utils/quantify";
import { postServerAIRequest } from "../utils/aiService";
import { useAppStore } from "../store/appStore";
import AINotice from "./AINotice";
import "./BulletCoach.css";

interface BulletCoachProps {
  text: string;
  roleFamily: RoleFamily;
  onApply: (newText: string) => void;
  disabled?: boolean;
}

type Step =
  | { name: "closed" }
  | { name: "pick" }
  | { name: "amount"; idea: ChangeIdea }
  | { name: "loading"; idea: ChangeIdea }
  | { name: "preview"; idea: ChangeIdea; text: string; base: string }
  | { name: "error"; idea: ChangeIdea; message: string };

const CHECK_LABELS = { action: "Action verb", scope: "What & how", result: "Result" } as const;
const ICONS = { pass: "✓", partial: "~", fail: "✗" } as const;
// Judging a half-typed sentence is noise; wait until there is something to read.
const MIN_WORDS = 4;
const VISIBLE_IDEAS = 6;

function Chip({ name, check }: { name: keyof typeof CHECK_LABELS; check: BulletCheck }) {
  return (
    <span
      className={`coach-chip coach-chip--${check.status}`}
      title={check.tip || `${CHECK_LABELS[name]}: looks good`}
    >
      <span aria-hidden="true">{ICONS[check.status]}</span> {CHECK_LABELS[name]}
      <span className="sr-only">: {check.status === "pass" ? "looks good" : check.tip}</span>
    </span>
  );
}

const BulletCoach: React.FC<BulletCoachProps> = ({ text, roleFamily, onApply, disabled }) => {
  const jdText = useAppStore((s) => s.jdText);
  const amountId = useId();
  const [step, setStep] = useState<Step>({ name: "closed" });
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [showAllIdeas, setShowAllIdeas] = useState(false);

  const analysis = useMemo(() => analyzeBullet(text), [text]);
  const ideas = useMemo(() => metricIdeasFor(roleFamily), [roleFamily]);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  if (hasPlaceholder(text)) {
    return (
      <div className="bullet-coach">
        <p className="coach-blank">
          Replace the <strong>[X]</strong> with your number. A rough estimate is fine. You
          can&apos;t download until it&apos;s filled in.
        </p>
      </div>
    );
  }

  if (analysis.empty || wordCount < MIN_WORDS) return null;

  const { checks } = analysis;
  const firstTip = [checks.action, checks.scope, checks.result].find((c) => c.status !== "pass")?.tip;
  const close = () => {
    setStep({ name: "closed" });
    setAmount("");
    setDetail("");
    setShowAllIdeas(false);
  };

  const write = async (idea: ChangeIdea) => {
    // The text this suggestion is written for; it is only applied if the
    // bullet still reads the same when the user accepts it.
    const base = text;
    setStep({ name: "loading", idea });
    try {
      const response = await postServerAIRequest<
        {
          bulletText: string;
          jobDescription?: string;
          facts: { changeType: string; amount: string; detail?: string };
        },
        { optimizedText: string }
      >("/api/optimize/bullet", {
        bulletText: text,
        jobDescription: jdText || undefined,
        facts: { changeType: idea.id, amount: amount.trim(), detail: detail.trim() || undefined },
      });
      setStep({ name: "preview", idea, text: response.optimizedText, base });
    } catch (error) {
      setStep({
        name: "error",
        idea,
        message: error instanceof Error ? error.message : "Couldn't rewrite the bullet. Try again.",
      });
    }
  };

  const keep = (newText: string, base: string = text, idea?: ChangeIdea) => {
    if (base !== text) {
      setStep({
        name: "error",
        idea: idea ?? ideas[0],
        message: "This bullet changed while the suggestion was being written, so it wasn't applied. Try again on the current text.",
      });
      return;
    }
    onApply(newText);
    close();
  };

  return (
    <div className="bullet-coach">
      <div className="coach-row">
        <Chip name="action" check={checks.action} />
        <Chip name="scope" check={checks.scope} />
        <Chip name="result" check={checks.result} />
        {checks.result.status !== "pass" && step.name === "closed" && (
          <button
            type="button"
            className="coach-add-result"
            onClick={() => setStep({ name: "pick" })}
            disabled={disabled}
          >
            + Add a result
          </button>
        )}
      </div>
      {firstTip && step.name === "closed" && <p className="coach-tip">{firstTip}</p>}

      {step.name !== "closed" && (
        <div className="quantify-panel" role="group" aria-label="Add a result">
          {step.name === "pick" && (
            <>
              <p className="quantify-question">What changed because of this work?</p>
              <div className="quantify-ideas">
                {(showAllIdeas ? ideas : ideas.slice(0, VISIBLE_IDEAS)).map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    className="quantify-idea"
                    onClick={() => setStep({ name: "amount", idea })}
                  >
                    {idea.label}
                  </button>
                ))}
                {!showAllIdeas && ideas.length > VISIBLE_IDEAS && (
                  <button type="button" className="quantify-link" onClick={() => setShowAllIdeas(true)}>
                    More…
                  </button>
                )}
              </div>
              <div className="quantify-actions">
                <button type="button" className="quantify-link" onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {step.name === "amount" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (amount.trim()) void write(step.idea);
              }}
            >
              <label className="quantify-question" htmlFor={amountId}>
                {step.idea.question}
              </label>
              <input
                id={amountId}
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`e.g. ${step.idea.example}`}
                maxLength={80}
                autoFocus
              />
              <input
                type="text"
                aria-label="What exactly improved (optional)"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="What exactly improved? (optional, e.g. page load time)"
                maxLength={240}
              />
              <p className="quantify-hint">
                Estimates are fine, e.g. &quot;~40%&quot; or &quot;about 200&quot;. We only use the
                numbers you type here.
              </p>
              <div className="quantify-actions">
                <button type="submit" className="quantify-primary" disabled={!amount.trim()}>
                  Rewrite my bullet
                </button>
                <button
                  type="button"
                  className="quantify-secondary"
                  onClick={() => keep(insertBlank(text, step.idea.id))}
                  title="Adds a [X] blank to fill in later. Download is blocked until you fill it."
                >
                  Not sure yet, add a blank
                </button>
                <button type="button" className="quantify-link" onClick={() => setStep({ name: "pick" })}>
                  Back
                </button>
              </div>
            </form>
          )}

          {step.name === "loading" && <p className="quantify-question">Rewriting with your number…</p>}

          {step.name === "preview" && (
            <>
              <p className="quantify-question">Your new bullet:</p>
              <p className="quantify-preview">{step.text}</p>
              <AINotice />
              <div className="quantify-actions">
                <button type="button" className="quantify-primary" onClick={() => keep(step.text, step.base, step.idea)}>
                  Use this
                </button>
                <button type="button" className="quantify-secondary" onClick={() => void write(step.idea)}>
                  Try again
                </button>
                <button type="button" className="quantify-link" onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {step.name === "error" && (
            <>
              <p className="quantify-error" role="alert">
                {step.message}
              </p>
              <div className="quantify-actions">
                <button type="button" className="quantify-secondary" onClick={() => void write(step.idea)}>
                  Try again
                </button>
                <button type="button" className="quantify-link" onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BulletCoach;
