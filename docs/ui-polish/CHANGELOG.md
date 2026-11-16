# UI polish checkpoint

This branch is a reviewable checkpoint, not a declaration that the full production-readiness goal is complete. The original [audit and plan](AUDIT.md) retain the remaining scope.

## Changes

- Warm paper and charcoal light/dark themes with a device-following or saved appearance preference. Changing appearance preserves unsaved inputs.
- Shared buttons, fields, cards, focus rings and selected/busy states; larger touch targets and accessible loading indicators. Existing DM Sans, Lora and Feather assets remain in use.
- Clearer onboarding, Home hierarchy, streak badge and navigation. Responsive layouts retain the avatar, Coins and all learning destinations.
- Practice debate motions are fixed before the random position roll. Five-minute preparation, drafts, refresh recovery and tournament behaviour are preserved.
- Friendly unknown-route and load-failure recovery, descriptive page titles and metadata, reduced-motion-aware loading and transitions.
- Deferred workspace loading, full-glyph WOFF2 web fonts and public-asset compression. Native fonts remain unchanged. Private recordings and API responses stay outside static asset serving.
- Browser onboarding selectors now use the current “Start learning” action. Further outdated journey assertions still need repair.

## Verification at this checkpoint

| Check | Evidence |
| --- | --- |
| Backend | 403 passed, 3 optional cloud tests skipped, 0 failed; includes static compression/private-file boundary coverage |
| Focused browser checks | 16 passed in the latest 17-test run; the desktop dark-mode capture timed out and passed on its isolated rerun |
| Focused scope | Appearance persistence, unsaved fields, keyboard focus, six main destinations at three widths in both themes, route recovery, randomized debate preparation, planning notes/mind maps and reduced motion |
| Axe | 30 screen/theme scans passed, 0 recorded runtime warnings; see `after/axe.json` |
| Lint, TypeScript, web export | Passed; repeated before pushing |
| Local preview | Restarted on port 8081; welcome rendered without runtime errors |
| Lighthouse welcome | Performance 97, Accessibility 100, Best Practices 96 |
| Lighthouse authenticated Home | Performance 60, Accessibility 100, Best Practices 100; performance remains below the requested target |

Lighthouse scores are local mobile-throttled measurements, not deployment guarantees. The Home measurement ran alongside a small browser check and needs an isolated repeat, followed by further work if still below target. Exact metrics and timestamps are in `after/lighthouse-summary.json`. The earlier Home run scored 70, so the performance target is not claimed achieved.

The baseline full browser suite had 34 failures from obsolete garden and self-review journeys. Current focused checks do not substitute for repairing and rerunning that full suite. Exhaustive edge-case verification, native device checks, remaining oversized component cleanup and the final documentation audit are still pending.

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Mobile Home | [Before](before/home-375-light.png) | [Light](after/home-375-light.png), [Dark](after/home-375-dark.png) |
| Tablet Home | [Before](before/home-768-light.png) | [Light](after/home-768-light.png), [Dark](after/home-768-dark.png) |
| Desktop Home | [Before](before/home-1440-light.png) | [Light](after/home-1440-light.png), [Dark](after/home-1440-dark.png) |
| Mobile Discover | [Before](before/discover-375-light.png) | [Light](after/discover-375-light.png), [Dark](after/discover-375-dark.png) |
| Settings | [Before](before/settings-375-light.png) | [Light](after/settings-375-light.png), [Dark](after/settings-375-dark.png) |

The `after/` folder also includes Play, Profile and Debate at 375, 768 and 1440 px, plus onboarding and debate preparation in both themes. These are actual rendered captures.

## Deliberately unchanged

Scoring, rewards, streak rules, provider fallbacks, authentication contracts and private recording retention remain unchanged. Legacy garden data is retained; existing garden/homeland route aliases still open Debate. Expected anonymous API authentication responses remain visible in the network log. Optional provider configuration and live-provider/device validation are separate from visual verification.
