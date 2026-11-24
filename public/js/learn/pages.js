// The learning pages, for the router (titles and descriptions) and the build
// (static HTML, sitemap, offline cache). Each page's view is views/<slug>.js.
export const LEARN_PAGES = [
  { slug: "progress", title: "Your progress", heading: "How you're doing",
    description: "Your drishi progress: streak, this week's practice, mastery for every roadmap stage, weakest topics and reviews due. Saved on your device, no account." },
  { slug: "plan", title: "GATE CS study planner", heading: "Your plan to exam day",
    description: "A free day by day GATE CS study plan to your exam date: topics in order, weak topics first, the last fifth kept for mocks and revision. Replans if you fall behind." },
  { slug: "review", title: "Spaced repetition reviews", heading: "Quick reviews",
    description: "Quick spaced repetition reviews of the GATE topics you've mastered: two questions per topic after 2, 7, 21 and 45 days, so what you learn sticks." },
  { slug: "mistakes", title: "Mistake notebook", heading: "Your mistakes",
    description: "Every GATE practice question you got wrong, rebuilt exactly, with a retry, the worked solution and a step by step replay. Mark each one as understood." },
  { slug: "mock", title: "GATE CS mock tests", heading: "Timed tests, marked the GATE way",
    description: "Free timed GATE CS mock tests: 30 minute stage tests and a full 65 question, 3 hour mock with GATE marking, a question palette and a score report by topic." },
  { slug: "diagnostic", title: "GATE CS diagnostic test", heading: "Find out what you already know",
    description: "A free 20 question GATE CS diagnostic across every subject: see what you already know and where to start in the GATE CS roadmap." },
];
