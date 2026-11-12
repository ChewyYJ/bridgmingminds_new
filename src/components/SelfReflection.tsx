import React, { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AudioPlayback } from "./AudioInput";
import { Button, C, Card, Field, Icon, T } from "./ui";

export function SelfReflection({
  value,
  onChangeText,
  onSubmit,
  busy,
  children,
  audioUri,
  initiallyExpanded = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: (skip: boolean) => void;
  busy: boolean;
  children?: ReactNode;
  audioUri?: string;
  initiallyExpanded?: boolean;
}) {
  const hasReflection = value.trim().length > 0;
  const [expanded, setExpanded] = useState(
    initiallyExpanded || hasReflection,
  );
  const [focused, setFocused] = useState(false);

  return (
    <View testID="self-reflection">
      <Card style={{ gap: 18 }}>
        {audioUri ? <AudioPlayback uri={audioUri} /> : null}
        {children}
        <View style={{ gap: expanded ? 12 : 0 }}>
          <Pressable
            testID="self-reflection-toggle"
            accessibilityRole="button"
            accessibilityLabel="Reflection (optional)"
            accessibilityState={{ expanded, disabled: busy }}
            aria-expanded={expanded}
            aria-disabled={busy}
            disabled={busy}
            onPress={() => setExpanded((current) => !current)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={({ pressed }) => ({
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: focused ? C.forest : "transparent",
              backgroundColor: pressed ? C.sage : "transparent",
              opacity: busy ? 0.5 : 1,
            })}
          >
            <Text style={[T.body, { flex: 1, fontFamily: "DMMedium" }]}>
              Reflection (optional)
            </Text>
            <View accessible={false} aria-hidden>
              <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} />
            </View>
          </Pressable>
          {expanded ? (
            <View testID="self-reflection-note" style={{ gap: 12 }}>
              <Text accessibilityRole="header" style={T.h2}>
                What could be better?
              </Text>
              <Field
                label="Your reflection"
                value={value}
                onChangeText={(text) => onChangeText(text.slice(0, 2000))}
                editable={!busy}
                placeholder="Next time, I could…"
                multiline
                style={{ minHeight: 130 }}
              />
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Button
            label={
              hasReflection ? "Save & get feedback" : "Get feedback"
            }
            loading={busy}
            onPress={() => onSubmit(false)}
          />
          {hasReflection ? (
            <Button
              label="Skip reflection"
              variant="ghost"
              disabled={busy}
              onPress={() => onSubmit(true)}
            />
          ) : null}
        </View>
      </Card>
    </View>
  );
}
