import { useTheme } from "../theme/ThemeProvider";
import React from "react";
import { Text, View } from "react-native";
import type { AppState } from "../types";
import { Icon } from "./ui";
import { MotionPulse } from "./Motion";

export function PracticeWeek({ week }: { week: AppState["practiceWeek"] }) {
  const { C, T } = useTheme();

  const count = week?.days.length || 0;
  const target = week?.target || 3;
  const reached = count >= target;
  const today = week?.days.includes(week.day);
  return (
    <View
      testID="practice-week"
      style={{
        padding: 16,
        gap: 9,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#DCE4D2",
        backgroundColor: "#F2F5EB",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ gap: 4, flex: 1, minWidth: 100 }}>
          <Text style={[T.h3, { fontSize: 16 }]}>
            {reached ? "Weekly goal met" : "This week"}
          </Text>
        </View>
        <View
          testID="practice-week-progress"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Practice days this week"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(count, target)}
          aria-valuetext={`${count} practice ${count === 1 ? "day" : "days"} this week. Weekly intention: ${target} days.`}
          accessibilityValue={{
            min: 0,
            max: target,
            now: Math.min(count, target),
            text: `${count} practice ${count === 1 ? "day" : "days"} this week. Weekly intention: ${target} days.`,
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
        >
          {Array.from({ length: target }, (_, index) => (
            <MotionPulse
              key={index}
              triggerKey={index < count ? "complete" : "pending"}
              enabled={index < count}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: index < count ? C.forest : "#E3E8D8",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={index < count ? "check" : "feather"}
                size={11}
                color={index < count ? "white" : "#7E8D71"}
              />
            </MotionPulse>
          ))}
          <Text style={[T.small, { color: C.forest, fontFamily: "DMBold" }]}>
            {Math.min(count, target)}/{target}
          </Text>
        </View>
      </View>
      <Text style={[T.small, { fontSize: 11 }]}>
        {today ? "Today counts" : `Any ${target} practice days`} · Mon–Sun
        {week?.timezone ? ` · ${week.timezone.replaceAll("_", " ")}` : ""}
        {count > target ? ` · ${count} days practised` : ""}
      </Text>
    </View>
  );
}
