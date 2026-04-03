import { supabase } from "../lib/supabase";
import type {
  PopularityCounterRow,
  PopularityMetricKey,
  PopularitySnapshot,
} from "../types/feedback";
import {
  buildPopularitySnapshot,
  emptyPopularitySnapshot,
} from "../types/feedback";

const COUNTERS_TABLE = "app_popularity_counters";

const COUNTER_COLUMNS = "feature_key, total_count, unique_users, updated_at";

export async function recordFeatureUsage(
  featureKey: PopularityMetricKey,
): Promise<void> {
  const { error } = await supabase.rpc("record_popularity_usage", {
    p_feature_key: featureKey,
  });

  if (error) {
    console.error("Error recording popularity usage:", error);
  }
}

export async function loadPopularitySnapshot(): Promise<PopularitySnapshot> {
  const { data, error } = await supabase
    .from(COUNTERS_TABLE)
    .select(COUNTER_COLUMNS);

  if (error) {
    console.error("Error loading popularity counters:", error);
    return emptyPopularitySnapshot();
  }

  return buildPopularitySnapshot((data || []) as PopularityCounterRow[]);
}

export function subscribeToPopularity(
  onChange: (snapshot: PopularitySnapshot) => void,
): () => void {
  const channel = supabase
    .channel("app-popularity-counters")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: COUNTERS_TABLE,
      },
      () => {
        void loadPopularitySnapshot().then(onChange);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void loadPopularitySnapshot().then(onChange);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
