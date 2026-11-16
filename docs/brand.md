# BridgingMinds identity

The approved mark is the user's charcoal rounded M / speech bubble, with a muted gold bar and a shorter charcoal bar below it. Use **BridgingMinds** as the product name.

The exact transparent attachment is preserved at `assets/brand/approved-logo-source.png` (SHA-256 `cdcbc7b2108ebcf7db75953e63085c9f561de33bebefd2d83d4f567851399c8f`). No AI redraw or colour change is applied to the main mark.

- `shared/brand.mjs` records original dimensions, display framing and brand colours.
- `BridgingMindsMark` in `src/components/art.tsx` renders that original PNG through an SVG viewBox. This removes the supplied canvas's empty margins at display time, keeping the full emblem readable in the header, onboarding and loading/error states.
- `assets/brand/bridgingminds-mark.png` is the framed transparent mark.
- `assets/brand/bridgingminds-icon.png` is an opaque 1024-square app icon on the app's cream background; `bridgingminds-favicon.png` has tighter framing for small browser tabs.
- `bridgingminds-adaptive.png` and `bridgingminds-monochrome.png` are transparent Android foreground variants with a centred 576-square safe area. Monochrome preserves the silhouette and alpha for Android's themed tint.
- `bridgingminds-lockup.png` is a standalone export with the product name; the live app retains its native accessible text wordmark.

Run `node scripts/generate-brand.mjs` from the repository root to export the platform canvases. It uses the existing Playwright dependency and Edge; set `AVATAR_BROWSER_PATH` or `PLAYWRIGHT_CHANNEL` for another installed browser. The original source pixels remain untouched; the export script only frames, scales and packages them. It also produces SVG wrappers with embedded artwork, not newly traced vector paths.

The previous leaf mark and generated brand explorations remain as historical files and are no longer referenced by the app's brand component or icon configuration. The technical app slug, bundle IDs and deep-link scheme remain unchanged so existing installations retain their identity. Native launcher icons update in a new native build; web updates are included in the next export/deployment. No separate native splash-screen plugin is currently configured.
