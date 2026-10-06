export interface LandingReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  reply?: string;
}

export interface LandingRating {
  average: number;
  count: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

export interface LandingStats {
  downloads: number;
  editSessions: number;
  atsScorings: number;
  resumesCreated: number;
  downloadUsers: number;
}

export interface LandingData {
  generatedAt: string;
  rating: LandingRating | null;
  reviews: LandingReview[];
  stats: LandingStats | null;
}
