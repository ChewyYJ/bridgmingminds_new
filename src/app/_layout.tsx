import React from "react";
import { Slot } from "expo-router";
import { useFonts } from "expo-font";
import Feather from "@expo/vector-icons/Feather";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";
import { AppProvider } from "../lib/state";
import { View, ActivityIndicator } from "react-native";
export default function Layout() {
  const [ready, error] = useFonts({
    feather: {
      uri: Feather.font.feather,
      testString: String.fromCodePoint(Number(Feather.glyphMap.home)),
    },
    DM: DMSans_400Regular,
    DMMedium: DMSans_500Medium,
    DMBold: DMSans_700Bold,
    Lora: Lora_400Regular,
  });
  if (!ready && !error)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FAF8F2",
        }}
      >
        <ActivityIndicator color="#345B48" />
      </View>
    );
  return (
    <AppProvider>
      <Slot />
    </AppProvider>
  );
}
