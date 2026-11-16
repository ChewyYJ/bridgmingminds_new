# BridgingMinds UX direction — November 2026

This is a design proposal based on repository and screenshot review, not user-tested findings. It changes no application code, prices, ownership rules, rewards or saved data. Preserve the upstream speaking, reading, BRIDGE feedback, thought-map, vocabulary and friend-conversation features.

Generated concepts: [main tabs](../artifacts/ux-direction/main-tabs-final.png) and [debate and care](../artifacts/ux-direction/debate-care-final.png). These are illustrative concepts, not production screens. Example balances, learning progress and content are not evidence of working behavior or validation.

The current interface makes feature boundaries more visible than the learning journey. Home places a dominant **My avatar** action before learning; the speaking challenge falls below the first mobile view. Play duplicates the dedicated Debate destination. “Read & Reflect” means both article-based response and vocabulary recall/use. Profile opens wardrobe, with Dictionary and learning history reached through Progress.

In the reviewed mobile match, the written answer begins around 900 pixels down while all five navigation tabs remain active. The decorative scene and separate speaking controls compete with the actual response. Wardrobe presents three overlapping selection systems: category icons, Outfit/Accessory/Style tabs, and All/Owned/Locked filters. Its preview, ownership and equipment states are real and distinct, but their explanation appears far below the avatar. Food animates eating immediately when a meal is selected, before purchase; the small preview label does not clearly separate browsing from serving.

| Tab | Purpose and first action |
| --- | --- |
| Home | Answer “What next?” Resume unfinished work or recommend one daily activity. Show both daily completions and a compact companion. |
| Play | Choose a skill: speaking, reading aloud or word review. Lead with a relevant suggestion; retain access to all practice. |
| Discover | Choose context. Separate **Practice reads** from **Today’s news**, then offer category filters within each. |
| Debate | Find street opponents, the Singapore Civic Cup, friend conversations and debate history. |
| Profile | Keep **Avatar** as the default, honoring the requested avatar focus. Add a clear **Avatar / Progress** segment; Progress contains Dictionary and history. Keep settings accessible. |

Use **Read aloud**, **Read & respond** and **Word review** consistently for the three different activities. Existing internal identifiers can remain unchanged. Preserve friend conversations’ explicit lack of AI scores and Coin rewards.

The proposed loop is **Discover, optionally → plan ideas → speak/write → one strength and one next step → completion and receipts → optional word review or clothes → Home**. This is a connected opportunity, not a mandatory sequence before every daily practice.

Practice reads should offer one primary **Respond to this idea** action. Choose a question once and carry its source context forward. News currently opens publisher pages; curated reads provide bounded summaries. Keep that distinction visible. An article-to-debate link requires a supported motion and an explicit handoff; the current debate service cannot accept arbitrary articles as tournament topics.

Before responding, label the learner’s workspace **My plan**: point, reason, example and optional other view. After responding, label the evidence-based view **Your thought map**, distinguishing what was said, what remained in planning notes and suggested gaps. Do not present an AI interpretation as the learner’s original plan.

At first feedback, show the saved completion status and authoritative reward receipt immediately. Optional guiding questions, sample scripts and word selection must not delay apparent completion. Present one strength and one next step; make the BRIDGE details, map and transcript available on request. This applies progressive disclosure without removing frequently needed actions. [Nielsen Norman Group’s explanation](https://www.nngroup.com/articles/progressive-disclosure/) supports prioritizing important choices and making secondary options clearly discoverable; it does not validate this particular design.

Offer one targeted follow-up, then optional sample wording and deliberate vocabulary selection. Saved words return through recall and contextual use, and through future eligible reading assignments; do not rewrite an already assigned passage. Finish with a named destination such as **Review saved words**, **Continue today’s challenge** or **Done for now**.

During a match, use a focused layout with **Save & leave** instead of active global tabs. The action must await persistence of the latest owner-scoped draft and verify success before leaving. Distinguish a draft saved on this device from submitted turns saved by the server; surface failures without discarding text. The current debounced draft writer alone is not proof that an immediate exit is safe.

Place **Record / Write** in one response panel beneath a compact motion and opponent summary. Keep the latest opponent argument close to the input; collapse earlier turns. The timer stays optional. Local rule-based practice remains explicitly unscored, while Victory requires a validated judge result. Show actual reward receipts and daily-limit reasons; no simulated wins, countdowns or leaderboards.

In wardrobe, replace overlapping navigation with one labelled category selector and a secondary ownership filter. Preserve both gender collections and their separate items. Show **Preview—not equipped**, **Owned** and **Equipped** distinctly. Buying adds ownership; only **Equip look** changes the saved outfit. Keep confirmation, remaining balance, retry-safe receipts and restore-equipped behavior.

Lead with earned progress. For example, the current 280-Coin Soft cardigan can also unlock after two eligible debate completions. Show actual server progress and eligibility, not a fabricated estimate. Prices span 120–400 Coins: at five daily Coins alone, that is 24–80 earning days before spending, excluding bonuses and other activities. Both daily activities yield five Coins; buying a five-Coin meal every day leaves no savings from that base. This arithmetic motivates clearer choices, not a price change.

Care remains optional. Do not automatically promote buying food after learning. Keep the avatar idle while browsing; animate the selected meal after a successful purchase receipt. An explicit **Preview animation** control may demonstrate eating, clearly labelled as a preview without changing balance or fullness. Retain care preferences, fullness limits and reduced-motion behavior.

Use warm neutral surfaces, consistent typography and restrained pixel art. Aim for 44–48 logical-pixel touch targets, readable 14–16 labels and metadata at least 12; test text scaling and keyboard access. The 44–48 target is our higher design goal: WCAG 2.2 AA’s target-size minimum is 24×24 CSS pixels with specified exceptions, not 44. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) explains the distinction. Measure text contrast in actual states; a beige palette is not automatically accessible. On desktop, cap content width and use purposeful two-column layouts rather than stretching buttons across the window.

Implementation priority: first clarify names, completion and saved/preview states; next focus match input and simplify wardrobe/care; then connect Discover, planning and follow-up while preserving source boundaries. Validate changes before expanding the visual treatment.

Proposed usability tasks and measures, with no results yet:

1. Start or resume today’s practice: first-click accuracy, time to begin and wrong-tab visits.
2. Read a summary and respond: source understanding, question reselection and ability to find the plan.
3. Submit a match turn, leave and resume: input discovery time, accidental exits and recovered draft accuracy.
4. Preview, cancel, buy and equip a garment: ownership-state understanding, unintended purchases/equips and duplicate charges.
5. Finish feedback, save/review a word and consider food: recognition that learning is complete, return-path success and understanding of preview, cost and optional care.

Compare task outcomes with the current interface, include mobile and accessibility needs, and report observations rather than claiming improvement from concept images alone.
