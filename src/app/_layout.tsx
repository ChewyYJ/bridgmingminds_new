import React from "react";
import { Slot } from "expo-router";
import Head from "expo-router/head";
import { C } from "../components/ui";
import { useFonts } from "expo-font";
import Feather from "@expo/vector-icons/Feather";
import { appFonts } from "../theme/fonts";
import { AppProvider } from "../lib/state";
import { View, ActivityIndicator } from "react-native";
export default function Layout() {
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
        <ActivityIndicator accessibilityLabel="Loading BridgingMinds" color={C.forest} />
      </View>
    );
  return (
    <AppProvider>
      <Head>
        <title>BridgingMinds</title>
        <meta name="application-name" content="BridgingMinds" />
        <meta name="theme-color" content={C.cream} />
      </Head>
      <Slot />
    </AppProvider>
  );
}
