import { useTheme } from "../theme/ThemeProvider";
import React, { useState } from "react";
import { View, Text, ScrollView, useWindowDimensions } from "react-native";
import { Button, Field, ErrorNote } from "../components/ui";
import { BridgingMindsMark } from "../components/art";
import { WelcomeArt } from "../components/WelcomeArt";
import Head from "expo-router/head";
import { MotionView } from "../components/Motion";
import { api, storeToken } from "../lib/api";
import { AppState } from "../types";
const topics = [
  "Technology",
  "Science",
  "Society",
  "Culture",
  "Environment",
  "Business",
];
export function Onboarding({
  state,
  onDone,
}: {
  state: AppState | null;
  onDone: () => Promise<void>;
}) {
  const { C, T } = useTheme();

  const { width } = useWindowDimensions();
  const [step, setStep] = useState(state ? "preferences" : "welcome");
  const [auth, setAuth] = useState<"register" | "login">("register");
  const [name, setName] = useState(state?.profile.displayName || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [interests, setInterests] = useState<string[]>(
    state?.profile.interests?.length
      ? state.profile.interests
      : ["Science", "Technology"],
  );
  const [goal, setGoal] = useState("Articulation");
  const [timezone, setTimezone] = useState(
    state?.profile.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function guest() {
    await run(async () => {
      const r = await api("/auth/guest", { method: "POST", body: {} });
      await storeToken(r.token);
      setStep("preferences");
    });
  }
  async function authenticate() {
    await run(async () => {
      const r = await api("/auth/" + auth, {
        method: "POST",
        body: { email, password, displayName: name || "Curious mind" },
      });
      await storeToken(r.token);
      if (r.profile.onboardingComplete) await onDone();
      else setStep("preferences");
    });
  }
  async function finish() {
    await run(async () => {
      await api("/me", {
        method: "PATCH",
        body: {
          displayName: name.trim() || "Curious mind",
          interests,
          goal: goal.toLowerCase(),
          timezone: timezone.trim(),
          onboardingComplete: true,
          consent: { recording: false, analytics: false },
        },
      });
      await onDone();
    });
  }
  return (
    <ScrollView
      role="main"
      style={{ flex: 1, backgroundColor: C.cream }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <Head>
        <title>Welcome · BridgingMinds</title>
      </Head>
      <View
        style={{
          flex: 1,
          flexDirection: width > 800 ? "row" : "column",
          minHeight: width > 800 ? 700 : undefined,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: C.accentSurface,
            padding: width > 800 ? 55 : 26,
            justifyContent: "center",
            gap: 20,
          }}
        >
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <BridgingMindsMark />
            <Text style={[T.h2, { fontSize: 22 }]}>BridgingMinds</Text>
          </View>
          <MotionView
            distance={10}
            duration={220}
            testID="welcome-avatar-motion"
          >
            <WelcomeArt />
          </MotionView>
        </View>
        <View
          style={{
            flex: 1,
            padding: width > 800 ? 65 : 28,
            justifyContent: "center",
            gap: 23,
            maxWidth: 750,
          }}
        >
          {step === "welcome" ? (
            <>
              <Text role="heading" aria-level={1} style={T.display}>
                Grow your point of view.
              </Text>
              <Text style={[T.body, { color: C.muted }]}>
                Explore an idea. Find your words. Try a new perspective.
              </Text>
              <Text style={[T.small, { color: C.forest }]}>
                Build your voice, earn Coins and make your avatar your own.
              </Text>
              <Button
                label="Try as guest"
                onPress={guest}
                loading={busy}
                style={{ alignSelf: "stretch", marginTop: 8 }}
              />
              <Button
                label="Create an account"
                variant="secondary"
                onPress={() => {
                  setAuth("register");
                  setStep("auth");
                }}
                style={{ alignSelf: "stretch" }}
              />
              <Button
                label="Sign in"
                variant="ghost"
                onPress={() => {
                  setAuth("login");
                  setStep("auth");
                }}
              />
              <Text style={T.small}>
                No account needed to start. Create one later to keep your
                progress.
              </Text>
            </>
          ) : step === "auth" ? (
            <>
              <Button
                label="Back"
                variant="ghost"
                icon="arrow-left"
                onPress={() => setStep("welcome")}
              />
              <Text role="heading" aria-level={1} style={T.title}>
                {auth === "register" ? "Create an account" : "Sign in"}
              </Text>
              {auth === "register" && (
                <Field
                  label="Your name"
                  placeholder="Name"
                  value={name}
                  onChangeText={setName}
                />
              )}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 10 characters"
                secureTextEntry
              />
              <Button
                label={auth === "register" ? "Create account" : "Sign in"}
                loading={busy}
                disabled={!email || password.length < 10}
                onPress={authenticate}
              />
              <Button
                variant="ghost"
                label={
                  auth === "register"
                    ? "Have an account? Sign in"
                    : "New here? Create account"
                }
                onPress={() =>
                  setAuth(auth === "register" ? "login" : "register")
                }
              />
            </>
          ) : (
            <>
              <Text role="heading" aria-level={1} style={T.title}>
                Choose your interests
              </Text>
              <Text style={[T.body, { color: C.muted }]}>
                Select 2–5 topics.
              </Text>
              <Field
                label="Your name"
                value={name}
                onChangeText={setName}
                placeholder="Curious mind"
              />
              <Field
                label="Your time zone"
                value={timezone}
                onChangeText={setTimezone}
                placeholder="Asia/Singapore"
                autoCapitalize="none"
              />
              <Text style={T.small}>
                Use an IANA time zone, such as Asia/Singapore. Your local
                calendar sets the daily workout boundary.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                {topics.map((topic) => (
                  <Button
                    key={topic}
                    label={topic}
                    selected={interests.includes(topic)}
                    icon={interests.includes(topic) ? "check" : "plus"}
                    variant={
                      interests.includes(topic) ? "primary" : "secondary"
                    }
                    onPress={() =>
                      setInterests((prev) =>
                        prev.includes(topic)
                          ? prev.filter((x) => x !== topic)
                          : prev.length < 5
                            ? [...prev, topic]
                            : prev,
                      )
                    }
                  />
                ))}
              </View>
              <Text style={[T.h3, { marginTop: 8 }]}>Practice goal</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Articulation", "Reasoning", "Knowledge", "Confidence"].map(
                  (g) => (
                    <Button
                      key={g}
                      label={g}
                      selected={goal === g}
                      variant={goal === g ? "primary" : "secondary"}
                      onPress={() => setGoal(g)}
                    />
                  ),
                )}
              </View>
              <Button
                label="Start learning"
                icon="arrow-right"
                loading={busy}
                disabled={interests.length < 2 || interests.length > 5}
                onPress={finish}
                style={{ alignSelf: "stretch", marginTop: 10 }}
              />
              <Text style={[T.small, { fontSize: 11 }]}>
                Responses and progress are saved on this server. Requested
                transcription uses the configured provider. Export or delete
                your data in Settings.
              </Text>
            </>
          )}
          <ErrorNote message={error} />
        </View>
      </View>
    </ScrollView>
  );
}
