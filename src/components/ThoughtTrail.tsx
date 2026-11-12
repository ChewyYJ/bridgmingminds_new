import React, { useState } from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { C, Icon, T } from "./ui";

export function ThoughtTrail({
  earlier,
  revision,
  openingOnly = false,
}: {
  earlier: string;
  revision: string;
  openingOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const { width } = useWindowDimensions();
  return (
    <View style={s.card} testID="thought-trail">
      <Pressable
        testID="thought-trail-toggle"
        accessibilityRole="button"
        accessibilityLabel="Compare responses"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded((value) => !value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          s.toggle,
          focused && s.focused,
          pressed && { backgroundColor: C.sage },
        ]}
      >
        <Icon name="git-branch" size={20} />
        <Text style={[T.h3, { flex: 1 }]}>Compare responses</Text>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={17} />
      </Pressable>
      {expanded && (
        <View style={s.details} testID="thought-trail-details">
          <Text style={T.small}>
            {earlier === revision
              ? "The words are unchanged. What would you try next?"
              : "What changed in your reasons, examples or point of view?"}
          </Text>
          <View
            style={{ flexDirection: width >= 800 ? "row" : "column", gap: 12 }}
          >
            <View style={[s.version, width >= 800 && { flex: 1 }]}>
              <Text style={T.label}>
                {openingOnly ? "Earlier opening" : "Earlier response"}
              </Text>
              <Text selectable testID="thought-trail-earlier" style={T.body}>
                {earlier}
              </Text>
            </View>
            <View
              style={[
                s.version,
                width >= 800 && { flex: 1 },
                { backgroundColor: "#EEF3E6" },
              ]}
            >
              <Text style={T.label}>
                {openingOnly ? "Revised opening" : "Your revision"}
              </Text>
              <Text selectable testID="thought-trail-revision" style={T.body}>
                {revision}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    overflow: "hidden",
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 17,
  },
  focused: { borderColor: C.forest },
  details: { padding: 18, paddingTop: 2, gap: 12 },
  version: {
    minWidth: 0,
    gap: 10,
    padding: 16,
    backgroundColor: "#F7F7F2",
    borderRadius: 12,
  },
});
