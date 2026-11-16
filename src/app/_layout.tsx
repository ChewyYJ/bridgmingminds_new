import { ThemeProvider, useTheme } from "../theme/ThemeProvider";
import React, { useEffect } from "react";
import { Slot, type ErrorBoundaryProps } from "expo-router";
import { ScreenError } from "../components/ScreenStates";
import Head from "expo-router/head";

import { useFonts } from "expo-font";
import { appFonts } from "../theme/fonts";
import Feather from "@expo/vector-icons/Feather";
import { AppProvider, useApp } from "../lib/state";
import { loadWorkspace } from "../lib/loadWorkspace";
import { View, ActivityIndicator, Platform } from "react-native";
export default function Layout() {
  return (
    <ThemeProvider>
      <AppProvider>
        <WorkspacePreload />
        <ThemedLayout />
      </AppProvider>
    </ThemeProvider>
  );
}

function WorkspacePreload() {
  const { state } = useApp();
  const onboarded = state?.profile.onboardingComplete;
  useEffect(() => {
    if (onboarded) void loadWorkspace().catch(() => undefined);
  }, [onboarded]);
  return null;
}

function ThemedLayout() {
  const { C } = useTheme();

  const [ready, error] = useFonts({
    ...appFonts,
    feather: {
      uri: appFonts.feather,
      testString: String.fromCodePoint(Number(Feather.glyphMap.home)),
    },
  });
  if (!ready && !error)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.cream,
        }}
      >
        <ActivityIndicator accessibilityLabel="Loading" color={C.forest} />
      </View>
    );
  return (
    <>
      <Head>
        <title>BridgingMinds</title>
        <meta name="application-name" content="BridgingMinds" />
        <meta
          name="description"
          content="Find your voice with daily speaking practice, thoughtful feedback and new perspectives. Learn at your pace with BridgingMinds."
        />
        <meta name="theme-color" content={C.cream} />
        <meta property="og:title" content="BridgingMinds · Find your voice" />
        <meta
          property="og:description"
          content="Small moments of practice. A clearer, more confident voice."
        />
      </Head>
      <Slot />
    </>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <ScreenError
        retry={() => {
          if (Platform.OS === "web") window.location.reload();
          else void retry();
        }}
      />
    </ThemeProvider>
  );
}
