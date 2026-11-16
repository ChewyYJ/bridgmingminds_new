import { useTheme } from "../theme/ThemeProvider";
import React, { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { Card, Button, Tag, Icon } from "../components/ui";
import { AppState, Attempt, Mode } from "../types";
import { modeNames } from "./Dashboard";
import { PracticeWeek } from "../components/PracticeWeek";
import { WordBloomProgress } from "../components/WordBloom";
import { LearnerProfile } from "../components/LearnerProfile";
import { getThoughtGuide } from "../../shared/thought-guide.mjs";
import { AvatarPanelHeader } from "../role3/AvatarPanelHeader";
const dimensions = [
  ["grounded", "G", "Grounded", "#91AA77"],
  ["reasoned", "R", "Reasoned", "#A995C2"],
  ["organised", "O", "Organised", "#D8AD80"],
  ["well_rounded", "W", "Well-rounded", "#8EAFB0"],
];
export function ProfileScreen({
  state,
  openAttempt,
  openSettings,
  openAvatar,
  start,
}: {
  state: AppState;
  openAttempt: (a: Attempt) => void;
  openSettings: () => void;
  openAvatar?: () => void;
  start: (m: Mode) => void;
}) {
  const { C, T } = useTheme();

  const [mode, setMode] = useState<Mode>("spin_speak");
  const [range, setRange] = useState("30 days");
  const [now] = useState(() => Date.now());
  const completed = state.attempts.filter((a) => a.status === "completed");
  const latest = [...completed]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .find((a) => a.evaluation);
  const filtered = completed.filter(
    (a) =>
      a.mode === mode &&
      (range === "All time" ||
        Date.parse(a.createdAt) >
          now - (range === "7 days" ? 7 : 30) * 86400000),
  );
  const groups = new Map<string, Attempt[]>();
  for (const a of filtered.filter(
    (item) =>
      item.evaluation?.provider === "openai" && !item.evaluation.assessment,
  )) {
    const key = [
      a.prompt,
      a.evaluation?.rubric_version,
      a.evaluation?.model_version,
      a.evaluation?.prompt_template_version,
      a.evaluation?.provider,
    ].join("|");
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  const comparable =
    Array.from(groups.values()).sort((a, b) => b.length - a.length)[0] || [];
  const show = comparable.length >= 3;
  const plot = comparable.slice(0, 7).reverse();
  const badges = (state.gamification?.achievements || []).map(
    (achievement) => ({
      icon: "award",
      title: achievement.title,
      copy: achievement.description,
      earned: !!achievement.earnedAt,
    }),
  );
  return (
    <View style={{ gap: 24 }}>
      <AvatarPanelHeader
        title="My profile"
        subtitle={`${state.profile.displayName} · Level ${state.gamification?.level || 1}`}
        onSettings={openSettings}
      />
      {openAvatar && (
        <View
          style={{
            flexDirection: "row",
            padding: 3,
            backgroundColor: C.cream,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Avatar"
            accessibilityState={{ selected: false }}
            onPress={openAvatar}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[T.small, { color: C.ink, fontSize: 14 }]}>
              Avatar
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Progress"
            accessibilityState={{ selected: true }}
            {...(Platform.OS === "web" ? { "aria-pressed": true } : {})}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9,
              backgroundColor: C.forest,
            }}
          >
            <Text
              style={[
                T.small,
                { color: C.paper, fontFamily: "DMBold", fontSize: 14 },
              ]}
            >
              Progress
            </Text>
          </Pressable>
        </View>
      )}
      <Text style={T.h2}>Your progress</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {[
          [
            completed.length + (state.readAloudAttempts?.length || 0),
            "Practices completed",
            "book-open",
          ],
          [
            state.practiceWeek?.days.length || 0,
            "Practice days this week",
            "sun",
          ],
          [
            completed.filter((a) => a.retryOf).length,
            "Ideas revisited",
            "refresh-cw",
          ],
          [state.xp, "Practice XP", "feather"],
        ].map(([n, l, icon]) => (
          <Card key={String(l)} style={{ flex: 1, minWidth: 140, gap: 12 }}>
            <Icon name={String(icon)} />
            <Text style={[T.title, { fontSize: 31 }]}>{n}</Text>
            <Text style={T.small}>{l}</Text>
          </Card>
        ))}
      </View>
      <PracticeWeek week={state.practiceWeek} />
      {state.profile.dailyWorkout ? <WordBloomProgress /> : null}
      {state.profile.dailyWorkout ? (
        <LearnerProfile start={() => start("spin_speak")} />
      ) : null}
      {state.dailyWorkout ? (
        <Card style={{ gap: 10 }}>
          <Text style={T.h2}>
            Daily workout · {state.dailyWorkout.completed}/2
          </Text>
          <Text style={T.body}>
            {state.dailyWorkout.streak.securedToday
              ? "Today’s streak is secured."
              : "One eligible learning activity keeps your streak going. Both daily activities together earn 5 Coins."}
          </Text>
          <Text style={T.small}>
            {state.dailyWorkout.streak.current} day streak · longest{" "}
            {state.dailyWorkout.streak.longest} · {state.dailyWorkout.timezone}.
            XP recognises participation; it does not measure mastery.
          </Text>
        </Card>
      ) : null}
      {!!state.readAloudAttempts?.length ? (
        <Card style={{ gap: 12 }}>
          <Text style={T.h2}>Read Aloud history</Text>
          <Text style={T.small}>
            Self-review observations · no acoustic scores or mastery claims.
          </Text>
          {state.readAloudAttempts.slice(0, 10).map((reading) => (
            <View key={reading.id} style={{ gap: 4 }}>
              <Text style={T.h3}>{reading.passage.title}</Text>
              <Text style={T.small}>
                {new Date(reading.createdAt).toLocaleDateString(undefined, {
                  timeZone: state.profile.timezone,
                })}
              </Text>
              <Text selectable style={T.body}>
                {reading.text}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
      <Card style={{ gap: 19 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Text style={T.h2}>Practice ratings</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["spin_speak", "debate", "read_reflect"] as Mode[]).map((m) => (
            <Button
              key={m}
              label={modeNames[m]}
              variant={mode === m ? "primary" : "secondary"}
              onPress={() => setMode(m)}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {["7 days", "30 days", "All time"].map((r) => (
            <Button
              key={r}
              label={r}
              variant={range === r ? "secondary" : "ghost"}
              onPress={() => setRange(r)}
            />
          ))}
        </View>
        {show ? (
          <>
            <Text style={[T.small, { color: C.forest }]}>
              Legacy ratings · same prompt, evaluator and coaching template ·{" "}
              {comparable.length} comparable attempts
            </Text>
            <Text style={T.small}>{comparable[0].prompt}</Text>
            <Svg
              width="100%"
              height={180}
              viewBox="0 0 620 180"
              accessibilityLabel="Legacy GROW practice ratings across comparable attempts, not a measure of ability"
            >
              {[1, 2, 3, 4].map((level) => (
                <React.Fragment key={level}>
                  <Line
                    x1={30}
                    x2={600}
                    y1={160 - (level - 1) * 46}
                    y2={160 - (level - 1) * 46}
                    stroke={C.border}
                  />
                  <SvgText
                    x={5}
                    y={165 - (level - 1) * 46}
                    fontSize={12}
                    fill={C.muted}
                  >
                    {level}
                  </SvgText>
                </React.Fragment>
              ))}
              {dimensions.map(([key, _, label, color]) => {
                const pts = plot
                  .map((a, i) => ({
                    a,
                    x: 40 + (i * 540) / Math.max(1, plot.length - 1),
                    level: a.evaluation?.dimensions.find((d) => d.key === key)
                      ?.level,
                  }))
                  .filter((p) => p.level != null);
                return (
                  <React.Fragment key={key}>
                    <Polyline
                      points={pts
                        .map((p) => `${p.x},${160 - ((p.level || 1) - 1) * 46}`)
                        .join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                    />
                    {pts.map((p, i) => (
                      <Circle
                        key={i}
                        cx={p.x}
                        cy={160 - ((p.level || 1) - 1) * 46}
                        r={6}
                        fill={color}
                        onPress={() => openAttempt(p.a)}
                        accessibilityLabel={`${label} level ${p.level}, open attempt`}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
            </Svg>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {plot.map((a, i) => (
                <Button
                  key={a.id}
                  label={`Attempt ${i + 1}`}
                  variant="ghost"
                  onPress={() => openAttempt(a)}
                />
              ))}
            </View>
          </>
        ) : (
          <View
            style={{
              padding: 26,
              borderRadius: 15,
              backgroundColor: C.quiet,
              alignItems: "center",
              gap: 12,
            }}
          >
            <Icon name="bar-chart-2" size={34} color="#A0B08B" />
            <Text style={T.h3}>Feedback stays with each response</Text>
            <Text
              style={[
                T.body,
                {
                  fontSize: 13,
                  textAlign: "center",
                  color: C.muted,
                  maxWidth: 480,
                },
              ]}
            >
              New provisional ratings and local coaching are excluded from
              charts. Older ratings appear only with 3 comparable attempts using
              the same prompt and evaluator versions.
            </Text>
            <Text style={T.small}>
              {filtered.length} completed in this mode · {comparable.length} on
              one comparable legacy prompt
            </Text>
          </View>
        )}
        {show && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
            {dimensions.map(([key, initial, label, color]) => (
              <View
                key={key}
                style={{
                  flex: 1,
                  minWidth: 100,
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 31,
                    height: 31,
                    backgroundColor: color + "30",
                    borderRadius: 9,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={[T.h3, { color, fontSize: 14 }]}>{initial}</Text>
                </View>
                <Text style={T.small}>{label}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={[T.small, { fontSize: 11 }]}>
          Practice ratings are unvalidated. They do not measure ability or
          demonstrate improvement.
        </Text>
      </Card>
      <View style={{ gap: 14 }}>
        <Text style={T.h2}>Milestones</Text>
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          {badges.map((b) => (
            <Card
              key={b.title}
              style={{
                flex: 1,
                minWidth: 150,
                alignItems: "center",
                gap: 10,
                backgroundColor: b.earned ? "#F4F3E6" : C.quiet,
              }}
            >
              <View
                style={{
                  borderRadius: 40,
                  padding: 16,
                  backgroundColor: b.earned ? C.yellow : C.sage,
                }}
              >
                <Icon
                  name={b.icon}
                  color={b.earned ? C.orange : "#ABB2A2"}
                  size={23}
                />
              </View>
              <Text style={[T.h3, { fontSize: 14 }]}>{b.title}</Text>
              <Text style={[T.small, { textAlign: "center", fontSize: 11 }]}>
                {b.copy}
              </Text>
              <Tag color={b.earned ? C.sage : C.sage}>
                {b.earned ? "Earned" : "Not yet"}
              </Tag>
            </Card>
          ))}
        </View>
      </View>
      <View style={{ gap: 15 }}>
        <Text style={T.h2}>Practice history</Text>
        {state.attempts.length === 0 ? (
          <Card style={{ gap: 15 }}>
            <Text style={T.body}>No saved practice yet.</Text>
            <Button
              label="Try your first practice"
              onPress={() => start("spin_speak")}
            />
          </Card>
        ) : (
          state.attempts.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`View practice: ${a.prompt}`}
              onPress={() => openAttempt(a)}
              style={{
                padding: 20,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.paper,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
              }}
            >
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor:
                    a.mode === "debate"
                      ? C.lilac
                      : a.mode === "read_reflect"
                        ? C.peach
                        : C.sage,
                }}
              >
                <Icon
                  name={
                    a.mode === "spin_speak"
                      ? "mic"
                      : a.mode === "debate"
                        ? "message-circle"
                        : "book-open"
                  }
                />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={[T.small, { fontSize: 10 }]}>
                  {modeNames[a.mode]} ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()}{" "}
                  {a.retryOf ? "· Retry" : ""}
                </Text>
                <Text numberOfLines={2} style={[T.h3, { fontSize: 14 }]}>
                  {a.prompt}
                </Text>
                <Text style={T.small}>
                  {a.status === "completed"
                    ? "Feedback ready"
                    : a.status === "failed"
                      ? "Feedback failed · response saved"
                      : a.status === "draft"
                        ? "Saved response"
                        : `Evaluation ${a.status}`}
                </Text>
              </View>
              <Icon name="arrow-right" size={17} />
            </Pressable>
          ))
        )}
      </View>
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Icon name="edit-3" />
          <Text style={T.h2}>Thought journal</Text>
        </View>
        {state.journal.length ? (
          state.journal.map((j) => (
            <Pressable
              key={j.id}
              accessibilityRole="button"
              onPress={() => {
                const a = state.attempts.find((a) => a.id === j.attemptId);
                if (a) openAttempt(a);
              }}
              style={{
                paddingVertical: 15,
                borderTopWidth: 1,
                borderColor: C.border,
                gap: 7,
              }}
            >
              <Text style={T.small}>
                {new Date(j.createdAt).toLocaleDateString()}
              </Text>
              <Text style={T.body} numberOfLines={4}>
                {j.body}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={[T.body, { color: C.muted, fontSize: 14 }]}>
            Saved reading reflections appear here.
          </Text>
        )}
      </Card>
      <Card style={{ backgroundColor: C.sage, gap: 12 }}>
        <Text style={T.h3}>Next practice</Text>
        <Text style={T.body}>
          {latest
            ? getThoughtGuide(latest.mode, latest.evaluation)[0].question
            : "What is one idea you want to explore?"}
        </Text>
        <Button
          label={latest ? "Review latest practice" : "Start practice"}
          onPress={() => (latest ? openAttempt(latest) : start("spin_speak"))}
        />
      </Card>
    </View>
  );
}
