import React, { lazy, Suspense } from "react";
import { Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import Head from "expo-router/head";
import { useApp } from "./src/lib/state";
import { useTheme } from "./src/theme/ThemeProvider";
import { isKnownPage } from "./src/navigation/routeInfo";
import { Onboarding } from "./src/screens/Onboarding";
import { NotFound, ScreenLoading } from "./src/components/ScreenStates";
import { Button, ErrorNote } from "./src/components/ui";
const LearningWorkspace = lazy(() => import("./src/screens/LearningWorkspace"));

export default function App() {
  const { C, T } = useTheme();
  const { state, loading, error, refresh, bootstrap } = useApp();
  const pathname = usePathname();
  if (!isKnownPage(pathname))
    return (
      <>
        <Head>
          <title>Page not found · BridgingMinds</title>
        </Head>
        <NotFound onHome={() => router.replace("/")} />
      </>
    );
  if (loading)
    return (
      <View
        style={{ flex: 1, justifyContent: "center", backgroundColor: C.cream }}
      >
        <ScreenLoading />
      </View>
    );
  if (error)
    return (
      <View
        role="main"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.cream,
          padding: 24,
          gap: 20,
        }}
      >
        <Text role="heading" aria-level={1} style={T.title}>
          Can’t connect
        </Text>
        <ErrorNote message={error} />
        <Button
          label="Try again"
          onPress={() => {
            void bootstrap();
          }}
        />
      </View>
    );
  if (!state?.profile.onboardingComplete)
    return (
      <Onboarding
        state={state}
        onDone={async () => {
          await refresh();
          router.replace("/");
        }}
      />
    );
  return (
    <Suspense
      fallback={
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            backgroundColor: C.cream,
          }}
        >
          <ScreenLoading />
        </View>
      }
    >
      <LearningWorkspace />
    </Suspense>
  );
}
