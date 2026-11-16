import express from "express";
import { AsyncResource } from "node:async_hooks";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { planningBoardSchema } from "./planning-board-schema.mjs";
import { planningBoardNotes } from "../shared/planning-board.mjs";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { resolve } from "node:path";
import { openDatabase, transaction } from "./database.mjs";
import { createAudioStorage } from "./audio-storage.mjs";
import { installAudioRoutes } from "./audio-routes.mjs";
import { installReadingSpeech } from "./reading-speech-jobs.mjs";
import { installReadingSample } from "./reading-sample.mjs";
import { createUsageService } from "./usage.mjs";
import { createDailyWorkoutService } from "./daily-workout.mjs";
import { createGamificationService } from "./gamification.mjs";
import { installAIDebate } from "./ai-debate.mjs";
import { installReadAloud } from "./read-aloud.mjs";
import { evaluateBridge } from "./bridge-evaluator.mjs";
import { createWordBloomService } from "./wordbloom.mjs";
import { evaluateGuidingAnswer } from "./guiding-answer.mjs";
import { getThoughtGuide } from "../shared/thought-guide.mjs";
import { createLearnerProfile, LEARNER_POLICY } from "./learner-profile.mjs";
import {
  evaluate,
  debateReply,
  presentAssessmentError,
  assessmentDiagnosticReason,
  ASSESSMENT_FAILURE_CODE,
} from "./evaluator.mjs";
import {
  readProviderConfig,
  providerStatus,
  requireProviderConfig,
} from "./provider.mjs";
import { articles, prompts } from "./content.mjs";
import { installFriends } from "./friends.mjs";
import { createNewsService } from "./news.mjs";
import { selectDailyNews, dailyNewsPrompt } from "./daily-news.mjs";
import {
  createGuidedResponseService,
  parseGuidedResponseInput,
} from "./guided-response.mjs";
import {
  DEFAULT_POSITIONS,
  isPlantablePosition,
  hasPlantSpace,
} from "../shared/garden-layout.mjs";
import {
  CARE_DURATION_MS,
  careRemainingMs,
  plantCareStatus,
} from "../shared/garden-care.mjs";
const now = () => new Date().toISOString();
const id = () => randomUUID();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = JSON.stringify;
const parse = JSON.parse;
function presentAttempt(attempt) {
  if (!attempt.error) return attempt;
  const error = presentAssessmentError(attempt.error, attempt.errorCode);
  return {
    ...attempt,
    error: error.message,
    ...(error.code
      ? {
          errorCode: error.code,
        }
      : {}),
  };
}
function gardenRequestHash(action, data) {
  const payload = {
    ...data,
  };
  delete payload.idempotencyKey;
  return hash(json([action, hash(json(payload))]));
}
const modes = ["spin_speak", "debate", "read_reflect"];
const plantTypes = [
  "daisy",
  "sunflower",
  "lavender",
  "tulip",
  "doodle",
  "fern",
  "cactus",
  "monstera",
  "bamboo",
];
const positionSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();
const doodleSchema = z
  .object({
    strokes: z
      .array(
        z
          .object({
            color: z.enum([
              "#D95D87",
              "#E7A547",
              "#79AEC8",
              "#6B9350",
              "#9B83BA",
            ]),
            points: z
              .array(positionSchema)
              .min(2, "Draw a stroke with at least two points.")
              .max(120),
          })
          .strict(),
      )
      .min(1, "Draw at least one stroke before planting.")
      .max(24),
  })
  .strict()
  .refine(
    (doodle) =>
      doodle.strokes.reduce(
        (total, stroke) => total + stroke.points.length,
        0,
      ) <= 1200,
    "Keep your drawing to 1,200 points or fewer.",
  );
const guestName = "Garden friend";
const practiceTextSchema = z
  .string()
  .trim()
  .min(
    10,
    "Write at least 10 characters so your coach has an idea to work with.",
  );
const textSchema = practiceTextSchema.max(10000);
const selfReflectionSchema = z
  .string()
  .refine(
    (text) => text.length <= 2000,
    "Keep your reflection to 2,000 characters or fewer.",
  )
  .transform((text) => text.trim());
// Three full answers plus their "Round n: " labels and blank-line separators.
const debateTranscriptSchema = practiceTextSchema.max(3 * 10000 + 31);
const profilePatch = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    interests: z.array(z.string().min(1).max(40)).min(2).max(5).optional(),
    goal: z
      .enum(["articulation", "reasoning", "knowledge", "confidence"])
      .optional(),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", {
            timeZone: v,
          });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid time zone.")
      .optional(),
    onboardingComplete: z.boolean().optional(),
    consent: z
      .object({
        recording: z.boolean().optional(),
        analytics: z.boolean().optional(),
      })
      .optional(),
    reducedMotion: z.boolean().optional(),
    wordBloomEnabled: z.boolean().optional(),
  })
  .strict();
function failure(status, message) {
  return Object.assign(new Error(message), {
    status,
  });
}
function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function passwordMatches(password, stored) {
  if (!stored) return false;
  const [salt, hex] = stored.split(":");
  const expected = Buffer.from(hex, "hex");
  return timingSafeEqual(scryptSync(password, salt, 64), expected);
}
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(50).optional(),
});
export function createApp(options = {}) {
  // Snapshot provider settings once, so changing the environment mid-job cannot
  // mix the reported model, credentials and request parameters. Restart to apply.
  const providerConfig = readProviderConfig(options);
  const completionTime = () => new Date(options.dailyNow?.() ?? Date.now()).toISOString();
  const gardenNow = () => Number(options.gardenNow?.() ?? Date.now());
  // Constructor-only override for the isolated browser-test server. Production
  // startup uses the default; authentication and per-user limits stay separate.
  const requestLimitPerMinute = options.requestLimitPerMinute ?? 300;
  if (!Number.isSafeInteger(requestLimitPerMinute) || requestLimitPerMinute < 1)
    throw new RangeError("requestLimitPerMinute must be a positive integer.");
  const guestLimitPerHour = options.guestLimitPerHour ?? 30;
  if (!Number.isSafeInteger(guestLimitPerHour) || guestLimitPerHour < 1)
    throw new RangeError("guestLimitPerHour must be a positive integer.");
  const cloud =
    options.databaseUrl !== undefined
      ? Boolean(options.databaseUrl)
      : !options.dbPath && Boolean(process.env.POSTGRES_URL);
  if (process.env.VERCEL && !cloud && !options.dbPath)
    throw new Error(
      "Hosted deployments require persistent PostgreSQL storage.",
    );
  const db = openDatabase({
    path:
      options.dbPath ||
      process.env.DATABASE_PATH ||
      resolve("data/garden.sqlite"),
    connectionString: cloud
      ? options.databaseUrl || process.env.POSTGRES_URL
      : undefined,
  });
  const storageDir =
    options.storageDir || process.env.AUDIO_DIR || resolve("data/audio");
  const audioStorage = createAudioStorage({
    storageDir,
    supabaseUrl: cloud
      ? options.supabaseUrl || process.env.SUPABASE_URL
      : undefined,
    serviceRoleKey: cloud
      ? options.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY
      : undefined,
  });
  if (cloud && audioStorage.kind !== "supabase")
    throw new Error("Cloud recording storage is required.");
  const news = options.newsService || createNewsService(options.newsOptions);
  const app = express();
  app.disable("x-powered-by");
  const production = process.env.NODE_ENV === "production";
  const allowedOrigins = [
    ...(process.env.ALLOWED_ORIGINS || "").split(","),
    ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter(Boolean)
      .map((host) => `https://${host}`),
  ].filter(Boolean);
  if (cloud) app.set("trust proxy", 1);
  const signingSecret =
    options.signingSecret ||
    process.env.AUDIO_SIGNING_SECRET ||
    randomBytes(32);
  const working = new Set();
  const timers = new Set();
  const workerScope = new AsyncResource("mindgarden-worker");
  const instanceOwner = id();
  const usage = createUsageService({
    db,
    enabled: options.enforceUsageLimits ?? (cloud && Boolean(providerConfig.apiKey)),
    dailyRequests: Number(process.env.AI_DAILY_REQUEST_LIMIT || 100),
    clock: options.usageClock || Date.now,
  });
  let closed = false;
  const rate = new Map();
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  app.use(
    wrap(async (_req, _res, next) => {
      await ready;
      next();
    }),
  );
  const mutate = (fn) =>
    wrap(async (req, res) => {
      const output = [];
      const reply = {};
      for (const method of [
        "status",
        "cookie",
        "clearCookie",
        "setHeader",
        "json",
      ]) {
        reply[method] = (...args) => {
          output.push([method, args]);
          return reply;
        };
      }
      await transaction(db, async () => {
        const uid = req.userId || (await resolveAuth(req));
        if (uid && !(await db.lockUser(uid)))
          throw failure(401, "Please sign in again.");
        await fn(req, reply);
      });
      for (const [method, args] of output) res[method](...args);
    });
  const getUser = async (uid) =>
    await db.prepare("SELECT * FROM users WHERE id=?").get(uid);
  const gamification = createGamificationService({ db, now: options.dailyNow });
  const awardCompletion = gamification.awardValidatedCompletion;
  const dailyWorkout = createDailyWorkoutService({ db, now: options.dailyNow, awardCompletion, getProgression: gamification.summary });
  const wordBloom = createWordBloomService({ db, now: options.wordBloomNow || options.dailyNow, awardCompletion });
  const learner = createLearnerProfile({ db, now: options.dailyNow });
  const getSession = async (sid, uid) => {
    const row = await db
      .prepare("SELECT data FROM sessions WHERE id=? AND user_id=?")
      .get(sid, uid);
    if (!row) throw failure(404, "Practice session not found.");
    return parse(row.data);
  };
  const getAttempt = async (aid, uid) => {
    const row = await db
      .prepare("SELECT data FROM attempts WHERE id=? AND user_id=?")
      .get(aid, uid);
    if (!row) throw failure(404, "Saved answer not found.");
    return parse(row.data);
  };
  const saveAttempt = async (attempt) =>
    await db
      .prepare("UPDATE attempts SET data=? WHERE id=?")
      .run(json(attempt), attempt.id);
  const saveSession = async (session) =>
    await db
      .prepare("UPDATE sessions SET data=? WHERE id=?")
      .run(json(session), session.id);
  const userDay = async (uid) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: parse((await getUser(uid)).profile).timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const limit = async (key, max, windowMs = 60000) => {
    if (cloud) {
      if (!(await db.consumeRateLimit(key, max, windowMs)).allowed)
        throw failure(429, "Please take a moment, then try again.");
      return;
    }
    const time = Date.now();
    let bucket = rate.get(key);
    if (!bucket || bucket.until < time) {
      bucket = {
        count: 0,
        until: time + windowMs,
      };
      rate.set(key, bucket);
    }
    if (++bucket.count > max)
      throw failure(429, "Please take a moment, then try again.");
    if (rate.size > 10000)
      for (const [k, v] of rate) if (v.until < time) rate.delete(k);
  };
  const guidedResponses = createGuidedResponseService({
    providerConfig,
    isUserActive: async (uid) => !closed && Boolean(await getUser(uid)),
    beforeRequest: async (uid, { session }) => {
      try {
        await limit(`guided-minute:${uid}`, 4);
        await limit(`guided-hour:${uid}`, 12, 3600000);
        await usage.allowRequest(uid, {
          sessionId: session.id,
        });
      } catch (error) {
        error.code = "guided_response_rate_limit";
        throw error;
      }
    },
  });
  const signedAudioUser = async (req) => {
    if (
      req.method !== "GET" ||
      !/^\/audio\/[a-f0-9-]+$/.test(req.path) ||
      typeof req.query.access !== "string"
    )
      return null;
    try {
      const [encoded, signature] = req.query.access.split(".");
      const expected = createHmac("sha256", signingSecret)
        .update(encoded)
        .digest("base64url");
      if (
        !signature ||
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        return null;
      const payload = parse(Buffer.from(encoded, "base64url").toString());
      if (
        payload.expires < Date.now() ||
        payload.audioId !== req.path.split("/").at(-1) ||
        !(await getUser(payload.userId))
      )
        return null;
      return payload.userId;
    } catch {
      return null;
    }
  };
  const authToken = (req) =>
    req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : req.headers.cookie
          ?.split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("garden_session="))
          ?.slice(15);
  const resolveAuth = async (req) => {
    const token = authToken(req);
    if (!token) return null;
    const row = await db
      .prepare(
        "SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>?",
      )
      .get(hash(token), now());
    return row?.user_id || null;
  };
  const issueAuth = async (uid, res) => {
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + 30 * 86400000);
    await db
      .prepare("INSERT INTO auth_sessions VALUES(?,?,?)")
      .run(hash(token), uid, expires.toISOString());
    res.cookie("garden_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      maxAge: 30 * 86400000,
      path: "/",
    });
    return token;
  };
  const newUser = async (
    email = null,
    password = null,
    displayName = guestName,
  ) => {
    const uid = id();
    const createdAt = now();
    const profile = {
      id: uid,
      displayName,
      email,
      isGuest: !email,
      interests: ["Science", "Technology"],
      goal: "confidence",
      timezone: "UTC",
      onboardingComplete: false,
      consent: {
        recording: false,
        analytics: false,
      },
      reducedMotion: false,
      createdAt,
    };
    const plots = DEFAULT_POSITIONS.map((position, i) => ({
      id: `plot-${i + 1}`,
      plantType: null,
      growth: 0,
      position: {
        ...position,
      },
    }));
    await db
      .prepare(
        "INSERT INTO users(id,email,password_hash,profile,wallet,plots,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        uid,
        email,
        password ? passwordHash(password) : null,
        json(profile),
        json({
          seeds: 0,
          water: 0,
          sunlight: 0,
        }),
        json(plots),
        createdAt,
      );
    return profile;
  };
  // Legacy garden quests are retired; their records remain exportable.
  const getQuests = async () => [];
  const normalizePlots = async (user) => {
    const plots = parse(user.plots);
    const careStart = gardenNow();
    for (const [index, position] of DEFAULT_POSITIONS.entries()) {
      const plotId = `plot-${index + 1}`;
      const plot = plots.find((item) => item.id === plotId);
      if (!plot)
        plots.push({
          id: plotId,
          plantType: null,
          growth: 0,
          position: {
            ...position,
          },
        });
      else if (!plot.position)
        plot.position = {
          ...position,
        };
    }
    for (const plot of plots) {
      if (!plot.plantType) continue;
      if (parse(user.profile).dailyWorkout) plot.carePolicy = "non_punitive_v1";
      if (!plot.plantId) plot.plantId = id();
      if (!Number.isFinite(Date.parse(plot.waterDueAt)))
        plot.waterDueAt = new Date(careStart + CARE_DURATION_MS).toISOString();
      // Preserve old per-plot retry keys after a plant is archived or cleared.
      const remember = async (key, requestHash) =>
        await db
          .prepare("INSERT OR IGNORE INTO garden_operations VALUES(?,?,?,?)")
          .run(user.id, key, requestHash, new Date(careStart).toISOString());
      if (plot.plantingKey && plot.plantingRequestHash)
        await remember(
          plot.plantingKey,
          hash(json(["plant", plot.plantingRequestHash])),
        );
      if (plot.lastWateringKey)
        await remember(
          plot.lastWateringKey,
          gardenRequestHash("water", {
            plotId: plot.id,
          }),
        );
    }
    const normalized = json(plots);
    if (normalized !== user.plots) {
      await db
        .prepare("UPDATE users SET plots=? WHERE id=?")
        .run(normalized, user.id);
      user.plots = normalized;
    }
    return plots;
  };
  const getState = async (uid) =>
    await transaction(db, async () => {
      await db.lockUser(uid);
      const user = await getUser(uid);
      if (!user) throw failure(401, "Please start a new garden or sign in.");
      const attempts = (
        await db
          .prepare(
            "SELECT data FROM attempts WHERE user_id=? ORDER BY created_at DESC",
          )
          .all(uid)
      ).map((r) => parse(r.data));
      const profile = parse(user.profile);
      const timezone = profile.timezone || "UTC";
      const daily = profile.dailyWorkout ? await dailyWorkout.today(uid) : null;
      const calendar = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const instant = new Date();
      const day = calendar.format(instant);
      // Practice counts even when its currency is capped or it is a linked retry.
      // Derive local dates from saved completion instants, including across DST.
      const days = [
        ...new Set(
          attempts
            .filter((attempt) => attempt.status === "completed")
            .map((attempt) =>
              Date.parse(attempt.completedAt || attempt.evaluation?.created_at),
            )
            .filter(
              (timestamp) =>
                Number.isFinite(timestamp) && timestamp <= instant.getTime(),
            )
            .map((timestamp) => calendar.format(new Date(timestamp))),
        ),
      ]
        .sort()
        .reverse();
      let streak = 0;
      const cursor = new Date(`${day}T12:00:00Z`);
      if (days[0] !== cursor.toISOString().slice(0, 10))
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      for (const day of days) {
        if (day !== cursor.toISOString().slice(0, 10)) break;
        streak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      const monday = new Date(`${day}T12:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      const weekStart = monday.toISOString().slice(0, 10);
      const progression = await gamification.summary(uid);
      return {
        profile,
        wallet: { coins: progression.coins },
        gamification: progression,
        plots: parse(user.plots),
        archivedPlants: (
          await db
            .prepare(
              "SELECT data FROM garden_archives WHERE user_id=? ORDER BY archived_at DESC,id",
            )
            .all(uid)
        ).map((row) => parse(row.data)),
        attempts: attempts.filter((attempt) => attempt.mode !== "read_aloud").map(presentAttempt),
        readAloudAttempts: attempts.filter((attempt) => attempt.mode === "read_aloud"),
        dailyWorkout: daily,
        quests: [],
        journal: (
          await db.prepare("SELECT data FROM journal WHERE user_id=?").all(uid)
        ).map((r) => parse(r.data)),
        decorations: parse(user.decorations),
        streak: progression.streak.current,
        practiceWeek: {
          day,
          timezone,
          days: days
            .filter(
              (completedDay) =>
                completedDay >= weekStart && completedDay <= day,
            )
            .reverse(),
          target: 3,
        },
        xp: progression.xp,
        usage: await usage.snapshot(uid),
      };
    });
  app.use(async (req, res, next) => {
    // Do not pass malformed percent encodings to downstream web-router decoders.
    if (req.originalUrl.length > 4096)
      return res.status(414).json({
        error: "This request URL is too long.",
      });
    try {
      decodeURIComponent(req.originalUrl);
    } catch {
      return res.status(400).json({
        error: "This request URL contains invalid encoding.",
      });
    }
    try {
      // Asset loads are not API operations; sharing this budget breaks normal page reloads.
      if (/^\/api(?:\/|$)/.test(req.path))
        await limit(`requests:${req.ip}`, requestLimitPerMinute);
    } catch (error) {
      return res.status(429).json({
        error: error.message,
      });
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin) {
      let local = false;
      try {
        const url = new URL(origin);
        local =
          !production &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      } catch {}
      if (!local && !allowedOrigins.includes(origin))
        return res.status(403).json({
          error: "This origin is not permitted.",
        });
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Idempotency-Key",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(
    "/api/audio",
    express.raw({
      type: ["audio/*", "application/octet-stream", "video/webm"],
      limit: "10mb",
    }),
  );
  app.use(
    ["/api/garden/plant", "/api/attempts", "/api/sessions"],
    express.json({
      limit: "128kb",
    }),
  );
  app.use(
    express.json({
      limit: "48kb",
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      provider: providerConfig.apiKey ? "openai" : "local",
      ai: providerStatus(providerConfig),
      version: "1.0.0",
      storage: audioStorage.kind,
      recordingRetentionDays: 30,
    }),
  );
  app.use(
    ["/api/auth/login", "/api/auth/register"],
    wrap(async (req, _res, next) => {
      if (req.method === "POST")
        await limit(`auth-entry:${req.ip}`, 20, 900000);
      next();
    }),
  );
  app.post(
    "/api/auth/guest",
    mutate(async (req, res) => {
      await limit(`guest:${req.ip}`, guestLimitPerHour, 3600000);
      const existing = await resolveAuth(req);
      const profile = existing
        ? parse((await getUser(existing)).profile)
        : await newUser();
      const token = await issueAuth(profile.id, res);
      res.json({
        token,
        profile,
      });
    }),
  );
  app.post(
    "/api/auth/register",
    mutate(async (req, res) => {
      await limit(`auth:${req.ip}`, 20, 900000);
      const data = credentials.parse(req.body);
      if (
        await db.prepare("SELECT id FROM users WHERE email=?").get(data.email)
      )
        throw failure(
          409,
          "An account already uses this email. Please sign in.",
        );
      const existing = await resolveAuth(req);
      let profile;
      if (existing && parse((await getUser(existing)).profile).isGuest) {
        profile = {
          ...parse((await getUser(existing)).profile),
          isGuest: false,
          email: data.email,
          displayName:
            data.displayName ||
            parse((await getUser(existing)).profile).displayName,
        };
        await db
          .prepare(
            "UPDATE users SET email=?,password_hash=?,profile=? WHERE id=?",
          )
          .run(
            data.email,
            passwordHash(data.password),
            json(profile),
            existing,
          );
      } else
        profile = await newUser(data.email, data.password, data.displayName);
      res.json({
        token: await issueAuth(profile.id, res),
        profile,
      });
    }),
  );
  app.post(
    "/api/auth/login",
    mutate(async (req, res) => {
      await limit(`auth:${req.ip}`, 20, 900000);
      const data = credentials.parse(req.body);
      const user = await db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(data.email);
      if (!user || !passwordMatches(data.password, user.password_hash))
        throw failure(401, "Email or password is incorrect.");
      res.json({
        token: await issueAuth(user.id, res),
        profile: parse(user.profile),
      });
    }),
  );
  app.get(
    "/api/maintenance",
    wrap(async (req, res) => {
      const configured = process.env.CRON_SECRET;
      const actual = String(req.headers.authorization || "");
      const expected = configured ? `Bearer ${configured}` : "";
      if (
        !expected ||
        Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
      )
        throw failure(401, "Not authorized.");
      await cleanupAudio();
      await db
        .prepare("DELETE FROM auth_sessions WHERE expires_at<?")
        .run(now());
      await db
        .prepare("DELETE FROM rate_limits WHERE window_end<?")
        .run(Date.now());
      await db
        .prepare("DELETE FROM named_locks WHERE expires_at<?")
        .run(Date.now());
      const jobs = await db
        .prepare(
          "SELECT id FROM jobs WHERE status IN ('queued','processing') ORDER BY created_at LIMIT 3",
        )
        .all();
      for (const job of jobs) await runJob(job.id);
      await readingSpeech.recover(1);
      res.json({
        ok: true,
      });
    }),
  );
  app.use(
    "/api",
    wrap(async (req, res, next) => {
      const uid = (await resolveAuth(req)) || (await signedAudioUser(req));
      if (!uid) throw failure(401, "Please start a new garden or sign in.");
      req.userId = uid;
      await limit(`user:${uid}`, 180);
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        !req.headers.authorization &&
        !req.headers.origin
      )
        throw failure(403, "A browser origin or bearer session is required.");
      next();
    }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await db
      .prepare("DELETE FROM auth_sessions WHERE token_hash=?")
      .run(hash(authToken(req)));
    res.clearCookie("garden_session", {
      path: "/",
    });
    res.json({
      ok: true,
    });
  });
  app.get("/api/me", async (req, res) =>
    res.json(parse((await getUser(req.userId)).profile)),
  );
  app.patch(
    "/api/me",
    mutate(async (req, res) => {
      const data = profilePatch.parse(req.body);
      const profile = parse((await getUser(req.userId)).profile);
      const updated = {
        ...profile,
        ...data,
        consent: {
          ...profile.consent,
          ...data.consent,
        },
      };
      if (
        updated.onboardingComplete &&
        (updated.interests.length < 2 || updated.interests.length > 5)
      )
        throw failure(400, "Choose between two and five interests.");
      await db
        .prepare("UPDATE users SET profile=? WHERE id=?")
        .run(json(updated), req.userId);
      res.json(updated);
    }),
  );
  app.get(
    ["/api/state", "/api/home"],
    wrap(async (req, res) => res.json(await getState(req.userId))),
  );
  app.post("/api/daily-workout/enroll", mutate(async (req, res) => {
    z.object({}).strict().parse(req.body);
    const owner = await getUser(req.userId);
    const profile = parse(owner.profile);
    if (!profile.dailyWorkout) {
      profile.dailyWorkout = true;
      profile.dailyEnrolledAt = now();
      await db.prepare("UPDATE users SET profile=? WHERE id=?").run(json(profile), req.userId);
    }
    res.json(await dailyWorkout.today(req.userId));
  }));
  app.get("/api/home/today", wrap(async (req, res) => res.json(await dailyWorkout.today(req.userId))));
  app.get("/api/wordbloom/summary", wrap(async (req, res) => res.json(await wordBloom.summary(req.userId))));
  app.post("/api/wordbloom/reviews", mutate(async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(await wordBloom.startReview(req.userId));
  }));
  app.post("/api/wordbloom/reviews/:id", mutate(async (req, res) => {
    const data = z.object({
      step: z.enum(["recall", "reflect"]),
      answer: z.string().trim().min(1).max(1000),
    }).strict().parse(req.body);
    res.json(await wordBloom.reviewStep(req.userId, req.params.id, data.step, data.answer));
  }));
  app.patch("/api/wordbloom/:id", mutate(async (req, res) => {
    const data = z.object({ action: z.enum(["dismiss", "familiar"]) }).strict().parse(req.body);
    res.json(await wordBloom.changeWord(req.userId, req.params.id, data.action));
  }));
  app.get("/api/prompts", (req, res) =>
    res.json(
      prompts.filter(
        (p) =>
          (!req.query.mode || p.mode === req.query.mode) &&
          (!req.query.topic ||
            p.category.toLowerCase() === String(req.query.topic).toLowerCase()),
      ),
    ),
  );
  app.get(
    "/api/news",
    wrap(async (req, res) => {
      const timezone = parse((await getUser(req.userId)).profile).timezone;
      res.json(
        await news.getFeed({
          timezone,
        }),
      );
    }),
  );
  app.get("/api/articles", (req, res) =>
    res.json(
      articles.filter(
        (a) =>
          !req.query.category ||
          a.category.toLowerCase() === String(req.query.category).toLowerCase(),
      ),
    ),
  );
  app.get(
    "/api/articles/:id",
    wrap((req, res) => {
      const article = articles.find((a) => a.id === req.params.id);
      if (!article) throw failure(404, "Reading not found.");
      res.json(article);
    }),
  );
  app.post(
    "/api/sessions",
    mutate(async (req, res) => {
      await limit(`sessions:${req.userId}`, 30, 3600000);
      const data = z
        .object({
          mode: z.enum(modes),
          topic: z.string().max(80).optional(),
          articleId: z.string().max(100).optional(),
          position: z.enum(["for", "against", "surprise"]).optional(),
          rounds: z.number().int().min(2).max(3).optional(),
          promptId: z.string().max(100).optional(),
          questionIndex: z.number().int().min(0).max(2).optional(),
          idempotencyKey: z.string().min(8).max(100).optional(),
        })
        .parse(req.body);
      if (data.idempotencyKey) {
        const existing = (
          await db
            .prepare("SELECT data FROM sessions WHERE user_id=?")
            .all(req.userId)
        )
          .map((r) => parse(r.data))
          .find((s) => s.idempotencyKey === data.idempotencyKey);
        if (existing) return res.json(existing);
      }
      let prompt;
      let learningFocus;
      let article;
      let newsSource;
      const profile = parse((await getUser(req.userId)).profile);
      const isDailyNews = data.mode === "spin_speak" && profile.dailyWorkout && !data.promptId && !data.topic;
      if (data.mode === "read_reflect") {
        article = articles.find((a) => a.id === data.articleId);
        if (!article) throw failure(400, "Choose a reading before reflecting.");
        const dailyHistory = (await db.prepare("SELECT data FROM sessions WHERE user_id=?").all(req.userId)).map((row) => parse(row.data)).filter((session) => session.newsSource);
        if (!selectDailyNews({ items: [article], history: dailyHistory })) throw failure(409, "This story was already used for your daily speaking. Choose a different reading.");
        prompt = {
          id: `${article.id}-reflect-${data.questionIndex || 0}`,
          question: article.questions[data.questionIndex || 0],
          category: article.category,
          context: article.summary,
        };
      } else if (isDailyNews) {
        const feed = await news.getFeed({ timezone: profile.timezone, recentDays: 7 });
        const history = (await db.prepare("SELECT data FROM sessions WHERE user_id=?").all(req.userId)).map((row) => parse(row.data));
        newsSource = selectDailyNews({ items: feed.articles, history, reserved: articles, interests: profile.interests || [] });
        if (!newsSource) throw failure(503, feed.status === "unavailable" ? "News is temporarily unavailable. Please try again shortly." : "There are no new headlines left for your daily question. Check back for a fresh story.");
        prompt = dailyNewsPrompt(newsSource);
        const recommendation = (await learner.summary(req.userId)).recommendation;
        if (recommendation) learningFocus = { recommendationId: recommendation.id, dimension: recommendation.dimension, label: recommendation.label, instruction: recommendation.focus, policyVersion: LEARNER_POLICY };
      } else {
        let pool = prompts.filter((p) => p.mode === data.mode);
        if (data.promptId) pool = pool.filter((p) => p.id === data.promptId);
        else if (data.topic)
          pool = pool.filter(
            (p) => p.category.toLowerCase() === data.topic.toLowerCase(),
          );
        else {
          const interests = parse(
            (await getUser(req.userId)).profile,
          ).interests.map((x) => x.toLowerCase());
          const personal = pool.filter((p) =>
            interests.includes(p.category.toLowerCase()),
          );
          if (personal.length) pool = personal;
        }
        if (!pool.length)
          throw failure(400, "No matching prompts. Choose another topic.");
        const recommendation = data.mode === "spin_speak" && !data.promptId && !data.topic && parse((await getUser(req.userId)).profile).dailyWorkout ? (await learner.summary(req.userId)).recommendation : null;
        if (recommendation) {
          prompt = prompts.find((item) => item.id === recommendation.exercise.promptId && item.mode === "spin_speak");
          learningFocus = { recommendationId: recommendation.id, dimension: recommendation.dimension, label: recommendation.label, instruction: recommendation.focus, policyVersion: LEARNER_POLICY };
        } else prompt = pool[Math.floor(Math.random() * pool.length)];
      }
      const session = {
        id: id(),
        idempotencyKey: data.idempotencyKey,
        mode: data.mode,
        prompt,
        articleId: article?.id,
        articleSnapshot: article,
        ...(newsSource ? { newsSource } : {}),
        position:
          data.position === "surprise"
            ? Math.random() < 0.5
              ? "for"
              : "against"
            : data.position || "for",
        rounds: data.rounds || 2,
        turns: [],
        status: "active",
        createdAt: now(),
        provider: providerConfig.apiKey ? "openai" : "local",
        ...(learningFocus ? { learningFocus } : {}),
        ...(data.mode === "spin_speak" && parse((await getUser(req.userId)).profile).dailyWorkout ? { assessmentFramework: "bridge-v1" } : {}),
      };
      if (data.mode === "spin_speak" && parse((await getUser(req.userId)).profile).dailyWorkout) {
        const daily = await dailyWorkout.today(req.userId);
        session.dailySpeakingJourney = {
          version: "daily-speaking-v1",
          day: daily.day,
          timezone: daily.timezone,
        };
      }
      await db
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
        .run(
          session.id,
          req.userId,
          session.mode,
          json(session),
          session.createdAt,
        );
      res.status(201).json(session);
    }),
  );
  app.get(
    "/api/sessions/:id",
    wrap(async (req, res) =>
      res.json(await getSession(req.params.id, req.userId)),
    ),
  );
  app.put(
    "/api/sessions/:id/brainstorm",
    mutate(async (req, res) => {
      const point = z.object({ x: z.number().finite().min(-20).max(2000), y: z.number().finite().min(-20).max(2000) }).strict();
      const board = z.object({
        version: z.literal("daily-whiteboard-v1"),
        planningBoard: planningBoardSchema.optional(),
        startedAt: z.string().datetime(), expiresAt: z.string().datetime(), completedAt: z.string().datetime().optional(),
        strokes: z.array(z.object({ id: z.string().max(80), points: z.array(point).min(2).max(1500) }).strict()).max(120),
        notes: z.array(z.object({ id: z.string().max(80), text: z.string().max(2000), x: z.number().finite().min(-20).max(2000), y: z.number().finite().min(-20).max(2000) }).strict()).max(40),
        connectors: z.array(z.object({ id: z.string().max(80), from: z.string().max(80), to: z.string().max(80) }).strict()).max(80),
        snapshot: z.object({ version: z.literal(1), savedAt: z.string().datetime(), elementCount: z.number().int().min(0).max(240) }).strict(),
      }).strict().parse(req.body);
      const session = await getSession(req.params.id, req.userId);
      if (!session.dailySpeakingJourney || session.mode !== "spin_speak")
        throw failure(400, "This brainstorm board belongs to a daily speaking challenge.");
      const noteIds = new Set(board.notes.map((note) => note.id));
      if (board.connectors.some((edge) => !noteIds.has(edge.from) || !noteIds.has(edge.to)))
        throw failure(400, "A board link refers to a missing idea note.");
      session.dailySpeakingJourney.brainstorm = board;
      await saveSession(session);
      res.json(session);
    }),
  );
  app.post(
    "/api/attempts",
    mutate(async (req, res) => {
      const data = z
        .object({
          sessionId: z.string().uuid(),
          text: z.string().trim().max(10000).default(""),
          selfReflection: selfReflectionSchema.optional(),
          planningNotes: z.string().trim().max(2000).optional(),
          planningBoard: planningBoardSchema.optional(),
          responseType: z.enum(["text", "audio"]).default("text"),
          retryOf: z.string().uuid().optional(),
          audioId: z.string().uuid().optional(),
          idempotencyKey: z.string().min(8).max(100).optional(),
        })
        .parse(req.body);
      const session = await getSession(data.sessionId, req.userId);
      if (session.mode === "read_aloud")
        throw failure(400, "Submit this reading through its Read Aloud self-review screen.");
      if (session.dailySpeakingJourney && (data.responseType !== "audio" || !data.audioId))
        throw failure(400, "Daily Challenge responses are submitted as a recording.");
      if (data.responseType === "text") textSchema.parse(data.text);
      if (data.audioId)
        await audioRoutes.assertOwnAudio(data.audioId, req.userId);
      let planningNotes = data.planningNotes;
      let planningBoard = data.planningBoard;
      if (data.retryOf) {
        const original = await getAttempt(data.retryOf, req.userId);
        if (
          original.sessionId !== session.id ||
          original.status !== "completed"
        )
          throw failure(400, "Retry a completed answer from this challenge.");
        planningNotes ??= original.planningNotes;
        planningBoard ??= original.planningBoard;
      }
      planningBoard ??= session.dailySpeakingJourney?.brainstorm?.planningBoard;
      if (planningBoard) planningNotes = planningBoardNotes(planningBoard);
      planningNotes ??= session.dailySpeakingJourney?.brainstorm?.notes
        .map(({ text }) => text.trim()).filter(Boolean).join("\n").slice(0, 2000);
      if (data.idempotencyKey) {
        const existing = (
          await db
            .prepare(
              "SELECT data FROM attempts WHERE session_id=? AND user_id=?",
            )
            .all(session.id, req.userId)
        )
          .map((r) => parse(r.data))
          .find((a) => a.idempotencyKey === data.idempotencyKey);
        if (existing) return res.json(presentAttempt(existing));
      }
      const attempt = {
        ...data,
        planningBoard,
        planningNotes: session.assessmentFramework === "bridge-v1" || session.mode === "read_reflect" ? planningNotes : undefined,
        id: id(),
        mode: session.mode,
        prompt: session.prompt.question,
        promptId: session.prompt.id,
        articleId: session.articleId,
        status: "draft",
        transcriptEdited: false,
        createdAt: now(),
      };
      await db
        .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
        .run(
          attempt.id,
          req.userId,
          session.id,
          json(attempt),
          attempt.createdAt,
        );
      res.status(201).json(attempt);
    }),
  );
  app.get(
    ["/api/attempts/:id", "/api/attempts/:id/feedback"],
    wrap(async (req, res) =>
      res.json(presentAttempt(await getAttempt(req.params.id, req.userId))),
    ),
  );
  app.get("/api/attempts/:id/thought-map", wrap(async (req, res) => {
    const attempt = await getAttempt(req.params.id, req.userId);
    if (!attempt.evaluation?.thought_map) throw failure(404, "No Thought Map is available for this response.");
    res.json(attempt.evaluation.thought_map);
  }));
  app.patch(
    "/api/attempts/:id/reflection",
    mutate(async (req, res) => {
      const attempt = await getAttempt(req.params.id, req.userId);
      if (!["draft", "failed"].includes(attempt.status))
        throw failure(
          409,
          "Reflection can only be changed before this answer is being evaluated. Your saved reflection was kept.",
        );
      const data = z
        .object({
          selfReflection: selfReflectionSchema,
        })
        .strict()
        .parse(req.body);
      attempt.selfReflection = data.selfReflection;
      await saveAttempt(attempt);
      res.json(presentAttempt(attempt));
    }),
  );
  app.post(
    "/api/attempts/:id/guided-response",
    wrap(async (req, res) => {
      const attempt = await getAttempt(req.params.id, req.userId);
      if (attempt.status !== "completed")
        throw failure(
          409,
          "Finish this practice before generating a guided draft.",
        );
      const input = parseGuidedResponseInput(req.body);
      const session = await getSession(attempt.sessionId, req.userId);
      const vocabulary = input.daily ? await wordBloom.context(req.userId) : null;
      const draft = await guidedResponses.generate({
        userId: req.userId,
        attempt,
        session,
        input,
        vocabulary: vocabulary?.catalogue.filter((word) => !vocabulary.knownWordIds.includes(word.id)) || [],
      });
      // A request may finish after sign-out, session expiry or account deletion.
      // Recheck the actual authentication token, not just the captured user ID.
      if (closed || (await resolveAuth(req)) !== req.userId)
        throw failure(401, "Please sign in again to view this draft.");
      await getAttempt(req.params.id, req.userId);
      if (input.daily) await transaction(db, async () => {
        await db.lockUser(req.userId);
        const current = await getAttempt(attempt.id, req.userId);
        current.dailyScript = draft;
        await saveAttempt(current);
      });
      res.json(draft);
    }),
  );
  app.post("/api/attempts/:id/vocabulary", mutate(async (req, res) => {
    const { wordIds } = z.strictObject({ wordIds: z.array(z.string().min(1).max(60)).min(1).max(3) }).parse(req.body);
    res.json(await wordBloom.saveSelected(req.userId, req.params.id, wordIds));
  }));
  app.post("/api/attempts/:id/guiding-answer", wrap(async (req, res) => {
    const { index, answer } = z.strictObject({ index: z.number().int().min(0).max(2), answer: z.string().trim().min(1).max(2000) }).parse(req.body);
    const attempt = await getAttempt(req.params.id, req.userId);
    if (attempt.status !== "completed") throw failure(409, "Finish your first response before practising guiding questions.");
    const question = getThoughtGuide(attempt.mode, attempt.evaluation)[index].question;
    const session = await getSession(attempt.sessionId, req.userId);
    await limit(`guiding-answer:${req.userId}`, 6);
    await usage.allowRequest(req.userId, { sessionId: session.id });
    const feedback = await evaluateGuidingAnswer({ question, answer, original: attempt.text, config: providerConfig });
    if (closed || (await resolveAuth(req)) !== req.userId) throw failure(401, "Please sign in again.");
    await transaction(db, async () => {
      await db.lockUser(req.userId);
      const current = await getAttempt(attempt.id, req.userId);
      current.guidingPractice = { ...current.guidingPractice, [index]: { question, answer, feedback } };
      await saveAttempt(current);
    });
    res.json(feedback);
  }));
  app.patch(
    "/api/attempts/:id/transcript",
    mutate(async (req, res) => {
      const attempt = await getAttempt(req.params.id, req.userId);
      if (!["draft", "failed"].includes(attempt.status))
        throw failure(
          409,
          "This answer is already being evaluated. Use a linked retry to change it.",
        );
      attempt.text = textSchema.parse(req.body.text);
      attempt.transcriptEdited = true;
      attempt.status = "draft";
      await saveAttempt(attempt);
      res.json(presentAttempt(attempt));
    }),
  );
  app.post(
    "/api/attempts/:id/report",
    mutate(async (req, res) => {
      const attempt = await getAttempt(req.params.id, req.userId);
      const reason = z.string().trim().min(5).max(1000).parse(req.body.reason);
      await db
        .prepare("INSERT INTO reports VALUES(?,?,?,?,?)")
        .run(id(), req.userId, attempt.id, reason, now());
      res.json({
        ok: true,
        message: "Your report has been saved with this assessment.",
      });
    }),
  );
  app.post(
    "/api/reports",
    mutate(async (req, res) => {
      const attempt = await getAttempt(
        z.string().uuid().parse(req.body.attemptId),
        req.userId,
      );
      const reason = z.string().trim().min(5).max(1000).parse(req.body.reason);
      await db
        .prepare("INSERT INTO reports VALUES(?,?,?,?,?)")
        .run(id(), req.userId, attempt.id, reason, now());
      res.json({
        ok: true,
      });
    }),
  );
  async function grantRewards(uid, attempt, session) {
    const receipt = await db.prepare("SELECT attempt_id FROM daily_attempt_receipts WHERE attempt_id=? AND user_id=?").get(attempt.id, uid);
    if (receipt && attempt.mode === "spin_speak") {
      const result = await dailyWorkout.complete(uid, attempt.id);
      return {
        ...result,
        reason: result.coins ? "Daily practice completed. Your Coins and XP are saved." : "Practice saved. Today's reward has already been earned.",
      };
    }
    // Only persisted server-validated completions can earn rewards.
    if (attempt.mode !== "read_reflect")
      return { coins: 0, xp: 0, reason: "Practice saved. Use Daily Practice or Debate Street to earn eligible rewards." };
    const reward = await gamification.awardCompletion(uid, {
      eventId: 'attempt:' + attempt.id,
      activityType: "read_reflect",
      completionId: attempt.id,
    });
    return { coins: reward.coinsGranted, xp: reward.xpGranted, reward,
      reason: reward.coinsGranted ? "Read & Reflect completed. Your rewards are saved." : "Practice saved. Eligible rewards have already been earned." };
  }
  async function runJob(jobId) {
    if (closed || working.has(jobId)) return;
    const leaseName = `job:${jobId}`;
    const lease = await db.acquireLease(leaseName, instanceOwner, 180000);
    if (!lease) return;
    working.add(jobId);
    let job;
    try {
      job = await db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
      if (!job || !["queued", "processing"].includes(job.status)) return;
      const { attempt, session } = await transaction(db, async () => {
        await db.lockUser(job.user_id);
        if (!(await db.ownsLease(leaseName, lease.token)))
          throw failure(409, "This evaluation is already running elsewhere.");
        const attempt = await getAttempt(job.attempt_id, job.user_id);
        const session = await getSession(attempt.sessionId, job.user_id);
        if (!attempt.evaluation) {
          attempt.status = "processing";
          await saveAttempt(attempt);
          await db
            .prepare(
              "UPDATE jobs SET status='processing',updated_at=? WHERE id=?",
            )
            .run(now(), jobId);
        }
        return {
          attempt,
          session,
        };
      });
      if (attempt.evaluation) return;
      if (providerConfig.apiKey)
        await usage.allowRequest(job.user_id, {
          sessionId: session.id,
          attemptId: attempt.id,
          kind: "evaluation",
        });
      let evaluation;
      try {
        evaluation = session.assessmentFramework === "bridge-v1"
          ? await evaluateBridge(attempt, session, { ...options, providerConfig, wordBloomContext: await wordBloom.context(job.user_id) })
          : await evaluate(
          attempt,
          session,
          session.articleSnapshot,
          {
            ...options,
            providerConfig,
          },
        );
      } catch (error) {
        // A malformed AI response must never strand a required daily activity.
        // Do not retry or reinterpret it: save a clearly unassessed BRIDGE
        // self-review instead, with the separately labelled sample map.
        if (
          session.assessmentFramework !== "bridge-v1" ||
          error.code !== ASSESSMENT_FAILURE_CODE
        )
          throw error;
        console.warn(
          "[bridge-self-review-fallback]",
          jobId,
          assessmentDiagnosticReason(error) || "schema_validation",
        );
        evaluation = await evaluateBridge(attempt, session, {
          ...options,
          providerConfig: { ...providerConfig, apiKey: "" },
          wordBloomContext: { enabled: false, catalogue: [], knownWordIds: [], reviewWords: [] },
        });
        evaluation.verification_flags.unshift(
          "The AI response could not be validated. This is self-review only; no AI map or skill rating was recorded.",
        );
      }
      if (closed) return;
      await transaction(db, async () => {
        if (
          !(await db.lockUser(job.user_id)) ||
          !(await db.ownsLease(leaseName, lease.token))
        )
          return;
        const current = await getAttempt(attempt.id, job.user_id);
        if (!current.evaluation) {
          current.evaluation = evaluation;
          current.status = "completed";
          current.completedAt = completionTime();
          await saveAttempt(current);
          await learner.record(job.user_id, current, session, evaluation);
          current.rewards = await grantRewards(job.user_id, current, session);
          current.wordBloom = await wordBloom.processAttempt(job.user_id, current, evaluation, { discover: !session.dailySpeakingJourney });
          await saveAttempt(current);
          const latestSession = await getSession(session.id, job.user_id);
          latestSession.status = "completed";
          latestSession.completedAt = current.completedAt;
          await saveSession(latestSession);
        }
        await db
          .prepare(
            "UPDATE jobs SET status='completed',error=NULL,updated_at=? WHERE id=?",
          )
          .run(now(), jobId);
      });
    } catch (error) {
      const diagnosticReason = assessmentDiagnosticReason(error);
      if (diagnosticReason)
        console.warn("[assessment-failed]", jobId, diagnosticReason);
      if (!closed && job)
        await transaction(db, async () => {
          if (
            !(await db.lockUser(job.user_id)) ||
            !(await db.ownsLease(leaseName, lease.token))
          )
            return;
          const attempt = await getAttempt(job.attempt_id, job.user_id);
          if (attempt.evaluation) return;
          attempt.status = "failed";
          const visibleError =
            error.code === "usage_limit"
              ? {
                  message: error.message,
                  code: error.code,
                }
              : presentAssessmentError(error.message, error.code);
          attempt.error = visibleError.message;
          if (visibleError.code) attempt.errorCode = visibleError.code;
          else delete attempt.errorCode;
          await saveAttempt(attempt);
          await db
            .prepare(
              "UPDATE jobs SET status='failed',error=?,retry_count=retry_count+?,updated_at=? WHERE id=?",
            )
            .run(
              visibleError.message,
              ["provider_configuration", "usage_limit"].includes(error.code)
                ? 0
                : 1,
              now(),
              jobId,
            );
        });
    } finally {
      working.delete(jobId);
      await db.releaseLease(leaseName, lease.token);
    }
  }
  function schedule(jobId) {
    if (cloud || options.disableWorker || closed) return;
    const timer = setTimeout(async () => {
      timers.delete(timer);
      await workerScope.runInAsyncScope(() =>
        runJob(jobId).catch((error) =>
          console.warn("[job-worker]", error.code || error.name),
        ),
      );
    }, options.jobDelay ?? 120);
    timers.add(timer);
  }
  async function queueEvaluation(attempt, uid) {
    return await transaction(db, async () => {
      await db.lockUser(uid);
      attempt = await getAttempt(attempt.id, uid);
      if (attempt.mode === "read_aloud")
        throw failure(409, "This reading uses its own self-review flow. Reopen Read Aloud to practise again.");
      (attempt.mode === "debate" ? debateTranscriptSchema : textSchema).parse(
        attempt.text,
      );
      const old = await db
        .prepare("SELECT * FROM jobs WHERE attempt_id=? AND user_id=?")
        .get(attempt.id, uid);
      if (old && old.status !== "failed")
        return {
          id: old.id,
          status: old.status,
          attemptId: attempt.id,
        };
      // Reject setup errors before creating/requeuing work or consuming its
      // provider retry budget. An explicitly empty key still permits local work.
      if (attempt.mode === "spin_speak" && parse((await getUser(uid)).profile).dailyWorkout)
        await dailyWorkout.pinReceipt(uid, attempt.id);
      if (providerConfig.apiKey) {
        requireProviderConfig(providerConfig);
        await usage.reservePractice(uid, attempt.sessionId, { attemptId: attempt.id, kind: "evaluation" });
      }
      if (providerConfig.apiKey && old?.retry_count >= 5)
        throw failure(
          429,
          "This assessment has failed five times. Your answer is saved; contact support before another provider request.",
        );
      await limit(`eval:${uid}`, 40, 3600000);
      const jid = old?.id || id();
      if (old)
        await db
          .prepare(
            "UPDATE jobs SET status='queued',error=NULL,updated_at=? WHERE id=?",
          )
          .run(now(), jid);
      else
        await db
          .prepare(
            "INSERT INTO jobs(id,user_id,attempt_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
          )
          .run(jid, uid, attempt.id, "queued", now(), now());
      attempt.status = "queued";
      delete attempt.error;
      delete attempt.errorCode;
      await saveAttempt(attempt);
      schedule(jid);
      return {
        id: jid,
        status: "queued",
        attemptId: attempt.id,
      };
    });
  }
  app.post(
    "/api/attempts/:id/evaluate",
    mutate(async (req, res) =>
      res
        .status(202)
        .json(
          await queueEvaluation(
            await getAttempt(req.params.id, req.userId),
            req.userId,
          ),
        ),
    ),
  );
  app.get(
    "/api/jobs/:id",
    wrap(async (req, res) => {
      let job = await db
        .prepare("SELECT * FROM jobs WHERE id=? AND user_id=?")
        .get(req.params.id, req.userId);
      // Polling can recover queued/stale work if a local timer was delayed
      // (for example after the computer resumes). Leases and the working set
      // still prevent duplicate processing; deliberately disabled test workers
      // remain under the test's explicit control.
      if ((cloud || !options.disableWorker) && job && ["queued", "processing"].includes(job.status)) {
        await runJob(job.id);
        job = await db
          .prepare("SELECT * FROM jobs WHERE id=? AND user_id=?")
          .get(req.params.id, req.userId);
      }
      if (!job) throw failure(404, "Processing job not found.");
      const error = presentAssessmentError(
        job.error,
        job.error
          ? (await getAttempt(job.attempt_id, req.userId)).errorCode
          : undefined,
      );
      res.json({
        id: job.id,
        status: job.status,
        attemptId: job.attempt_id,
        error: error.message,
        ...(error.code
          ? {
              errorCode: error.code,
            }
          : {}),
        retryCount: job.retry_count,
      });
    }),
  );
  app.post(
    "/api/debates/:id/turn",
    wrap(async (req, res) => {
      const data = z
        .object({
          text: textSchema,
          idempotencyKey: z.string().min(8).max(100),
          deferEvaluation: z.boolean().default(false),
        })
        .parse(req.body);
      const leaseName = `debate:${req.params.id}`;
      const lease = await db.acquireLease(leaseName, instanceOwner, 180000);
      if (!lease)
        throw failure(
          409,
          "Your previous argument is still being answered. Please wait.",
        );
      try {
        const prepared = await transaction(db, async () => {
          if (!(await db.lockUser(req.userId)))
            throw failure(401, "Please sign in again.");
          await db.lockSession(req.params.id);
          if (!(await db.ownsLease(leaseName, lease.token)))
            throw failure(409, "This debate is already running elsewhere.");
          const session = await getSession(req.params.id, req.userId);
          if (session.mode !== "debate")
            throw failure(400, "This session is not a debate.");
          const previous = session.turns.find(
            (t) =>
              t.speaker === "user" && t.idempotencyKey === data.idempotencyKey,
          );
          if (previous && previous.text !== data.text)
            throw failure(
              409,
              "Use the same saved argument when retrying this request.",
            );
          const pending = session.turns.find(
            (t) =>
              t.speaker === "user" &&
              !session.turns.some(
                (a) => a.speaker === "ai" && a.round === t.round,
              ),
          );
          if (pending && !previous)
            throw failure(
              409,
              "Retry your saved argument before sending a new round.",
            );
          if (
            previous &&
            session.turns.some(
              (t) => t.speaker === "ai" && t.round === previous.round,
            )
          )
            return {
              completed: session,
            };
          if (session.status === "completed")
            throw failure(
              409,
              "This debate is complete. Try a new debate or revise your opening.",
            );
          if (providerConfig.apiKey) {
            requireProviderConfig(providerConfig);
            await usage.reservePractice(req.userId, session.id);
          }
          const deferEvaluation =
            previous?.deferEvaluation ?? data.deferEvaluation;
          const round =
            previous?.round ||
            session.turns.filter((t) => t.speaker === "user").length + 1;
          if (round > session.rounds)
            throw failure(409, "All debate rounds have been submitted.");
          if (!previous) {
            session.turns.push({
              id: id(),
              speaker: "user",
              text: data.text,
              round,
              idempotencyKey: data.idempotencyKey,
              deferEvaluation,
              createdAt: now(),
            });
            await saveSession(session);
          }
          return {
            session,
            round,
            deferEvaluation,
            replySession: {
              ...session,
              turns: session.turns.filter(
                (t) => !(t.speaker === "user" && t.round === round),
              ),
            },
          };
        });
        if (prepared.completed) return res.json(prepared.completed);
        const { round, deferEvaluation, replySession } = prepared;
        if (providerConfig.apiKey)
          await usage.allowRequest(req.userId, {
            sessionId: replySession.id,
          });
        const reply = await debateReply(
          replySession,
          data.text,
          providerConfig.apiKey,
          providerConfig,
        );
        const session = await transaction(db, async () => {
          if (!(await db.lockUser(req.userId)))
            throw failure(401, "This account has been deleted.");
          await db.lockSession(req.params.id);
          if (!(await db.ownsLease(leaseName, lease.token)))
            throw failure(
              409,
              "This debate changed while your reply was being generated. Reopen it to continue.",
            );
          const session = await getSession(req.params.id, req.userId);
          if (
            session.turns.some((t) => t.speaker === "ai" && t.round === round)
          )
            return session;
          session.turns.push({
            id: id(),
            speaker: "ai",
            text: reply,
            round,
            createdAt: now(),
          });
          if (round >= session.rounds) {
            session.status = "completed";
            session.summary = `You practised the ${session.position === "against" ? "opposing" : "supporting"} position on “${session.prompt.question}”.\n\nYour case: ${session.turns
              .filter((t) => t.speaker === "user")
              .map(
                (t, i) =>
                  `Round ${i + 1}: “${t.text.slice(0, 300)}${t.text.length > 300 ? "…" : ""}”`,
              )
              .join(" ")}\n\nAlternative view: ${session.turns
              .filter((t) => t.speaker === "ai")
              .map((t) => t.text.replace(/^You wrote: “.*?” /s, ""))
              .join(
                " ",
              )}\n\nBoth positions are practice perspectives. Review how each claim is supported; this summary does not establish which position is correct.`;
            const text = session.turns
              .filter((t) => t.speaker === "user")
              .map((t, i) => `Round ${i + 1}: ${t.text}`)
              .join("\n\n");
            const attempt = {
              id: id(),
              sessionId: session.id,
              mode: "debate",
              prompt: session.prompt.question,
              promptId: session.prompt.id,
              text,
              responseType: "text",
              status: "draft",
              createdAt: now(),
            };
            await db
              .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
              .run(
                attempt.id,
                req.userId,
                session.id,
                json(attempt),
                attempt.createdAt,
              );
            session.attemptId = attempt.id;
            if (!deferEvaluation)
              session.jobId = (await queueEvaluation(attempt, req.userId)).id;
            await saveSession(session);
          }
          await saveSession(session);
          return session;
        });
        res.json(session);
      } finally {
        await db.releaseLease(leaseName, lease.token);
      }
    }),
  );
  let friends;
  const audioRoutes = installAudioRoutes({
    app,
    db,
    audioStorage,
    cloud,
    wrap,
    getUser,
    resolveAuth,
    limit,
    failure,
    providerConfig,
    signingSecret,
    friends: () => friends,
    allowAI: (uid) =>
      usage.allowRequest(uid, {
        kind: "transcription",
      }),
  });
  const { transcribeAudio, cleanupAudio } = audioRoutes;
  installAIDebate({ app, db, wrap, providerConfig, usage, audioRoutes,
    resolveAuth, awardValidatedCompletion: awardCompletion, now: options.debateNow,
    providerRequest: options.debateProviderRequest, rewardPreview: gamification.rewardPreview("ai_debate") });
  app.get("/api/gamification", wrap(async (req, res) => res.json(await gamification.summary(req.userId))));
  app.put("/api/avatar/equipment", mutate(async (req, res) => {
    res.json(await gamification.equip(req.userId, req.body.selection || req.body));
  }));
  app.post("/api/avatar/purchase", mutate(async (req, res) => {
    res.json(await gamification.purchaseItem(req.userId, req.body));
  }));
  app.patch("/api/avatar/care", mutate(async (req, res) => {
    res.json(await gamification.updateSettings(req.userId, req.body));
  }));
  app.post("/api/food/purchase", mutate(async (req, res) => {
    res.json(await gamification.purchaseFood(req.userId, req.body));
  }));
  // The garden remains available in account exports; its old resource economy
  // is retired. No route may spend or award Seeds, Water or Sunlight.
  app.use("/api/garden", (_req, res) => res.status(410).json({
    error: "The garden has retired. Your saved history is preserved; use your avatar and Coins instead.",
  }));
  installReadingSample({ app, db, wrap, getAttempt, audioRoutes, audioStorage, limit, failure, options });
  const readingSpeech = installReadingSpeech({ app, db, wrap, getAttempt, getUser, wordBloom,
    audioRoutes, audioStorage, limit, cloud, options, daily: dailyWorkout });
  installReadAloud({ app, db, wrap, mutate, getUser, daily: dailyWorkout,
    wordBloom, enqueueSpeech: readingSpeech.enqueue, acousticAvailable: readingSpeech.available, assertOwnAudio: audioRoutes.assertOwnAudio, failure, now: options.dailyNow });
  friends = installFriends(app, {
    db,
    wrap,
    limit,
    getUser,
    assertOwnAudio: audioRoutes.assertOwnAudio,
  });
  app.post(
    "/api/attempts/:id/transcribe",
    wrap(async (req, res) => {
      const attempt = await getAttempt(req.params.id, req.userId);
      if (!attempt.audioId)
        throw failure(400, "No recording is attached to this answer.");
      if (!["draft", "failed"].includes(attempt.status))
        throw failure(409, "This answer is already being assessed.");
      const expected = json(attempt);
      const result = await transcribeAudio(attempt.audioId, req.userId);
      if (result.text) {
        // The provider request can outlive a correction, a submission or an
        // assessment in another tab/device. Commit only against the exact
        // version read above; never replace a newer whole attempt object.
        attempt.text = result.text;
        const changed = await db
          .prepare(
            "UPDATE attempts SET data=? WHERE id=? AND user_id=? AND data=?",
          )
          .run(json(attempt), attempt.id, req.userId, expected);
        if (!changed.changes)
          throw failure(
            409,
            "This answer changed while transcription was running. Your latest saved version was kept; reopen it before continuing.",
          );
      }
      res.json(result);
    }),
  );
  app.get(
    "/api/garden",
    wrap(async (req, res) => res.json(await getState(req.userId))),
  );
  const gardenMutation = async (req, fn, operation) =>
    await transaction(db, async () => {
      await db.lockUser(req.userId);
      const user = await getUser(req.userId),
        wallet = parse(user.wallet),
        plots = await normalizePlots(user),
        decorations = parse(user.decorations);
      const requestHash =
        operation && gardenRequestHash(operation.action, operation.data);
      const key = operation?.data.idempotencyKey;
      if (key) {
        const previous = await db
          .prepare(
            "SELECT request_hash FROM garden_operations WHERE user_id=? AND request_key=?",
          )
          .get(req.userId, key);
        if (previous) {
          if (previous.request_hash !== requestHash)
            throw failure(
              409,
              "This garden request was already used for a different action. Refresh your garden.",
            );
          return await getState(req.userId);
        }
      }
      await fn({
        user,
        wallet,
        plots,
        decorations,
        careTime: gardenNow(),
      });
      await db
        .prepare("UPDATE users SET wallet=?,plots=?,decorations=? WHERE id=?")
        .run(json(wallet), json(plots), json(decorations), req.userId);
      if (key)
        await db
          .prepare("INSERT INTO garden_operations VALUES(?,?,?,?)")
          .run(req.userId, key, requestHash, now());
      return await getState(req.userId);
    });
  const findPlant = (plots, plotId, plantId) => {
    const plot = plots.find((item) => item.id === plotId);
    if (!plot) throw failure(404, "Plot not found.");
    if (plantId && plot.plantId !== plantId)
      throw failure(
        409,
        "This plant has changed. Refresh your garden before trying again.",
      );
    if (!plot.plantType) throw failure(400, "Plant a seed here first.");
    return plot;
  };
  const emptyPlot = (plot) => {
    const { id: plotId, position } = plot;
    for (const key of Object.keys(plot)) delete plot[key];
    Object.assign(plot, {
      id: plotId,
      plantType: null,
      growth: 0,
      position,
    });
  };
  const checkPosition = (plots, position, plotId) => {
    if (!isPlantablePosition(position))
      throw failure(
        400,
        "Place your plant on the grassy island, away from its edge.",
      );
    if (!hasPlantSpace(plots, position, plotId))
      throw failure(409, "Leave a little space between your plants.");
  };
  const restorePosition = (plots, plot, archived) => {
    const available = (position) =>
      position &&
      isPlantablePosition(position) &&
      hasPlantSpace(plots, position, plot.id);
    for (const position of [
      plot.position,
      archived.position,
      ...DEFAULT_POSITIONS,
    ])
      if (available(position)) return position;
    for (let row = 4; row <= 36; row++)
      for (let column = 4; column <= 36; column++) {
        const position = {
          x: column / 40,
          y: row / 40,
        };
        if (available(position)) return position;
      }
    throw failure(409, "Make room on the island before restoring this plant.");
  };
  app.post(
    "/api/garden/plant",
    wrap(async (req, res) => {
      const data = z
        .object({
          plotId: z.string().min(1).max(20),
          plantType: z.enum(plantTypes),
          position: positionSchema.optional(),
          doodle: doodleSchema.optional(),
          idempotencyKey: z.string().min(8).max(100).optional(),
        })
        .strict()
        .parse(req.body);
      if (data.plantType === "doodle" && !data.doodle)
        throw failure(400, "Draw your plant before placing it in the garden.");
      if (data.plantType !== "doodle" && data.doodle)
        throw failure(400, "Drawings belong to custom doodle plants.");
      const requestHash = hash(
        json({
          plotId: data.plotId,
          plantType: data.plantType,
          position: data.position,
          doodle: data.doodle,
        }),
      );
      res.json(
        await gardenMutation(
          req,
          ({ user, wallet, plots, careTime }) => {
            if (data.idempotencyKey) {
              const planted = plots.find(
                (plot) => plot.plantingKey === data.idempotencyKey,
              );
              if (planted) {
                if (planted.plantingRequestHash !== requestHash)
                  throw failure(
                    409,
                    "This planting request was already used for a different plant or position.",
                  );
                return;
              }
            }
            const plot = plots.find((item) => item.id === data.plotId);
            if (!plot) throw failure(404, "Plot not found.");
            if (plot.plantType)
              throw failure(
                409,
                "This spot already has a plant. Move it or choose another empty spot.",
              );
            const needed = {
              daisy: 0,
              sunflower: 30,
              lavender: 60,
              tulip: 90,
              doodle: 0,
              fern: 0,
              cactus: 0,
              monstera: 30,
              bamboo: 60,
            }[data.plantType];
            if (user.xp < needed)
              throw failure(409, `This plant unlocks at ${needed} XP.`);
            const position = data.position || plot.position;
            if (!isPlantablePosition(position))
              throw failure(
                400,
                "Place your plant on the grassy island, away from its edge.",
              );
            if (!hasPlantSpace(plots, position, plot.id))
              throw failure(409, "Leave a little space between your plants.");
            if (wallet.seeds < 1)
              throw failure(
                409,
                "Complete a practice session to earn another seed.",
              );
            wallet.seeds--;
            plot.plantType = data.plantType;
            plot.growth = 0;
            plot.position = {
              ...position,
            };
            plot.plantId = id();
            plot.plantedAt = new Date(careTime).toISOString();
            plot.waterDueAt = new Date(
              careTime + CARE_DURATION_MS,
            ).toISOString();
            if (data.doodle) plot.doodle = data.doodle;
            if (data.idempotencyKey) {
              plot.plantingKey = data.idempotencyKey;
              plot.plantingRequestHash = requestHash;
            }
          },
          {
            action: "plant",
            data,
          },
        ),
      );
    }),
  );
  app.post(
    "/api/garden/move",
    wrap(async (req, res) => {
      const data = z
        .object({
          plotId: z.string().min(1).max(20),
          plantId: z.string().uuid().optional(),
          position: positionSchema,
        })
        .strict()
        .parse(req.body);
      res.json(
        await gardenMutation(req, ({ plots }) => {
          const plot = findPlant(plots, data.plotId, data.plantId);
          if (!isPlantablePosition(data.position))
            throw failure(
              400,
              "Place your plant on the grassy island, away from its edge.",
            );
          if (!hasPlantSpace(plots, data.position, plot.id))
            throw failure(409, "Leave a little space between your plants.");
          plot.position = {
            ...data.position,
          };
        }),
      );
    }),
  );
  app.post(
    "/api/garden/water",
    wrap(async (req, res) => {
      const data = z
        .object({
          plotId: z.string().max(20),
          plantId: z.string().uuid().optional(),
          idempotencyKey: z.string().min(8).max(100).optional(),
        })
        .strict()
        .parse(req.body);
      res.json(
        await gardenMutation(
          req,
          ({ user, wallet, plots, careTime }) => {
            const plot = findPlant(plots, data.plotId, data.plantId);
            if (
              data.idempotencyKey &&
              plot.lastWateringKey === data.idempotencyKey
            )
              return;
            if (plantCareStatus(plot, careTime) === "dead")
              throw failure(
                409,
                "This plant has dried out. Clear the spot or replant it with one seed.",
              );
            const dailyPlan = parse(user.profile).dailyWorkout === true;
            if (!dailyPlan && wallet.water < 1)
              throw failure(409, "Complete a practice session to earn water.");
            if (!dailyPlan) wallet.water--;
            if (!dailyPlan)
              plot.growth = Math.min(3, plot.growth + 1);
            plot.lastWateredAt = new Date(careTime).toISOString();
            plot.waterDueAt = new Date(
              careTime + CARE_DURATION_MS,
            ).toISOString();
            plot.lastWateringKey = data.idempotencyKey;
          },
          {
            action: "water",
            data,
          },
        ),
      );
    }),
  );
  const plantActionSchema = z
    .object({
      plotId: z.string().min(1).max(20),
      plantId: z.string().uuid(),
      idempotencyKey: z.string().min(8).max(100),
    })
    .strict();
  app.post(
    "/api/garden/archive",
    wrap(async (req, res) => {
      const data = plantActionSchema.parse(req.body);
      res.json(
        await gardenMutation(
          req,
          async ({ plots, careTime }) => {
            const plot = findPlant(plots, data.plotId, data.plantId);
            if (plantCareStatus(plot, careTime) === "dead")
              throw failure(
                409,
                "Only living plants can be archived. Clear or replant this spot.",
              );
            const archived = {
              ...plot,
              id: plot.plantId,
              archivedAt: new Date(careTime).toISOString(),
              careRemainingMs: careRemainingMs(plot, careTime),
            };
            delete archived.waterDueAt;
            await db
              .prepare("INSERT INTO garden_archives VALUES(?,?,?,?)")
              .run(
                archived.id,
                req.userId,
                json(archived),
                archived.archivedAt,
              );
            emptyPlot(plot);
          },
          {
            action: "archive",
            data,
          },
        ),
      );
    }),
  );
  app.post(
    "/api/garden/restore",
    wrap(async (req, res) => {
      const data = z
        .object({
          archiveId: z.string().uuid(),
          plotId: z.string().min(1).max(20),
          position: positionSchema.optional(),
          idempotencyKey: z.string().min(8).max(100),
        })
        .strict()
        .parse(req.body);
      res.json(
        await gardenMutation(
          req,
          async ({ plots, careTime }) => {
            const row = await db
              .prepare(
                "SELECT data FROM garden_archives WHERE id=? AND user_id=?",
              )
              .get(data.archiveId, req.userId);
            if (!row) throw failure(404, "Archived plant not found.");
            const archived = parse(row.data);
            const plot = plots.find((item) => item.id === data.plotId);
            if (!plot) throw failure(404, "Plot not found.");
            if (plot.plantType)
              throw failure(409, "Choose an empty spot to restore this plant.");
            const remaining = parse((await getUser(req.userId)).profile).dailyWorkout
              ? Math.max(1, Number(archived.careRemainingMs) || CARE_DURATION_MS)
              : archived.careRemainingMs;
            if (
              !Number.isFinite(remaining) ||
              remaining <= 0 ||
              remaining > CARE_DURATION_MS
            )
              throw failure(
                409,
                "This archived plant has no remaining care time.",
              );
            const position =
              data.position || restorePosition(plots, plot, archived);
            checkPosition(plots, position, plot.id);
            Object.assign(plot, archived, {
              id: data.plotId,
              position: {
                ...position,
              },
              waterDueAt: new Date(careTime + remaining).toISOString(),
            });
            delete plot.archivedAt;
            delete plot.careRemainingMs;
            await db
              .prepare("DELETE FROM garden_archives WHERE id=? AND user_id=?")
              .run(archived.id, req.userId);
          },
          {
            action: "restore",
            data,
          },
        ),
      );
    }),
  );
  for (const action of ["clear", "replant"]) {
    app.post(
      `/api/garden/${action}`,
      wrap(async (req, res) => {
        const data = plantActionSchema.parse(req.body);
        res.json(
          await gardenMutation(
            req,
            ({ wallet, plots, careTime }) => {
              const plot = findPlant(plots, data.plotId, data.plantId);
              if (plantCareStatus(plot, careTime) !== "dead")
                throw failure(
                  409,
                  "This plant is still living. Archive it to free this spot.",
                );
              if (action === "clear") return emptyPlot(plot);
              if (wallet.seeds < 1)
                throw failure(
                  409,
                  "Complete a practice session to earn another seed.",
                );
              const { plantType, position, doodle } = plot;
              checkPosition(plots, position, plot.id);
              wallet.seeds--;
              emptyPlot(plot);
              Object.assign(plot, {
                plantId: id(),
                plantType,
                growth: 0,
                plantedAt: new Date(careTime).toISOString(),
                waterDueAt: new Date(careTime + CARE_DURATION_MS).toISOString(),
                ...(doodle
                  ? {
                      doodle,
                    }
                  : {}),
              });
            },
            {
              action,
              data,
            },
          ),
        );
      }),
    );
  }
  app.post(
    "/api/garden/decorate",
    wrap(async (req, res) => {
      const data = z
        .object({
          decoration: z.enum([
            "birdbath",
            "stepping_stones",
            "birdhouse",
            "mushrooms",
            "lantern",
            "bench",
          ]),
        })
        .parse(req.body);
      res.json(
        await gardenMutation(req, ({ wallet, decorations }) => {
          if (decorations.includes(data.decoration)) return;
          const cost = data.decoration === "stepping_stones" ? 2 : 3;
          if (wallet.sunlight < cost)
            throw failure(
              409,
              `Earn ${cost} sunlight through quests or retries to add a decoration.`,
            );
          wallet.sunlight -= cost;
          decorations.push(data.decoration);
        }),
      );
    }),
  );
  app.post(
    "/api/journal",
    mutate(async (req, res) => {
      const data = z
        .object({
          attemptId: z.string().uuid(),
          body: z.string().trim().min(1).max(10000).optional(),
          articleId: z.string().max(100).optional(),
        })
        .parse(req.body);
      const attempt = await getAttempt(data.attemptId, req.userId);
      if (attempt.status !== "completed")
        throw failure(
          409,
          "Complete your reflection before saving it to the journal.",
        );
      const existing = await db
        .prepare("SELECT data FROM journal WHERE user_id=? AND attempt_id=?")
        .get(req.userId, attempt.id);
      if (existing) return res.json(parse(existing.data));
      const entry = {
        id: id(),
        attemptId: attempt.id,
        articleId: attempt.articleId,
        sessionId: attempt.sessionId,
        body: data.body || attempt.text,
        createdAt: now(),
      };
      await db
        .prepare("INSERT INTO journal VALUES(?,?,?,?)")
        .run(entry.id, req.userId, attempt.id, json(entry));
      res.status(201).json(entry);
    }),
  );
  app.get("/api/quests", async (req, res) =>
    res.json(await getQuests(req.userId)),
  );
  app.get("/api/me/learner-profile", wrap(async (req, res) => res.json(await learner.summary(req.userId))));
  app.patch("/api/me/learner-profile", mutate(async (req, res) => {
    const settings = z.object({ enabled: z.boolean().optional(), dismissId: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().refine((data) => data.enabled !== undefined || data.dismissId).parse(req.body);
    res.json(await learner.preferences(req.userId, settings));
  }));
  app.post("/api/me/learner-profile/import", mutate(async (req,res) => res.json(await learner.importHistory(req.userId))));
  app.get(
    "/api/profile/analytics",
    wrap(async (req, res) => {
      const attempts = (await getState(req.userId)).attempts.filter(
        (a) => a.evaluation && (!req.query.mode || a.mode === req.query.mode),
      );
      res.json({
        attempts,
        notice:
          "New research-informed ratings are unvalidated and excluded from numerical comparisons. Local coaching has no scores. Historical practice ratings require the same mode, prompt, provider, rubric, model and template with at least three responses; they do not measure ability.",
        groups: Object.values(
          attempts.reduce((acc, a) => {
            const key = [
              a.mode,
              a.promptId,
              a.evaluation.provider,
              a.evaluation.rubric_version,
              a.evaluation.model_version,
              a.evaluation.prompt_template_version,
            ].join(":");
            acc[key] ??= {
              key,
              mode: a.mode,
              promptId: a.promptId,
              count: 0,
              attemptIds: [],
              ratingStatus: a.evaluation.assessment
                ? "unvalidated"
                : a.evaluation.provider === "local"
                  ? "local"
                  : "historical",
            };
            acc[key].count++;
            acc[key].attemptIds.push(a.id);
            return acc;
          }, {}),
        ).map((g) => ({
          ...g,
          insufficientData: g.count < 3,
          eligibleForComparison:
            g.ratingStatus === "historical" && g.count >= 3,
        })),
      });
    }),
  );
  app.get(
    ["/api/export", "/api/account/export"],
    wrap(async (req, res) => {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="mind-garden-data.json"',
      );
      res.json({
        exportedAt: now(),
        ...(await getState(req.userId)),
        gamificationData: await gamification.exportData(req.userId),
        wordBloom: await wordBloom.exportData(req.userId),
        skillObservations: await learner.exportData(req.userId),
        speechJobs: (await db.prepare("SELECT * FROM speech_jobs WHERE user_id=? ORDER BY created_at").all(req.userId)).map((row) => ({ ...row, data: JSON.parse(row.data) })),
        dailySubmissionReceipts: await db.prepare("SELECT * FROM daily_attempt_receipts WHERE user_id=? ORDER BY received_at").all(req.userId),
        dailyActivityCompletions: await db.prepare("SELECT * FROM daily_activity_completions WHERE user_id=? ORDER BY local_date,activity_type").all(req.userId),
        securedDailyWorkouts: await db.prepare("SELECT * FROM daily_workout_days WHERE user_id=? ORDER BY local_date").all(req.userId),
        friendRooms: await friends.listForUser(req.userId),
        sessions: (
          await db
            .prepare("SELECT data FROM sessions WHERE user_id=?")
            .all(req.userId)
        ).map((r) => parse(r.data)),
        recordings: await db
          .prepare("SELECT id,mime,created_at FROM audio WHERE user_id=?")
          .all(req.userId),
        reports: await db
          .prepare(
            "SELECT attempt_id,reason,created_at FROM reports WHERE user_id=?",
          )
          .all(req.userId),
        rewardLedger: (
          await db
            .prepare(
              "SELECT source_key,day,kind,data,created_at FROM reward_ledger WHERE user_id=?",
            )
            .all(req.userId)
        ).map((r) => ({
          ...r,
          data: parse(r.data),
        })),
      });
    }),
  );
  app.delete(
    "/api/account",
    wrap(async (req, res) => {
      await transaction(db, async () => {
        await db.lockUser(req.userId);
        await friends.removeUser(req.userId);
        await audioRoutes.queueUserAudioDeletion(req.userId);
        await db.prepare("DELETE FROM users WHERE id=?").run(req.userId);
      });
      guidedResponses.forgetUser(req.userId);
      await cleanupAudio().catch((error) =>
        console.warn("[audio-cleanup]", error.code || error.name),
      );
      res.clearCookie("garden_session", {
        path: "/",
      });
      res.json({
        ok: true,
      });
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({
      error: "API route not found.",
    }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues[0]?.message || "Please check your input.",
      });
    if (error.type === "entity.too.large")
      return res.status(413).json({
        error:
          "This file or answer is too large. Record at most 60 seconds and keep uploads under 10 MB.",
      });
    if (error instanceof SyntaxError && "body" in error)
      return res.status(400).json({
        error: "The request could not be read.",
      });
    if (error.code === "23505")
      return res.status(409).json({
        error: "This change was already saved. Refresh and try again.",
      });
    if (!error.status)
      console.error(
        "[garden-api]",
        error.code || error.name || "internal_error",
      );
    res.status(error.status || 500).json({
      ...(error.code?.startsWith("provider_") ||
      error.code?.startsWith("guided_response_") || error.code?.startsWith("debate_")
        ? {
            code: error.code,
          }
        : {}),
      error: error.status
        ? error.message
        : "Something went wrong. Your saved work is safe; please try again.",
    });
  });
  const ready = (async () => {
    await db.ready.catch((error) => {
      error.code ||= "database_initialization";
      throw error;
    });
    await audioStorage.ready.catch((error) => {
      error.code ||= "storage_initialization";
      throw error;
    });
    // Local workers resume after a process restart; cloud work is recovered by leases.
    if (!cloud) {
      await db
        .prepare("UPDATE jobs SET status='queued' WHERE status='processing'")
        .run();
      for (const row of await db
        .prepare("SELECT id FROM jobs WHERE status='queued'")
        .all())
        schedule(row.id);
    }
    if (!cloud) await cleanupAudio();
    await db.prepare("DELETE FROM auth_sessions WHERE expires_at<?").run(now());
  })();
  // Preserve the rejected ready promise for request middleware without an unhandled rejection.
  ready.catch((error) => {
    const reason = /migrations have not been applied/.test(error.message)
      ? "schema_missing"
      : /timeout|timed out/i.test(error.message)
        ? "connection_timeout"
        : /password must be a string/i.test(error.message)
          ? "invalid_database_credential_type"
          : /Connection terminated/i.test(error.message)
            ? "connection_terminated"
            : "initialization_failed";
    // Log diagnostic categories and source frames, never connection URLs,
    // provider responses, credentials or learner content.
    console.error("[garden-startup]", error.code || error.name, reason,
      String(error.stack || "").split("\n").slice(1, 4).join("\n"));
  });
  return {
    app,
    ready,
    providerStatus: providerStatus(providerConfig),
    db: db.raw || db,
    persistence: db,
    runJob,
    runJobs: async () => {
      for (const j of await db
        .prepare("SELECT id FROM jobs WHERE status='queued'")
        .all())
        await runJob(j.id);
      await readingSpeech.recover(100);
    },
    close: async () => {
      closed = true;
      guidedResponses.close();
      await readingSpeech.close();
      for (const timer of timers) clearTimeout(timer);
      workerScope.emitDestroy();
      await db.close();
    },
  };
}
