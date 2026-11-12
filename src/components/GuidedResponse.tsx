import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  isGuidedResponseDraft,
  type GuidedResponseDraft,
} from "../../shared/guided-response.mjs";
import { C, Icon, T } from "./ui";

const highlights = [C.sage, C.lilac, C.peach, C.yellow, "#E0EDF0"];

export function GuidedResponse({
  draft,
  children,
}: {
  draft: GuidedResponseDraft;
  children?: React.ReactNode;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const text = typeof draft.text === "string" ? draft.text : "";
  // A stale or malformed cached annotation must never alter the answer or
  // point to a different passage. Invalid drafts remain readable as plain text.
  const annotations = isGuidedResponseDraft(draft) ? draft.annotations : [];
  const activeIndex = selectedIndex < annotations.length ? selectedIndex : 0;
  const active = annotations[activeIndex];
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (const [index, annotation] of annotations.entries()) {
    fragments.push(text.slice(cursor, annotation.start));
    fragments.push(
      <Text
        key={`${annotation.start}-${annotation.end}`}
        testID={`guided-response-highlight-${index}`}
        accessible={false}
        onPress={() => setSelectedIndex(index)}
        style={[
          s.highlight,
          { backgroundColor: highlights[index % highlights.length] },
          index === activeIndex && { color: C.forest },
        ]}
      >
        {text.slice(annotation.start, annotation.end)}
      </Text>,
    );
    cursor = annotation.end;
  }
  fragments.push(text.slice(cursor));

  return (
    <View testID="guided-response" style={s.card}>
      <View style={s.header}>
        <View style={s.mark} accessible={false} aria-hidden>
          <Icon name="edit-3" size={18} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text accessibilityRole="header" style={T.h3}>
            AI draft
          </Text>
          <Text style={T.small}>Your ideas, shaped by AI.</Text>
        </View>
      </View>
      <Text
        testID="guided-response-text"
        accessibilityLabel={text}
        style={s.answer}
      >
        {fragments}
      </Text>
      {active ? (
        <>
          <View style={s.annotations}>
            {annotations.map((annotation, index) => {
              const selected = index === activeIndex;
              return (
                <Pressable
                  key={`${annotation.start}-${annotation.end}`}
                  testID={`guided-response-annotation-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Annotation ${index + 1}: ${annotation.label}`}
                  accessibilityHint="Show why this passage is shaped this way."
                  accessibilityState={{ selected }}
                  aria-pressed={selected}
                  onPress={() => setSelectedIndex(index)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  style={({ pressed }) => [
                    s.annotationButton,
                    selected && s.selected,
                    focusedIndex === index && s.focused,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <View
                    style={[
                      s.number,
                      { backgroundColor: highlights[index % highlights.length] },
                    ]}
                    accessible={false}
                    aria-hidden
                  >
                    <Text style={s.numberText}>{index + 1}</Text>
                  </View>
                  <Text style={s.annotationLabel}>{annotation.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View
            testID="guided-response-explanation"
            accessibilityLiveRegion="polite"
            aria-live="polite"
            aria-atomic
            style={s.explanation}
          >
            <Text style={s.explanationLabel}>
              {activeIndex + 1} · {active.label}
            </Text>
            <Text
              testID="guided-response-selected-quote"
              numberOfLines={2}
              style={s.quote}
            >
              “{active.quote}”
            </Text>
            <Text testID="guided-response-explanation-text" style={T.body}>
              {active.explanation}
            </Text>
          </View>
        </>
      ) : null}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    padding: 18,
    gap: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    backgroundColor: C.paper,
    minWidth: 0,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  answer: { ...T.body, lineHeight: 29 },
  highlight: {
    textDecorationLine: "underline",
    textDecorationColor: C.forest,
  },
  annotations: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  annotationButton: {
    minHeight: 44,
    flexBasis: 140,
    flexGrow: 1,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.border,
  },
  selected: { borderColor: C.forest, backgroundColor: C.cream },
  focused: { borderColor: C.forest, backgroundColor: C.sage },
  number: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { ...T.small, fontFamily: "DMBold", color: C.forest },
  annotationLabel: {
    ...T.small,
    fontFamily: "DMMedium",
    color: C.ink,
    flex: 1,
    minWidth: 0,
  },
  explanation: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.cream,
  },
  explanationLabel: { ...T.small, color: C.forest, fontFamily: "DMBold" },
  quote: { ...T.small, fontStyle: "italic" },
});
