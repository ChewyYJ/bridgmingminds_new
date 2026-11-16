import Feather from "@expo/vector-icons/Feather";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";

// Native keeps the existing font files, family names and metrics.
export const appFonts = {
  DM: DMSans_400Regular,
  DMMedium: DMSans_500Medium,
  DMBold: DMSans_700Bold,
  Lora: Lora_400Regular,
  feather: Feather.font.feather,
};
