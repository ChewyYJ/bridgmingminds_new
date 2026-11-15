// Headlines are supplied by the bounded, allowlisted RSS service. We do not
// scrape articles or present headline-based practice as a full article summary.
function urlKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.replace(/\/$/, "");
  } catch { return ""; }
}
function titleKey(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function selectDailyNews({ items, history = [], reserved = [], interests = [] }) {
  const excluded = [...reserved, ...history.flatMap((session) => [session.newsSource, session.articleSnapshot].filter(Boolean))];
  const urls = new Set(excluded.map((item) => urlKey(item.sourceUrl)).filter(Boolean));
  const titles = new Set(excluded.map((item) => titleKey(item.title)).filter(Boolean));
  const ids = new Set([...excluded.map((item) => item.id), ...history.map((session) => session.articleId)].filter(Boolean));
  const fresh = items.filter((item) => !ids.has(item.id) && !urls.has(urlKey(item.sourceUrl)) && !titles.has(titleKey(item.title)));
  const preferred = fresh.filter((item) => interests.some((interest) => interest.toLowerCase() === item.category.toLowerCase()));
  return (preferred.length ? preferred : fresh)[0] || null;
}
export function dailyNewsPrompt(story) {
  const questions = {
    Science: "What could this development change, and what would you want to find out next?",
    Technology: "Who might benefit from this development, and what concern should be considered?",
    Environment: "What response to this news would you support, and what trade-off would it involve?",
    Business: "Who could be most affected by this news, and how might they respond?",
  };
  return {
    id: `daily-${story.id}`,
    mode: "spin_speak",
    category: story.category,
    question: questions[story.category] || "Why might this story matter to people, and what is your view on it?",
    context: `Discuss this headline: ${story.title}\nSource: ${story.source}, published ${story.publishedAt}.\nSource scope: headline only. Full article details have not been supplied; do not assume them. Explain your view and one reason.`,
  };
}
