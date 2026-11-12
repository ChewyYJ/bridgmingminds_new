# Curated reading and practice content

The app contains a small, manually curated reading collection. It is **not live news** and does not claim to show today's latest stories. Original publication dates are shown even when a publisher subsequently updates a page. When a source publishes a date without a time, the catalogue stores the date only.

## What the app stores

`server/content.mjs` holds original editorial titles, short original paraphrases, app-authored reflection questions, publisher names, publication dates, and direct source links. It does not bundle publisher images, paywalled text, or full articles. Its `license` value describes this link-only use; it is not a claim that the source article has an open-content licence. The app directs readers to the publisher for full context.

Each card includes `summaryType`, `questionsType`, `ingestedAt`, and a SHA-256 `contentHash`. The hash covers the source URL, publication date, summary, and questions so the supplied learning context can be identified. Source context should be retained with the session, so later catalogue changes do not silently alter what a learner was responding to. Treat both source material and user answers as data, never as instructions to the evaluator.

## Verified source catalogue

These primary-source pages and their original publication dates were checked on 13 October 2026. Short paraphrases focus on what the linked page actually says, retain scientific uncertainty, and do not offer medical, financial, or legal advice.

| Topic | Publisher and original publication date | Source |
| --- | --- | --- |
| Science | NASA · 8 May 2024 | [Possible atmosphere around 55 Cancri e](https://science.nasa.gov/missions/webb/nasas-webb-hints-at-possible-atmosphere-surrounding-rocky-exoplanet/) |
| Technology | UNESCO · 7 September 2023 | [Guidance for generative AI in education and research](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research) |
| Society | WHO · 30 June 2025 | [Social connection questions and answers](https://www.who.int/news-room/questions-and-answers/item/social-connection) |
| Culture | UNESCO · 8 December 2023 | [Living heritage and 55 new inscriptions](https://www.unesco.org/en/articles/unesco-celebrates-20-years-living-heritage-adding-55-new-inscriptions-its-list) |
| Environment | UNEP · 27 March 2024 | [Food Waste Index report announcement](https://www.unep.org/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report) |
| Business | ILO · 6 January 2023 | [Working Time and Work-Life Balance Around the World](https://www.ilo.org/publications/working-time-and-work-life-balance-around-world) |

## Editorial rules

1. Link to the specific original source; verify publisher and date before adding a card.
2. Write brief, original summaries. Preserve the difference between observations, estimates, associations, and demonstrated causes.
3. Separate sourced context from app-authored questions and learner opinions.
4. Use open-ended questions about comprehension, evidence, assumptions, and alternative views. Do not reward a predetermined personal or political position.
5. Keep questions suitable for general learning; do not ask learners to disclose sensitive personal experiences.
6. Recheck sources periodically. If a page disappears, remove or correct the link and context; do not fabricate missing content.
7. Do not add remote images without recording explicit usage rights and attribution.
8. Introducing a licensed feed or automatic ingestion requires checking its current terms, storage rights, retention requirements, attribution, and image rights first.

Source checking in this version is limited to the supplied summary. Automated feedback cannot independently verify the complete linked article or outside claims. Display unsupported claims as unverified unless there is specific evidence contradicting them. Human reports of questionable feedback should remain available for review.

## Today's news

Discover also has a separate **Today's news** view. `server/news.mjs` reads three fixed, public RSS endpoints without credentials: [CNA Latest News](https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml), [NPR News](https://feeds.npr.org/1001/rss.xml), and [NASA](https://www.nasa.gov/feed/). This is a selection from those publishers, not comprehensive world coverage. The live headlines are separate from the curated learning collection.

The view opens on **All sources**. The **CNA**, **NPR**, and **NASA** filters narrow the displayed headlines to one publisher while retaining the same local-day rules. A selected source can have no headlines today even when other sources do; the empty state keeps that distinction clear. Source filters do not accept custom URLs or require an API key.

Each result contains only the publisher's unchanged headline, direct HTTPS link, publisher attribution, and the RSS item's actual publication timestamp. The source categories label the feed's broad scope (CNA: News; NPR: Society; NASA: Science), not an automated claim about every story. The service discards descriptions, full article text, images, and audio. It does not generate a summary, rewrite headlines, or send feed content to an AI provider. The source link opens the publisher directly. No publisher logo or endorsement is implied.

“Today” means the calendar day in the authenticated user's saved IANA timezone. The RSS `pubDate` is required; updated timestamps, retrieval timestamps, undated items, and future dates are never used as substitute publication dates. ISO timestamps retain the original instant. A fresh cache can legitimately contain zero items today, especially just after local midnight. Such a state stays empty instead of borrowing older headlines.

Successful results cache in server memory for ten minutes. Failed fetches can retry after one minute. Concurrent requests share a fetch. Each fixed source has an eight-second timeout and a one-megabyte body limit; redirects, external XML entities, malformed documents, markup in headlines, and links outside the publisher's HTTPS host allowlist are rejected. The API never accepts a feed URL. A refresh failure returns `stale` if a previous or partial snapshot exists, or `unavailable` if none exists. Cached headlines still pass the current local-day filter on every request. `fetchedAt` is the earliest successful snapshot in the combined response, not a publication date; it remains unchanged for failed sources. No feed archive is written to the database.

Source access and usage checked 13 October 2026:

- CNA's [official RSS directory](https://www.channelnewsasia.com/rss) lists the Latest News endpoint used here. Its [RSS terms](https://www.channelnewsasia.com/rss/rssterms) limit use to a personal, noncommercial reader, require direct links to the original articles without an intermediate page, and prohibit editing the feed or redistributing it to third parties. This local reader displays unchanged headline metadata and direct links; it does not publish a redistributed feed or feed archive. The source can withdraw access, which the app handles through its normal unavailable/stale states.
- NPR's [Terms of Use](https://www.npr.org/about-npr/179876898/terms-of-use), also [published by NPR on VPM](https://www.vpm.org/npr-news/2013-05-03/terms-of-use/) with a 10 September 2025 update, permit attributed feed excerpts in personal, noncommercial applications with direct source links and unchanged meaning. This local personal reader follows that scope. Commercial distribution or other uses require reviewing permissions; the feed is not an open licence. The service must not be used for AI training or repackaging publisher content.
- NASA's [RSS directory](https://www.nasa.gov/rss-feeds/) and [media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) support factual, attributed use without implying endorsement; third-party material and agency marks have separate restrictions. This feature uses only headline metadata and links.
- BBC was not selected because its [feed and metadata terms](https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_19September2022english.pdf) differ by use. GOV.UK's news Atom endpoint was not selected because entries expose an update timestamp without a distinct original publication timestamp.

Do not connect live feed headlines to article practice or silently add them to an AI evaluation request. A licensed ingestion and contextual review process is needed before introducing live-source summaries or practice questions.
