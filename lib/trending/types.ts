export type TrendingCandidate = {
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  sourceName: string;
};

export type TrendingTopic = {
  topic: string;
  category: string;
  source_title: string;
  source_url: string;
  published_at: string;
  source_name: string;
  style: "explainer" | "pros-cons" | "personal-experience";
};
