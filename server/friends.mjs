import { randomUUID, randomInt } from "node:crypto";
import { z } from "zod";
import { transaction } from "./database.mjs";
import { prompts } from "./content.mjs";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const now = () => new Date().toISOString();
const later = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const requestKeySchema = z
  .string()
  .min(8)
  .max(100)
  .refine((value) => value.isWellFormed(), "Use a valid request identifier.");
const createSchema = z
  .object({
    promptId: z.string().min(1).max(100).optional(),
    topic: z.string().min(1).max(80).optional(),
    position: z.enum(["for", "against"]),
    rounds: z.number().int().min(2).max(3),
    idempotencyKey: requestKeySchema,
  })
  .strict();
const joinSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
        "Use the six-character invite code.",
      ),
  })
  .strict();
const turnSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(
        10,
        "Add at least 10 characters so your friend can follow your idea.",
      )
      .max(5000)
      // SQLite replaces isolated UTF-16 surrogates, which would corrupt the
      // saved message and prevent the exact request from being retried safely.
      .refine(
        (value) => value.isWellFormed(),
        "Use valid Unicode text for your message.",
      ),
    audioId: z.string().uuid().optional(),
    expectedTurn: z.number().int().min(0).max(5),
    idempotencyKey: requestKeySchema,
  })
  .strict();

/** Two-person rooms contain only actual participant messages, never generated turns. */
export function installFriends(
  app,
  { db, wrap, limit, getUser, assertOwnAudio },
) {
  async function lockActiveUser(userId) {
    await db.lockUser(userId);
    if (!(await getUser(userId)))
      throw fail(
        401,
        "This account is no longer available. Please sign in again.",
      );
  }
  async function expire() {
    const cutoff = now();
    const expired = await db
      .prepare(
        "SELECT id FROM friend_rooms WHERE status IN ('waiting','active') AND expires_at<=? ORDER BY id",
      )
      .all(cutoff);
    if (!expired.length) return;
    await transaction(db, async () => {
      // Match account-removal lock order when several rooms expire together.
      for (const { id } of expired) {
        await db.lockRoom(id);
        await db
          .prepare(
            "UPDATE friend_rooms SET status='closed',close_reason='expired',updated_at=? WHERE id=? AND status IN ('waiting','active') AND expires_at<=?",
          )
          .run(cutoff, id, cutoff);
      }
    });
  }
  async function rowFor(roomId, userId) {
    const room = await db
      .prepare(
        "SELECT r.* FROM friend_rooms r JOIN friend_members m ON m.room_id=r.id WHERE r.id=? AND m.user_id=?",
      )
      .get(roomId, userId);
    if (!room)
      throw fail(
        404,
        "Friend debate not found. Only its participants can open it.",
      );
    return room;
  }
  async function present(room) {
    const members = await db
      .prepare(
        "SELECT m.*,u.profile FROM friend_members m LEFT JOIN users u ON m.user_id=u.id WHERE m.room_id=? ORDER BY m.seat",
      )
      .all(room.id);
    const participants = members.map((m) => ({
      id: m.user_id || `deleted:${m.id}`,
      displayName: m.profile
        ? JSON.parse(m.profile).displayName
        : "Deleted gardener",
      position: m.position,
    }));
    const savedTurns = await db
      .prepare(
        "SELECT t.* FROM friend_turns t WHERE room_id=? ORDER BY turn_index",
      )
      .all(room.id);
    const turns = savedTurns.map((t) => ({
      id: t.id,
      userId: t.user_id || `deleted:${t.member_id}`,
      text: t.text,
      ...(t.audio_id ? { audioId: t.audio_id } : {}),
      round: Math.floor(t.turn_index / 2) + 1,
      createdAt: t.created_at,
    }));
    return {
      id: room.id,
      code: room.code,
      prompt: JSON.parse(room.prompt),
      rounds: Number(room.rounds),
      status: room.status,
      participants,
      turns,
      nextUserId:
        room.status === "active"
          ? participants[turns.length % 2]?.id || null
          : null,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      expiresAt: room.expires_at,
      ...(room.close_reason ? { closeReason: room.close_reason } : {}),
    };
  }
  async function listForUser(userId) {
    await expire();
    const rooms = await db
      .prepare(
        "SELECT r.* FROM friend_rooms r JOIN friend_members m ON r.id=m.room_id WHERE m.user_id=? ORDER BY r.updated_at DESC",
      )
      .all(userId);
    return Promise.all(rooms.map(present));
  }
  async function canAccessAudio(audioId, userId) {
    return !!(await db
      .prepare(
        "SELECT 1 FROM friend_turns t JOIN friend_members m ON t.room_id=m.room_id WHERE t.audio_id=? AND m.user_id=? LIMIT 1",
      )
      .get(audioId, userId));
  }
  // Called inside the account-deletion transaction, before deleting the user.
  async function removeUser(userId) {
    await db.lockUser(userId);
    const rooms = await db
      .prepare(
        "SELECT room_id FROM friend_members WHERE user_id=? ORDER BY room_id",
      )
      .all(userId);
    // All room mutations take the user lock before the room lock. Stable room
    // order also avoids deadlocks when both participants delete their accounts.
    for (const { room_id } of rooms) await db.lockRoom(room_id);
    await db
      .prepare(
        "UPDATE friend_turns SET text='[Removed by author]',audio_id=NULL,request_key=NULL WHERE user_id=?",
      )
      .run(userId);
    for (const { room_id } of rooms)
      await db
        .prepare(
          "UPDATE friend_rooms SET status='closed',close_reason='participant_deleted',updated_at=?,create_key=? WHERE id=?",
        )
        .run(now(), randomUUID(), room_id);
    // Foreign keys anonymize membership and turn identities when users is deleted.
  }
  app.get(
    "/api/friends/rooms",
    wrap(async (req, res) => res.json(await listForUser(req.userId))),
  );
  app.post(
    "/api/friends/rooms",
    wrap(async (req, res) => {
      const input = createSchema.parse(req.body);
      await expire();
      const room = await transaction(db, async () => {
        await lockActiveUser(req.userId);
        const existing = await db
          .prepare(
            "SELECT * FROM friend_rooms WHERE creator_id=? AND create_key=?",
          )
          .get(req.userId, input.idempotencyKey);
        if (existing) return present(existing);
        await limit(`friend-create:${req.userId}`, 20, 3600000);
        let pool = prompts.filter((p) => p.mode === "debate");
        if (input.promptId) pool = pool.filter((p) => p.id === input.promptId);
        else if (input.topic)
          pool = pool.filter(
            (p) => p.category.toLowerCase() === input.topic.toLowerCase(),
          );
        if (!pool.length) throw fail(400, "Choose an available debate topic.");
        const id = randomUUID(),
          createdAt = now();
        const prompt = pool[randomInt(pool.length)];
        let inserted;
        do {
          const code = Array.from(
            { length: 6 },
            () => ALPHABET[randomInt(ALPHABET.length)],
          ).join("");
          inserted = await db
            .prepare(
              "INSERT INTO friend_rooms(id,code,creator_id,create_key,prompt,rounds,status,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO NOTHING",
            )
            .run(
              id,
              code,
              req.userId,
              input.idempotencyKey,
              JSON.stringify(prompt),
              input.rounds,
              "waiting",
              createdAt,
              createdAt,
              later(24),
            );
        } while (!Number(inserted.changes));
        await db
          .prepare("INSERT INTO friend_members VALUES(?,?,?,?,?)")
          .run(randomUUID(), id, req.userId, input.position, 0);
        return present(await rowFor(id, req.userId));
      });
      res.status(201).json(room);
    }),
  );
  app.post(
    "/api/friends/join",
    wrap(async (req, res) => {
      await limit(`friend-join:${req.userId}`, 12, 900000);
      await limit(`friend-join-ip:${req.ip}`, 30, 900000);
      const { code } = joinSchema.parse(req.body);
      await expire();
      res.json(
        await transaction(db, async () => {
          await lockActiveUser(req.userId);
          const invite = await db
            .prepare("SELECT * FROM friend_rooms WHERE code=?")
            .get(code);
          if (!invite)
            throw fail(404, "Invite code not found or no longer available.");
          await db.lockRoom(invite.id);
          const room = await db
            .prepare("SELECT * FROM friend_rooms WHERE id=?")
            .get(invite.id);
          if (!room)
            throw fail(404, "Invite code not found or no longer available.");
          if (
            await db
              .prepare(
                "SELECT id FROM friend_members WHERE room_id=? AND user_id=?",
              )
              .get(room.id, req.userId)
          )
            return present(room);
          if (room.status !== "waiting" || room.expires_at <= now())
            throw fail(
              409,
              "This invite is no longer available. Ask your friend to create another room.",
            );
          const creator = await db
            .prepare("SELECT * FROM friend_members WHERE room_id=? AND seat=0")
            .get(room.id);
          if (!creator?.user_id || !(await getUser(creator.user_id)))
            throw fail(409, "This invite is no longer available.");
          await db
            .prepare("INSERT INTO friend_members VALUES(?,?,?,?,?)")
            .run(
              randomUUID(),
              room.id,
              req.userId,
              creator.position === "for" ? "against" : "for",
              1,
            );
          await db
            .prepare(
              "UPDATE friend_rooms SET status='active',updated_at=?,expires_at=? WHERE id=?",
            )
            .run(now(), later(168), room.id);
          return present(await rowFor(room.id, req.userId));
        }),
      );
    }),
  );
  app.get(
    "/api/friends/rooms/:id",
    wrap(async (req, res) => {
      await expire();
      res.json(await present(await rowFor(req.params.id, req.userId)));
    }),
  );
  app.post(
    "/api/friends/rooms/:id/turn",
    wrap(async (req, res) => {
      const input = turnSchema.parse(req.body);
      await expire();
      res.json(
        await transaction(db, async () => {
          await lockActiveUser(req.userId);
          await db.lockRoom(req.params.id);
          const room = await rowFor(req.params.id, req.userId);
          const duplicate = await db
            .prepare(
              "SELECT * FROM friend_turns WHERE room_id=? AND user_id=? AND request_key=?",
            )
            .get(room.id, req.userId, input.idempotencyKey);
          if (duplicate) {
            if (
              duplicate.text !== input.text ||
              (duplicate.audio_id || undefined) !== input.audioId ||
              Number(duplicate.turn_index) !== input.expectedTurn
            )
              throw fail(
                409,
                "This request identifier already belongs to a different turn. Refresh your debate.",
              );
            return present(room);
          }
          if (room.status !== "active" || room.expires_at <= now())
            throw fail(
              409,
              room.status === "waiting"
                ? "Wait for your friend to join before speaking."
                : "This debate has ended. Create another room to continue.",
            );
          const turnCount = Number(
            (
              await db
                .prepare("SELECT COUNT(*) n FROM friend_turns WHERE room_id=?")
                .get(room.id)
            ).n,
          );
          if (input.expectedTurn !== turnCount)
            throw fail(
              409,
              "The debate has moved on. Refresh to read the latest turn.",
            );
          const speaker = await db
            .prepare("SELECT * FROM friend_members WHERE room_id=? AND seat=?")
            .get(room.id, turnCount % 2);
          if (speaker?.user_id !== req.userId)
            throw fail(
              409,
              "It is your friend’s turn. Read their reply before sending yours.",
            );
          if (input.audioId) await assertOwnAudio(input.audioId, req.userId);
          await db
            .prepare(
              "INSERT INTO friend_turns(id,room_id,member_id,user_id,turn_index,text,audio_id,request_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              room.id,
              speaker.id,
              req.userId,
              turnCount,
              input.text,
              input.audioId || null,
              input.idempotencyKey,
              now(),
            );
          await db
            .prepare("UPDATE friend_rooms SET status=?,updated_at=? WHERE id=?")
            .run(
              turnCount + 1 === room.rounds * 2 ? "completed" : "active",
              now(),
              room.id,
            );
          return present(await rowFor(room.id, req.userId));
        }),
      );
    }),
  );
  app.post(
    "/api/friends/rooms/:id/close",
    wrap(async (req, res) => {
      await expire();
      res.json(
        await transaction(db, async () => {
          await lockActiveUser(req.userId);
          await db.lockRoom(req.params.id);
          const room = await rowFor(req.params.id, req.userId);
          if (["waiting", "active"].includes(room.status))
            await db
              .prepare(
                "UPDATE friend_rooms SET status='closed',close_reason='participant_closed',updated_at=? WHERE id=?",
              )
              .run(now(), room.id);
          return present(await rowFor(room.id, req.userId));
        }),
      );
    }),
  );
  return { listForUser, canAccessAudio, removeUser };
}
