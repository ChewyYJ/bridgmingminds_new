import React, { useEffect, useState } from "react";
import { View, Text, Switch, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { C, T, Card, Button, Field, ErrorNote, Tag } from "../components/ui";
import { AppState } from "../types";
import { api, clearDrafts, storeToken } from "../lib/api";

function AIStatus() {
  const [status, setStatus] = useState<{
    mode: "local" | "openai" | "configuration_error";
    issues: string[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ ai: NonNullable<typeof status> }>("/health", {
      signal: controller.signal,
    })
      .then((health) => {
        if (!controller.signal.aborted) setStatus(health.ai);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [version]);
  return (
    <View style={{ gap: 8 }} testID="ai-status">
      <Text style={T.h3} accessibilityLiveRegion="polite">
        {failed
          ? "Status unavailable"
          : !status
            ? "Checking AI setup…"
            : status.mode === "openai"
              ? "AI configured"
              : status.mode === "configuration_error"
                ? "AI setup needs attention"
                : "Local coaching"}
      </Text>
      {status?.mode === "openai" && (
        <Text style={T.small}>
          Your first AI request will check account access.
        </Text>
      )}
      {status?.mode === "local" && (
        <Text style={T.small}>
          Connect AI for response ratings and transcription.
        </Text>
      )}
      {status?.mode === "configuration_error" && (
        <ErrorNote
          message={status.issues[0] || "Check the server’s AI configuration."}
        />
      )}
      <Button
        label="Refresh AI status"
        variant="ghost"
        disabled={!failed && !status}
        onPress={() => {
          setStatus(null);
          setFailed(false);
          setVersion((value) => value + 1);
        }}
      />
    </View>
  );
}

export function Settings({
  state,
  refresh,
  onLogout,
}: {
  state: AppState;
  refresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const [name, setName] = useState(state.profile.displayName),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    await run(async () => {
      const data = await api("/export");
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-bridgingminds.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new File(Paths.cache, "my-bridgingminds.json");
        file.create({ overwrite: true });
        file.write(json);
        await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
      }
      setNotice("Export ready. Audio files are not included.");
    });
  }
  return (
    <View style={{ gap: 23, maxWidth: 850 }}>
      <View style={{ gap: 8 }}>
        <Text style={T.title}>Settings</Text>
      </View>
      <ErrorNote message={error} />
      {!!notice && (
        <Card style={{ backgroundColor: C.sage, padding: 16 }}>
          <Text accessibilityLiveRegion="polite" style={T.body}>
            {notice}
          </Text>
        </Card>
      )}
      <Card style={{ gap: 17 }}>
        <Text style={T.h2}>Profile</Text>
        <Tag>{state.profile.isGuest ? "Guest" : "Account"}</Tag>
        <Field label="Display name" value={name} onChangeText={setName} />
        <Text style={T.small}>
          {state.profile.email ||
            "Guest progress is saved here and linked to this device."}
        </Text>
        <Button
          label="Save profile"
          disabled={!name.trim()}
          loading={busy}
          onPress={() =>
            run(async () => {
              await api("/me", {
                method: "PATCH",
                body: { displayName: name.trim() },
              });
              await refresh();
              setNotice("Profile saved.");
            })
          }
        />
      </Card>
      {state.profile.isGuest && (
        <Card style={{ gap: 16, backgroundColor: "#F0F2E7" }}>
          <Text style={T.h2}>Create an account</Text>
          <Text style={T.body}>
            Keep your progress and sign in on other devices using this server.
          </Text>
          <Field
            label="Account email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Account password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 10 characters"
            secureTextEntry
          />
          <Button
            label="Create account & keep progress"
            disabled={!email || password.length < 10}
            loading={busy}
            onPress={() =>
              run(async () => {
                const r = await api("/auth/register", {
                  method: "POST",
                  body: { email, password, displayName: name },
                });
                await storeToken(r.token);
                await refresh();
                setPassword("");
                setNotice("Account created. Your progress is saved.");
              })
            }
          />
        </Card>
      )}
      <Card style={{ gap: 19 }}>
        <Text style={T.h2}>Privacy & display</Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 15,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>Reduce motion</Text>
            <Text style={T.small}>Limit animations.</Text>
          </View>
          <Switch
            accessibilityLabel="Reduce motion"
            value={!!state.profile.reducedMotion}
            disabled={busy}
            trackColor={{ true: C.forest, false: "#CDD3C5" }}
            onValueChange={(v) =>
              run(async () => {
                await api("/me", {
                  method: "PATCH",
                  body: { reducedMotion: v },
                });
                await refresh();
              })
            }
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 15,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>Private recording storage</Text>
            <Text style={T.small}>
              Save recordings for playback and optional transcription. Sent
              voice messages are shared with your debate partner. Recordings
              expire after 30 days.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Private recording storage"
            value={!!state.profile.consent?.recording}
            disabled={busy}
            trackColor={{ true: C.forest, false: "#CDD3C5" }}
            onValueChange={(v) =>
              run(async () => {
                await api("/me", {
                  method: "PATCH",
                  body: { consent: { recording: v } },
                });
                await refresh();
              })
            }
          />
        </View>
        <Text style={[T.small, { lineHeight: 21 }]}>
          Microphone access is requested when you record. Configured AI receives
          submitted responses and recordings you request to transcribe. No
          analytics tracking.
        </Text>
      </Card>
      <Card style={{ gap: 15 }}>
        <Text style={T.h2}>Feedback</Text>
        <AIStatus />
        <Text style={[T.small, { lineHeight: 21 }]}>
          Each activity has its own research-informed criteria. AI ratings are
          provisional, not validated measures of ability. Local coaching offers
          revision prompts without scores.
        </Text>
        <Text style={T.small}>
          Voice delivery is not scored. Report concerns from any result.
        </Text>
      </Card>
      <Card style={{ gap: 15 }}>
        <Text style={T.h2}>Your data</Text>
        <Text style={T.body}>
          Export your profile, practice, journal, conversations and garden as
          JSON. Audio files are excluded.
        </Text>
        <Button
          label="Export my data"
          icon="download"
          variant="secondary"
          loading={busy}
          onPress={exportData}
        />
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() =>
            run(async () => {
              await api("/auth/logout", { method: "POST", body: {} });
              await clearDrafts();
              await storeToken(null);
              onLogout();
            })
          }
        />
        {state.profile.isGuest && (
          <Text style={T.small}>
            Create an account before signing out to keep access to guest
            progress.
          </Text>
        )}
        <View
          style={{ height: 1, backgroundColor: C.border, marginVertical: 5 }}
        />
        <Text style={[T.h3, { color: "#9B5950" }]}>
          Delete account and data
        </Text>
        <Text style={T.small}>
          Permanently delete your account, practice, journal, recordings and
          garden from this server. Friend debates close and your messages are
          removed. Your partner’s messages and any copies saved elsewhere
          remain.
        </Text>
        {showDelete ? (
          <>
            <Field
              label="Type DELETE to confirm"
              value={confirm}
              onChangeText={setConfirm}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Button
                label="Permanently delete my data"
                disabled={confirm !== "DELETE"}
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await api("/account", { method: "DELETE" });
                    await clearDrafts();
                    await storeToken(null);
                    onLogout();
                  })
                }
              />
              <Button
                label="Keep my garden"
                variant="secondary"
                onPress={() => {
                  setShowDelete(false);
                  setConfirm("");
                }}
              />
            </View>
          </>
        ) : (
          <Button
            label="Delete personal data"
            variant="ghost"
            onPress={() => setShowDelete(true)}
          />
        )}
      </Card>
    </View>
  );
}
