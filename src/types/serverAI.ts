import type { ResumeData } from "./resume";
import type { ATSResult } from "../utils/aiService";
import type { DetectedStyle } from "../utils/templateDetector";

export type AnalyzeMode = "jd" | "self";

export interface AnalyzeATSRequest {
  resumeData: ResumeData;
  jobDescription?: string;
  mode: AnalyzeMode;
  cacheAllowed: boolean;
}

export interface AnalyzeATSResponse {
  atsResult: ATSResult;
  cached: boolean;
}

export interface RewriteResumeRequest {
  resumeData: ResumeData;
  jobDescription?: string;
  atsResult: ATSResult;
  iteration: number;
  mode: AnalyzeMode;
  cacheAllowed: boolean;
}

export interface RewriteResumeResponse {
  resumeData: ResumeData;
  cached: boolean;
}

export interface ParseResumeRequest {
  resumeText: string;
  extractedLinks?: string[];
  cacheAllowed: boolean;
}

export interface ParseResumeResponse {
  resumeData: ResumeData;
  cached: boolean;
}

export interface DetectTemplateRequest {
  resumeText: string;
  cacheAllowed: boolean;
}

export interface DetectTemplateResponse {
  detectedStyle: DetectedStyle;
  cached: boolean;
}

export interface GenerateCoverLetterRequest {
  resumeText: string;
  jobDescription: string;
  companyName: string;
  position: string;
  cacheAllowed: boolean;
}

export interface GenerateCoverLetterResponse {
  content: string;
  cached: boolean;
}
