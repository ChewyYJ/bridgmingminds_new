# Historical: MindGarden practice and garden loop

This document describes the retired garden design. The active app now uses Coins, avatar care and Debate Street. See [the current economy](gamification-economy-v1.md) and [Role 3 implementation](role3-implementation.md) for current behavior. Garden transactions return HTTP 410; legacy balances and history are retained for migration and export.

This is a small, testable product design, not evidence that gamification improves learning or retention. The garden makes participation visible. GROW feedback supplies a specific idea to revisit. Neither garden rewards nor the weekly intention claims to measure ability.

## First visit and return

- A new member starts with one seed and two water drops. Fern, cactus, daisy, and their own drawings are available immediately. The first practice is short and offers writing or recording.
- Home prioritizes a server-saved unfinished response or an evaluation needing recovery. A submitted response is kept when evaluation fails. Text drafts and unfinished debate sessions saved only on the device can be reopened through their activity in Play; they are not listed as pending attempts on Home.
- After a successful practice that day, Home says “Today’s practice is done” and offers the garden. The other activities remain available without a requirement to complete them.
- On a later day, Home offers the latest reflection’s actual retry prompt and a linked retry. The previous response is preserved. Profile also links back to the latest reflection.
- The weekly intention is three practice days, Monday–Sunday in the profile timezone. Any successful practice, including a retry, counts once for its calendar day. Days need not be consecutive. Extra practices remain available; they do not add extra days to the weekly count.
- A new week resets the weekly intention without removing resources or XP. There is no weekly currency bonus or penalty. Active plants have a separate 48-hour care cycle; archiving a living plant pauses its timer for a break.

## Resources and visible progression

Practice rewards are unchanged. Garden resources now also support ongoing care and replanting:

| Resource | Use                                                                         | Eligible practice rewards                                             |
| -------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Seeds    | One seed plants an available variety or drawing, or replants a dead plant   | One per eligible first session completion                             |
| Water    | One drop renews 48-hour care and advances growth, up to the final stage      | Two per eligible first completion                                     |
| Sunlight | Optional decorations: stepping stones cost two, birdbath costs three        | Two per eligible session retry                                        |
| XP       | Permanently unlocks varieties; never spent when planting                    | Twenty per eligible first completion, five per eligible session retry |

Each daily activity quest additionally grants one water, one sunlight, and ten XP on its first completion. The Home list shows that entire bonus and explicitly invites people to pick one; completing all four is optional. Ratings never change these rewards. Daily caps and per-session/content deduplication restrict currency, not access to practice. See the server reward ledger for the eligibility rules.

Garden shows the next actual unlock, progress and XP remaining:

| Total XP | New varieties                 |
| -------- | ----------------------------- |
| 0        | Fern, cactus, daisy, drawings |
| 30       | Monstera, sunflower           |
| 60       | Bamboo, lavender              |
| 90       | Tulip                         |

At 90 XP the card says every current variety is unlocked; it does not promise an additional level. Each newly unlocked plant still costs one seed. Local pattern feedback earns the same participation rewards, while its uncalibrated levels remain excluded from skill charts. Charts and retry comparisons must use matching mode, prompt, provider, rubric, model, and coaching-template versions.

## Plant care and reuse

- Every new plant or drawing starts with 48 hours of care. After 24 hours without watering it shows **Needs water**; at 48 hours it is **Dead**. These are elapsed hours, independent of midnight and the weekly practice goal.
- Watering a living plant costs one water and renews its full 48 hours. It advances growth by one stage until stage three. Fully grown plants still need water; watering them preserves stage three. A dead plant cannot be revived by watering.
- **Archive** moves a living plant out of the twelve active spaces for free. It retains the species or drawing, growth and remaining care time. The timer pauses while archived, so people can take a break without losing that plant.
- **Return to garden** restores an archived plant into an available space for free. Its remaining care resumes; restoration does not refill the timer. Placement still obeys island bounds and spacing. Archiving and restoring neither grant nor spend practice rewards.
- A dead plant remains visible until the member chooses **Clear** for free or **Replant · 1 seed**. Replanting keeps its species or drawing and position, starts a new plant at stage zero, and grants a fresh 48 hours. Other plants, resources and XP remain intact.
- Existing plants without a care deadline receive a persisted, full 48-hour grace period when first loaded after the update. Reopening the app does not repeatedly renew this deadline.
- Home renders the member's actual active plants, drawings, positions, growth, decorations and care states. Archived plants are absent from that preview until restored.

## Known limits for a pilot

The first eligible completion with its daily quest yields 30 XP, enough for the first unlock and three water. The first completion of each of the three modes can unlock the whole current catalog at 90 XP. Their sunlight, plus a first eligible retry’s quest, can purchase both visible decorations. This makes early progress reachable but leaves little later cosmetic progression.

The meadow contains twelve active spaces. Archiving now frees space for another plant, and dead plants can be cleared or replanted. The variety catalogue and two decorations still unlock quickly; these lifecycle actions do not add later cosmetic rewards.

Retry eligibility currently relies on linked sessions and ledger limits, not a validated judgment of reflection. An unchanged response can still qualify for some retry or daily quest rewards. A future safeguard could withhold an additional reflection bonus for an exactly repeated normalized response while leaving practice available. It should never require a higher GROW rating or agreement with a particular viewpoint. The UI calls these “ideas revisited,” not a verified improvement in thinking.

Care currently relies on checking Home or Garden; there are no watering push notifications. The flexible three-day practice goal does not itself guarantee watering before every 48-hour deadline. Archiving is the pause option. Pilot feedback should establish whether this care cycle feels enjoyable or pressuring before adding further retention mechanics.

## Design hypotheses to evaluate

1. A specific saved next step makes a return visit easier than a generic new-practice button.
2. A flexible three-day intention is less pressuring than a daily streak or a four-task checklist.
3. Clearly showing the next reachable unlock helps people understand how practice changes their garden.
4. Linked revisions are more useful than repeating a prompt only to collect resources.

Evaluate these hypotheses with a small, opt-in pilot rather than treating more sessions as proof of learning. Useful measures include first-practice completion, return on a second distinct day, three distinct practice days within a week, recovery of saved attempts, use of a feedback-linked retry, and revisiting a saved reflection. Inspect whether revisions actually differ and ask participants whether feedback helped them express an idea; do not infer improvement solely from ratings or time in the app. Track whether members understand the care deadline, archive before a break, and recover after a plant dies. Ask whether care and the weekly intention felt helpful or pressuring. Any analytics collection should follow the member’s consent setting and avoid collecting raw response or recording content for retention analysis.
