import React, { useState, memo } from "react";
import type { ResumeData, JDAnalysis } from "../types/resume";
import { analyzeJD, suggestSkillAdditions } from "../utils/jdAnalyzer";
import { Search, CheckCircle, AlertCircle, Zap, Plus } from "lucide-react";
import "./JDAnalyzer.css";

interface JDAnalyzerProps {
  resumeData: ResumeData;
  onKeywordsFound: (keywords: string[]) => void;
  onAddSkills: (category: string, newSkills: string) => void;
  onAddToBullet: (projectIndex: number, keyword: string) => void;
}

const JDAnalyzer: React.FC<JDAnalyzerProps> = memo(({
  resumeData,
  onKeywordsFound,
  onAddSkills,
  onAddToBullet,
}) => {
  const [jdText, setJDText] = useState("");
  const [analysis, setAnalysis] = useState<JDAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<Map<string, string[]>>(
    new Map(),
  );

  const handleAnalyze = () => {
    if (!jdText.trim()) return;

    const result = analyzeJD(jdText, resumeData);
    setAnalysis(result);
    onKeywordsFound(result.matchedKeywords);

    const skillSuggestions = suggestSkillAdditions(
      result.missingKeywords,
      resumeData.skills,
    );
    setSuggestions(skillSuggestions);
  };

  const handleClear = () => {
    setJDText("");
    setAnalysis(null);
    setSuggestions(new Map());
    onKeywordsFound([]);
  };

  const handleAddSkillToCategory = (category: string, keywords: string[]) => {
    const existingCategory = resumeData.skills.find(
      (s) => s.label === category,
    );
    if (existingCategory) {
      const newSkillsStr = keywords.join(", ");
      onAddSkills(category, existingCategory.skills + ", " + newSkillsStr);
    } else {
      onAddSkills(category, keywords.join(", "));
    }
    // Re-analyze after adding
    setTimeout(() => {
      const result = analyzeJD(jdText, resumeData);
      setAnalysis(result);
      onKeywordsFound(result.matchedKeywords);
    }, 100);
  };

  const getScoreColor = (pct: number) => {
    if (pct >= 70) return "#22c55e";
    if (pct >= 40) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="jd-analyzer">
      <h2 className="analyzer-title">
        <Zap size={18} />
        JD Keyword Analyzer
      </h2>

      <div className="jd-input-section">
        <label>Paste Job Description</label>
        <textarea
          rows={8}
          value={jdText}
          onChange={(e) => setJDText(e.target.value)}
          placeholder="Paste the full job description here to analyze keywords and improve your resume match..."
        />
        <div className="jd-actions">
          <button
            className="btn-analyze"
            onClick={handleAnalyze}
            disabled={!jdText.trim()}
          >
            <Search size={14} />
            Analyze Keywords
          </button>
          {analysis && (
            <button className="btn-clear" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      {analysis && (
        <div className="analysis-results">
          {/* Match Score */}
          <div className="match-score">
            <div
              className="score-circle"
              style={{ borderColor: getScoreColor(analysis.matchPercentage) }}
            >
              <span
                className="score-number"
                style={{ color: getScoreColor(analysis.matchPercentage) }}
              >
                {analysis.matchPercentage}%
              </span>
              <span className="score-label">Match</span>
            </div>
            <div className="score-details">
              <div className="score-stat">
                <CheckCircle size={14} className="text-green" />
                <span>{analysis.matchedKeywords.length} keywords matched</span>
              </div>
              <div className="score-stat">
                <AlertCircle size={14} className="text-red" />
                <span>{analysis.missingKeywords.length} keywords missing</span>
              </div>
              <div className="score-stat total">
                <span>
                  {analysis.allKeywords.length} total keywords found in JD
                </span>
              </div>
            </div>
          </div>

          {/* Matched Keywords */}
          {analysis.matchedKeywords.length > 0 && (
            <div className="keyword-section">
              <h4 className="keyword-section-title matched">
                <CheckCircle size={14} />
                Matched Keywords ({analysis.matchedKeywords.length})
              </h4>
              <div className="keyword-tags">
                {analysis.matchedKeywords.map((kw, i) => (
                  <span key={i} className="keyword-tag matched">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing Keywords */}
          {analysis.missingKeywords.length > 0 && (
            <div className="keyword-section">
              <h4 className="keyword-section-title missing">
                <AlertCircle size={14} />
                Missing Keywords ({analysis.missingKeywords.length})
              </h4>
              <div className="keyword-tags">
                {analysis.missingKeywords.map((kw, i) => (
                  <span key={i} className="keyword-tag missing">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.size > 0 && (
            <div className="suggestions-section">
              <h4 className="suggestions-title">
                <Zap size={14} />
                Quick Add Suggestions
              </h4>
              <p className="suggestions-desc">
                Click to add missing keywords to your resume skills or project
                bullet points:
              </p>

              {Array.from(suggestions.entries()).map(([category, keywords]) => (
                <div key={category} className="suggestion-group">
                  <div className="suggestion-header">
                    <span className="suggestion-category">{category}</span>
                    <button
                      className="btn-add-all"
                      onClick={() =>
                        handleAddSkillToCategory(category, keywords)
                      }
                    >
                      <Plus size={12} />
                      Add all to Skills
                    </button>
                  </div>
                  <div className="suggestion-keywords">
                    {keywords.map((kw, i) => (
                      <span key={i} className="suggestion-keyword">
                        {kw}
                        <button
                          className="btn-add-single"
                          onClick={() =>
                            handleAddSkillToCategory(category, [kw])
                          }
                          title="Add to skills"
                        >
                          +
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* Add to project bullets */}
              {resumeData.projects.length > 0 &&
                analysis.missingKeywords.length > 0 && (
                  <div className="add-to-bullets">
                    <h5>Add keyword to project bullet:</h5>
                    {resumeData.projects.map((project, pi) => (
                      <div key={pi} className="project-add-row">
                        <span className="project-name-small">
                          {project.title}
                        </span>
                        <div className="add-keyword-btns">
                          {analysis!.missingKeywords
                            .slice(0, 5)
                            .map((kw, ki) => (
                              <button
                                key={ki}
                                className="btn-keyword-add"
                                onClick={() => onAddToBullet(pi, kw)}
                              >
                                +{kw}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default JDAnalyzer;
