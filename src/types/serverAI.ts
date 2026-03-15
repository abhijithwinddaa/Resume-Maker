import type { ResumeData } from "./resume";
import type { ATSResult } from "../utils/aiService";

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
