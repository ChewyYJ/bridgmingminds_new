# Vercel deployment

Live app: https://bridgingminds-tau.vercel.app

BridgingMinds runs its Expo web export and Express API on Vercel, with persistent PostgreSQL data and private recordings in Supabase. The active Vercel project is `bridgingminds` in `zhuwys-projects-37451b1d`. Deploy from this application directory, not the parent Git repository.

## Runtime and persistence

- `vercel.json` builds `dist` with Node 24, serves the web app through the SPA fallback, and routes `/api/*` and `/health` to `api/index.mjs`. Functions run in Singapore (`sin1`) with a 300-second limit.
- Supabase PostgreSQL stores accounts, authentication sessions, practice, gardens, friends, usage, and evaluation jobs in the private `mindgarden` schema. Authentication is the application's existing password/session implementation; Supabase Auth is not used.
- Database and storage initialization starts during the first invocation and retries safely after a failed start. Warm instances share a two-connection pool; the Vercel pool hook closes idle connections before suspension. Writes are never automatically replayed.
- Database connections verify TLS certificates. The bundled public Supabase CA in `server/certs/` is included in the function. Migrations in `supabase/migrations/` use checksums, a transaction, and an advisory lock; apply them before deploying code that needs a new schema.
- Evaluation jobs persist in PostgreSQL. In production, polling `/api/jobs/:id` awaits the work; leases prevent concurrent instances from evaluating the same job. No background timer is required after a request returns.
- Recordings use the private Supabase `recordings` bucket. Browsers upload with short-lived signed capabilities; the API verifies ownership, consent, size, and format before accepting an upload. Playback remains private. Local SQLite and audio files are not uploaded or migrated automatically.

## Environment

Configure production values in Vercel's protected environment settings. Never put server credentials in an `EXPO_PUBLIC_` variable.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_URL` | Supabase PostgreSQL connection, using its pooler for functions |
| `SUPABASE_URL` | Supabase project endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only private storage access |
| `OPENAI_API_KEY` | Server-only AI credential; omitting it enables local coaching |
| `OPENAI_MODEL` | Supported text model override |
| `OPENAI_TRANSCRIPTION_MODEL` | Supported transcription model override |
| `AUDIO_SIGNING_SECRET` | Stable secret shared by all function instances |
| `CRON_SECRET` | Authentication for scheduled maintenance |
| `AI_DAILY_REQUEST_LIMIT` | Shared daily provider-request cap; defaults to 100 |
| `ALLOWED_ORIGINS` | Additional exact browser origins, such as a custom domain |

Vercel's deployment and production origins are accepted automatically. Keep `EXPO_PUBLIC_API_URL` unset for this deployment so the web app uses its own origin. `.vercelignore` excludes credentials, local data, recordings, tests, and documents. Production exports disable dotenv loading; keep `.env.local` for local development and pull cloud settings into a separate ignored file when needed.

## Limits and retention

With AI configured in the cloud, the server admits five distinct practices per account each week, resetting Monday at midnight Singapore time. Linked revisions use the original practice slot. Each practice has a permanent budget of 12 provider requests; transcription has a separate allowance of 10 per week. All AI requests also share the daily deployment cap. These controls are stored in PostgreSQL and apply across function instances. Cached guided drafts do not consume a new request.

Audio becomes inaccessible after 30 days. `/api/maintenance` processes expired recordings and the durable deletion queue, removes expired sessions/limits/leases, and recovers a bounded batch of jobs. Its daily cron runs at `0 18 * * *` (around 02:00 Singapore time; Hobby execution may vary within the hour) and requires the `CRON_SECRET` bearer token. Physical deletion is retried when storage is unavailable; pending-upload tombstones prevent a still-valid upload from permanently restoring deleted audio.

## Checks and deployment

Run with Node 24 and npm:

```sh
npm ci
EXPO_NO_DOTENV=1 npm run lint
npm run typecheck
npm run test:api
EXPO_NO_DOTENV=1 npm run build:web
```

With cloud database credentials securely loaded into the process, apply pending migrations:

```sh
node scripts/migrate-cloud.mjs
```

The `recordings` bucket must already be private with the limits required by `setupPrivateBucket` in `server/audio-storage.mjs`. Request handlers verify it; they do not create or alter buckets.

This workspace uses a separate Vercel CLI login in `.vercel/cli-zhuwy`, preserving the default login. Deploy the linked project with:

```sh
npm exec --yes --package=vercel@65.9.0 -- vercel \
  --global-config .vercel/cli-zhuwy \
  --scope zhuwys-projects-37451b1d \
  --non-interactive deploy --prod --yes
```

After the deployment is ready, verify Home and a direct SPA route, `/api/health`, sign-in, saved practice and evaluation completion, garden persistence, and private recording upload/playback/deletion. A successful build alone does not verify the live provider or storage flow.

References: [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/), [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Vercel rewrites](https://vercel.com/docs/routing/rewrites), [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
