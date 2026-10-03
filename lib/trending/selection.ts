import { isNearDuplicate } from "@/lib/trending/filters";
import { isSafeTopic } from "@/lib/trending/safety";
import type { Difficulty } from "@/lib/config/categories";
import type { TrendingTopic } from "@/lib/trending/types";

type SelectionOptions = {
  category: string;
  difficulty: Difficulty;
  recentTopics: string[];
  recentStyles: string[];
  curatedTopics: string[];
  trending: () => Promise<TrendingTopic[]>;
  random?: () => number;
};

function weightedChoice<T>(items: T[], weight: (item: T, index: number) => number, random: () => number): T | undefined {
  const weights = items.map((item, index) => Math.max(0.001, weight(item, index)));
  const total = weights.reduce((sum, item) => sum + item, 0);
  let roll = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return items[index];
  }
  return items.at(-1);
}

function unseenTopics(topics: TrendingTopic[], recentTopics: string[]) {
  return topics.filter((topic) => isSafeTopic(`${topic.topic} ${topic.source_title}`) && !recentTopics.some((recent) => isNearDuplicate(topic.topic, recent)));
}

export async function selectTopic(options: SelectionOptions) {
  const random = options.random ?? Math.random;
  try {
    const cachedTopics = await options.trending();
    const unseen = unseenTopics(cachedTopics, options.recentTopics);
    const recentStyleWindow = options.recentStyles.slice(0, 2);
    const varied = unseen.filter((topic) => !recentStyleWindow.includes(topic.style));
    const pool = varied.length > 0 ? varied : unseen;
    if (pool.length > 0) {
      const selected = weightedChoice(pool, (topic) => {
        const ageDays = Math.max(0, (Date.now() - Date.parse(topic.published_at)) / 86_400_000);
        return 1 / (1 + ageDays * 0.45);
      }, random);
      if (selected) return { ...selected, difficulty: options.difficulty, source: "trending" as const };
    }
  } catch {
    // Trending sources and model failures silently resolve to the curated list below.
  }

  const unseenClassic = options.curatedTopics.filter((topic) => !options.recentTopics.some((recent) => isNearDuplicate(topic, recent)));
  const classicPool = unseenClassic.length > 0 ? unseenClassic : options.curatedTopics;
  const topic = classicPool[Math.floor(random() * classicPool.length)] ?? "Share a thought about this topic.";
  return {
    topic,
    category: options.category,
    difficulty: options.difficulty,
    source: "classic" as const,
    source_title: "",
    source_url: "",
    published_at: "",
    source_name: "",
    style: "classic" as const,
  };
}
