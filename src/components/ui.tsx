import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Animated,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { usePressMotion } from "./Motion";
import { createThemedStyles, useTheme } from "../theme/ThemeProvider";
import { tokens } from "../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: React.ComponentProps<typeof Feather>["name"] | string;
  size?: number;
  color?: string;
}) {
  const { C } = useTheme();
  return (
    <Feather
      name={name as React.ComponentProps<typeof Feather>["name"]}
      size={size}
      color={color ?? C.forest}
      aria-hidden
    />
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  selected,
  icon,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  icon?: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const { C } = useTheme();
  const styles = useStyles();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const motion = usePressMotion({ disabled: disabled || loading });
  const primary = variant === "primary";
  const foreground = primary ? C.onPrimary : C.ink;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      accessibilityState={{
        disabled: disabled || loading,
        busy: loading,
        ...(selected === undefined ? {} : { selected }),
      }}
      {...(selected === undefined ? {} : { "aria-pressed": selected })}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={motion.onPressIn}
      onPressOut={motion.onPressOut}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.button,
        {
          backgroundColor: primary
            ? C.forest
            : variant === "secondary"
              ? selected
                ? C.accentSurface
                : C.sage
              : "transparent",
          borderColor: focused ? C.accent : selected ? C.accent : "transparent",
        },
        hovered && !disabled && !loading && { opacity: 0.88 },
        (disabled || loading) && { opacity: 0.55 },
        style,
        motion.style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          accessibilityLabel="Loading"
          size="small"
          color={foreground}
        />
      ) : icon ? (
        <Icon name={icon} size={18} color={foreground} />
      ) : null}
      <Text
        style={{
          fontFamily: tokens.font.bold,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
          flexShrink: 1,
          color: foreground,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function Tag({
  children,
  color,
  textColor,
}: {
  children: React.ReactNode;
  color?: string;
  textColor?: string;
}) {
  const { C } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: color ?? C.sage,
        borderRadius: tokens.radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.font.medium,
          fontSize: 12,
          lineHeight: 18,
          color: textColor ?? C.ink,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export function Heading({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  const { T } = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: tokens.space.xl }}>
      <Text role="heading" aria-level={1} style={T.title}>
        {children}
      </Text>
      {sub && <Text style={T.small}>{sub}</Text>}
    </View>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  label,
  secureTextEntry = false,
  style,
  keyboardType,
  autoCapitalize,
  editable = true,
  maxLength,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  label?: string;
  secureTextEntry?: boolean;
  style?: TextStyle;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  editable?: boolean;
  maxLength?: number;
}) {
  const { C, T } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: tokens.space.sm }}>
      {label && (
        <Text style={[T.small, { fontFamily: tokens.font.bold, color: C.ink }]}>
          {label}
        </Text>
      )}
      <TextInput
        accessibilityLabel={label || placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.field,
          multiline && {
            minHeight: 170,
            textAlignVertical: "top",
            lineHeight: 26,
          },
          focused && { borderColor: C.accent },
          !editable && { opacity: 0.65 },
          style,
        ]}
      />
    </View>
  );
}

export function ErrorNote({
  message,
  children,
}: {
  message?: string;
  children?: React.ReactNode;
}) {
  const { C, T } = useTheme();
  if (!message && !children) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: C.errorSurface,
        borderRadius: tokens.radius.control,
        padding: tokens.space.lg,
      }}
    >
      <Text style={[T.body, { fontSize: 14, color: C.red }]}>
        {message || children}
      </Text>
    </View>
  );
}

export function Resource({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number;
  label: string;
  color?: string;
}) {
  const { C, T } = useTheme();
  return (
    <View
      accessibilityLabel={`${value} ${label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: color ?? C.sage,
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: tokens.radius.control,
      }}
    >
      <Icon name={icon} size={15} />
      <Text style={[T.h3, { fontSize: 13 }]}>{value}</Text>
      <Text style={T.small}>{label}</Text>
    </View>
  );
}

/** The visible switch stays compact; its entire 48 × 48 control is tappable. */
export function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const { C } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        minWidth: 48,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          backgroundColor: value ? C.accent : C.border,
          padding: 3,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: value ? C.onPrimary : C.paper,
          }}
        />
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ C }) =>
  StyleSheet.create({
    button: {
      minHeight: tokens.size.control,
      minWidth: tokens.size.touch,
      borderRadius: tokens.radius.control,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 9,
      alignSelf: "stretch",
    },
    card: {
      backgroundColor: C.paper,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: tokens.radius.card,
      padding: tokens.space.xl,
    },
    field: {
      minHeight: tokens.size.control,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: tokens.radius.control,
      padding: 14,
      fontFamily: tokens.font.body,
      fontSize: 16,
      color: C.ink,
      backgroundColor: C.input,
    },
  }),
);
