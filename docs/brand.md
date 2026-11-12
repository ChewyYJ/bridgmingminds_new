# MindGarden identity

The original mark combines a rounded **M**, a growing leaf and a golden seed. It connects the app name with small, steady progress. Forest green, sage, gold and warm cream match the existing garden interface.

Use the single word **MindGarden** in app labels. The historical product requirements retain their original title; the local folder name and technical package slug do not affect the product name.

- `shared/brand.mjs` contains the vector paths and colours used by `MindGardenMark` in the native/web UI and the export script.
- `assets/mindgarden-mark.svg` is the editable standalone mark.
- `assets/mindgarden-lockup.svg` pairs it with the name; the wordmark uses Georgia with a serif fallback.
- `assets/mindgarden-icon.png` is the opaque 1024×1024 app icon and favicon source.
- `assets/mindgarden-adaptive.png` and `assets/mindgarden-monochrome.png` are transparent Android foreground assets with room for platform masks.

Run `node scripts/generate-brand.mjs` to regenerate the SVGs and PNGs. It uses the existing Playwright development dependency and installed Chrome; set `PLAYWRIGHT_CHANNEL` to another installed Playwright channel if needed. It renders the shared vector artwork locally without image-generation services or external requests.

The app config, onboarding, navigation, loading states and friend invitation copy use the new identity. Native launcher changes take effect in a rebuilt native app.
