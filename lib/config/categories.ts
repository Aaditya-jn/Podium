export type Difficulty = "easy" | "medium" | "hard";

export type Category = {
  id: string;
  name: string;
  description: string;
  icon: string;
  topics: Record<Difficulty, string[]>;
};

export const difficulties: { id: Difficulty; name: string; hint: string }[] = [
  { id: "easy", name: "Easy", hint: "A relaxed warm-up" },
  { id: "medium", name: "Medium", hint: "A thoughtful challenge" },
  { id: "hard", name: "Hard", hint: "Go a little deeper" },
];

export const categories: Category[] = [
  {
    id: "everyday-life",
    name: "Everyday life",
    description: "The little things that make a day",
    icon: "☀",
    topics: {
      easy: [
        "Describe a meal you really enjoy.",
        "What does your ideal morning look like?",
        "Talk about a place where you feel at ease.",
        "What is one small thing that always makes you smile?",
        "Describe your favorite way to spend a free afternoon.",
        "What is something useful you learned recently?",
        "Tell us about a song you never get tired of.",
        "What is your favorite season, and why?",
      ],
      medium: [
        "How has your daily routine changed over the last few years?",
        "What makes a neighborhood feel like a community?",
        "Describe a time a small act of kindness stayed with you.",
        "What everyday habit would you like to improve?",
        "How do you decide what deserves your attention each day?",
        "What object in your home tells an interesting story?",
        "When does convenience make life better, and when does it get in the way?",
        "What does a balanced week look like for you?",
      ],
      hard: [
        "Has modern convenience made people more connected or more isolated?",
        "What should a city prioritize to make daily life better for everyone?",
        "How much of a person's identity is shaped by routine?",
        "Is a slower pace of life a privilege or a choice?",
        "When should personal comfort give way to community responsibility?",
        "How might our idea of a good life change across generations?",
        "Can ordinary routines be a meaningful source of creativity?",
        "What do our daily habits reveal about our values?",
      ],
    },
  },
  {
    id: "career-workplace",
    name: "Career & workplace",
    description: "Ideas for doing meaningful work",
    icon: "↗",
    topics: {
      easy: [
        "What kind of work would you enjoy doing?",
        "Describe a skill you use often.",
        "What makes a good teammate?",
        "Talk about a project you felt proud to finish.",
        "What helps you stay focused at work or school?",
        "Describe your ideal workspace.",
        "What is one goal you have for this year?",
        "What does a helpful manager do?",
      ],
      medium: [
        "How should a team handle a disagreement about priorities?",
        "Which matters more early in a career: breadth or specialization?",
        "How can people give feedback that is honest and kind?",
        "What makes a meeting worth everyone's time?",
        "How should employers support learning on the job?",
        "Describe a time you adapted when a plan changed.",
        "What makes a workplace feel inclusive in practice?",
        "How do you decide when a task is finished?",
      ],
      hard: [
        "Should companies prioritize employee wellbeing when it conflicts with short-term output?",
        "How might AI change what entry-level work teaches people?",
        "Is leadership primarily about making decisions or creating conditions for others?",
        "How should organizations balance transparency with confidentiality?",
        "What obligations do employers have to workers displaced by automation?",
        "Does remote work strengthen or weaken professional opportunity?",
        "When is persistence valuable, and when does it become resistance to change?",
        "How should success at work be measured beyond productivity?",
      ],
    },
  },
  {
    id: "technology-ai",
    name: "Technology & AI",
    description: "Tools shaping the way we live",
    icon: "✳",
    topics: {
      easy: [
        "Which app do you use most often, and what do you like about it?",
        "What piece of technology would be hard for you to give up?",
        "Describe a useful feature you wish your phone had.",
        "How do you use technology to learn something new?",
        "What is a technology you would like to try?",
        "When do you prefer a conversation without screens?",
        "Talk about a website that saves you time.",
        "How has technology changed one thing you do every day?",
      ],
      medium: [
        "What makes an online source trustworthy?",
        "How should people protect their attention in a connected world?",
        "Where could AI be most useful in education?",
        "What should a good digital privacy setting explain clearly?",
        "How can technology make public services easier to use?",
        "When should a person choose a human expert over an automated tool?",
        "What responsibilities do designers have when building addictive products?",
        "How can someone keep learning as technology changes?",
      ],
      hard: [
        "Who should be accountable when an AI system makes a consequential mistake?",
        "Should advanced AI development be regulated like other high-impact industries?",
        "How can society share the benefits of automation fairly?",
        "Can personal privacy survive when data is the price of convenience?",
        "What evidence should be required before deploying AI in public services?",
        "Does access to AI narrow or widen educational inequality?",
        "How should creators be compensated when AI systems learn from their work?",
        "What human abilities become more valuable as machines improve?",
      ],
    },
  },
  {
    id: "society-ideas",
    name: "Society & ideas",
    description: "Questions worth thinking through",
    icon: "◎",
    topics: {
      easy: [
        "What is a tradition you would like more people to know about?",
        "What makes someone a good neighbor?",
        "Describe a book, film, or story that changed your perspective.",
        "What is one thing you wish you had learned in school?",
        "How can people make a new person feel welcome?",
        "What place in your town deserves more attention?",
        "What is a rule that makes life easier for everyone?",
        "Name a skill that every young person should learn.",
      ],
      medium: [
        "How can communities preserve traditions while welcoming change?",
        "What does it mean to be a responsible citizen today?",
        "Should schools spend more time teaching practical life skills?",
        "How can people discuss difficult topics without talking past each other?",
        "What makes a public space feel welcoming to different people?",
        "How should a community decide which local problem to tackle first?",
        "Why do stories matter in shaping how we understand other people?",
        "What is the difference between equal treatment and fair treatment?",
      ],
      hard: [
        "When should individual freedom be limited for the common good?",
        "How can a society distinguish healthy disagreement from harmful misinformation?",
        "What responsibilities do wealthy societies have toward future generations?",
        "Can a society value both merit and equal opportunity without contradiction?",
        "How should communities weigh economic growth against environmental costs?",
        "Is social trust built more by shared institutions or by personal relationships?",
        "What does a fair response to historical injustice require?",
        "How should democracies make decisions when evidence is uncertain?",
      ],
    },
  },
  {
    id: "interview-prep",
    name: "Interview prep",
    description: "Practice answering with confidence",
    icon: "▤",
    topics: {
      easy: [
        "Tell me a little about yourself.",
        "What is one strength you bring to a team?",
        "What interests you about this role or field?",
        "What is something you are proud to have learned?",
        "How do you like to organize your work?",
        "What kind of team helps you do your best work?",
        "What is a goal you are working toward?",
        "What questions would you ask a potential teammate?",
      ],
      medium: [
        "Tell me about a time you solved a problem with limited information.",
        "Describe a piece of feedback that helped you improve.",
        "How do you respond when several deadlines compete?",
        "Tell me about a time you had to learn something quickly.",
        "Describe a disagreement on a team and how you handled it.",
        "What is a project that did not go as planned, and what did you learn?",
        "How do you explain a complex idea to someone new to it?",
        "What would you hope to accomplish in your first few months?",
      ],
      hard: [
        "Tell me about a decision you made that was unpopular but necessary.",
        "Describe a time you changed your mind after seeing new evidence.",
        "What would you do if you believed a project goal was unrealistic?",
        "Tell me about a failure that changed how you approach your work.",
        "How would you balance speed and quality under a tight deadline?",
        "Describe a situation where you had to influence without authority.",
        "What is a tradeoff you would make differently with hindsight?",
        "How would you approach a role where success is initially ambiguous?",
      ],
    },
  },
];

export function getCategory(id: string) {
  return categories.find((category) => category.id === id);
}
