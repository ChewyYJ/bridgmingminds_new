import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Animated,
  ViewStyle,
  TextStyle,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { usePressMotion } from "./Motion";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export const C = {
  cream: "#F5F0E9",
  paper: "#FFFCF8",
  forest: "#34312E",
  ink: "#292623",
  muted: "#746C63",
  sage: "#E6DCD1",
  peach: "#EEE1D4",
  lilac: "#E8E1DA",
  border: "#D9CFC4",
  yellow: "#F0DFAE",
  orange: "#AE8352",
  red: "#A5453F",
};
export const T = StyleSheet.create({
  body: { fontFamily: "DM", fontSize: 15, color: C.ink, lineHeight: 23 },
  small: { fontFamily: "DM", fontSize: 12, color: C.muted, lineHeight: 18 },
  label: {
    fontFamily: "DMBold",
    fontSize: 11,
    letterSpacing: 1.8,
    color: C.muted,
    textTransform: "uppercase",
  },
  title: { fontFamily: "DMBold", fontSize: 30, color: C.ink, lineHeight: 38 },
  h2: { fontFamily: "DMBold", fontSize: 22, color: C.ink, lineHeight: 30 },
  h3: { fontFamily: "DMBold", fontSize: 17, color: C.ink, lineHeight: 24 },
});
export function Icon({
  name,
  size = 20,
  color = C.forest,
}: {
  name: any;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
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
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const motion = usePressMotion({ disabled: disabled || loading });
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(selected === undefined
        ? {}
        : { accessibilityState: { selected }, "aria-pressed": selected })}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        motion.onPressIn();
      }}
      onPressOut={() => {
        setPressed(false);
        motion.onPressOut();
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.button,
        variant === "primary"
          ? { backgroundColor: C.forest }
          : variant === "secondary"
            ? { backgroundColor: C.sage }
            : { backgroundColor: "transparent" },
        (disabled || loading) && { opacity: 0.5 },
        (pressed || hovered) && { opacity: 0.85 },
        style,
        motion.style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? "white" : C.forest}
        />
      ) : icon ? (
        <Icon
          name={icon}
          size={17}
          color={variant === "primary" ? "white" : C.forest}
        />
      ) : null}
      <Text
        style={{
          fontFamily: "DMBold",
          fontSize: 14,
          color: variant === "primary" ? "#FFF" : C.forest,
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
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}
export function Tag({
  children,
  color = C.sage,
  textColor = C.forest,
}: {
  children: React.ReactNode;
  color?: string;
  textColor?: string;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: color,
        borderRadius: 20,
        paddingHorizontal: 11,
        paddingVertical: 6,
      }}
    >
      <Text style={{ fontFamily: "DMMedium", fontSize: 11, color: textColor }}>
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
  return (
    <View style={{ gap: 6, marginBottom: 24 }}>
      <Text accessibilityRole="header" style={T.title}>
        {children}
      </Text>
      {sub && <Text style={[T.body, { color: C.muted }]}>{sub}</Text>}
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
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  label?: string;
  secureTextEntry?: boolean;
  style?: TextStyle;
  keyboardType?: any;
  autoCapitalize?: any;
  editable?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {label && (
        <Text style={[T.small, { fontFamily: "DMBold", color: C.ink }]}>
          {label}
        </Text>
      )}
      <TextInput
        accessibilityLabel={label || placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#92978D"
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        style={[
          styles.field,
          multiline && {
            minHeight: 170,
            textAlignVertical: "top",
            lineHeight: 26,
          },
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
  if (!message && !children) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: "#F9EBE5", borderRadius: 12, padding: 14 }}
    >
      <Text style={[T.body, { fontSize: 13, color: C.red }]}>
        {message || children}
      </Text>
    </View>
  );
}
export function Resource({
  icon,
  value,
  label,
  color = C.sage,
}: {
  icon: string;
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <View
      accessibilityLabel={`${value} ${label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: color,
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 24,
      }}
    >
      <Icon name={icon} size={15} />
      <Text style={{ fontFamily: "DMBold", fontSize: 12, color: C.forest }}>
        {value}
      </Text>
      <Text style={[T.small, { fontSize: 11 }]}>{label}</Text>
    </View>
  );
}
export const styles = StyleSheet.create({
  button: {
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 19,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    alignSelf: "flex-start",
  },
  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 24,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontFamily: "DM",
    fontSize: 15,
    color: C.ink,
    backgroundColor: "#FFFEFB",
  },
});
