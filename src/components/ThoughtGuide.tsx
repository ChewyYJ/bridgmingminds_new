import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getThoughtGuide,
  type GuidingQuestion,
} from "../../shared/thought-guide.mjs";
import {
  isGuidedResponseDraft,
  type GuidedResponseDraft,
} from "../../shared/guided-response.mjs";
import { api, isDraftOwner, loadDraft, saveDraft } from "../lib/api";
import { useApp } from "../lib/state";
import type { Evaluation, Mode } from "../types";
import { GuidedResponse } from "./GuidedResponse";
import { Button, C, Card, ErrorNote, Icon, T } from "./ui";

interface Props {
  attemptId: string;
  mode: Mode;
  evaluation?: Evaluation;
  collapsed?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}

interface Notes {
  version: 1;
  questions: GuidingQuestion[];
  answers: string[];
  currentStep?: number;
}

interface SavedResponse {
  version: 1;
  questions: GuidingQuestion[];
  answers: string[];
  draft: GuidedResponseDraft;
}

const hints: Record<Mode, readonly [string, string, string]> = {
  spin_speak: [
    "Start with the part you feel most sure about. What is the one thing you want someone to understand?",
    "Pick one reason you believe this. Ask yourself how it leads to your main point.",
    "Imagine someone sees it differently. What might they notice that you have not considered?",
  ],
  debate: [
    "Focus on one part of the question. What do you think, and when would that view apply?",
    "Look at your strongest reason. What needs to be true for it to support your claim?",
    "Consider the strongest challenge to your view. What could make you adjust it?",
  ],
  read_reflect: [
    "Return to the reading. Choose one relevant idea and put it in your own words.",
    "Look for a detail in the reading that supports your view. Explain the connection in your own words.",
    "Follow the idea a little further. What does it make you wonder, or connect to something you know?",
  ],
};

export function ThoughtGuide(props: Props) {
  const accountId = useApp()?.state?.profile.id || "";
  return (
    <ThoughtGuideContent
      key={`${accountId}:${props.attemptId}`}
      {...props}
      accountId={accountId}
    />
  );
}

function ThoughtGuideContent({
  attemptId,
  accountId,
  mode,
  evaluation,
  collapsed = false,
  loading = false,
  children,
}: Props & { accountId: string }) {
  const [expanded, setExpanded] = useState(!collapsed);
  const [storedQuestions, setStoredQuestions] = useState<
    GuidingQuestion[] | null
  >(null);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [currentStep, setCurrentStep] = useState(0);
  const [hintStep, setHintStep] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [responseDraft, setResponseDraft] = useState<SavedResponse | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [needsDraftSave, setNeedsDraftSave] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const latestAnswers = useRef(answers);
  const latestStep = useRef(currentStep);
  const writeSequence = useRef(0);
  const mounted = useRef(false);
  const draftRequest = useRef<AbortController | null>(null);
  const saveInFlight = useRef(false);
  const draftKey = `thought-guide:${attemptId}`;
  const responseKey = `thought-guide-response:${attemptId}`;
  const questions = storedQuestions || getThoughtGuide(mode, evaluation);
  const { question, placeholder } = questions[currentStep];
  const hintOpen = hintStep === currentStep;
  const canEdit =
    ready && !loading && !generating && !savingDraft && Boolean(accountId);
  const hasAnswer = answers.some((answer) => answer.trim().length > 0);
  const draftIsCurrent =
    responseDraft !== null &&
    JSON.stringify(responseDraft.questions) === JSON.stringify(questions) &&
    responseDraft.answers.every((answer, index) => answer === answers[index]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    // Reading before enabling edits prevents a late local read from replacing
    // freshly typed notes. The guide itself is visible immediately.
    const restoreNotes = loadDraft(draftKey)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw) as Notes;
        if (
          saved.version !== 1 ||
          !Array.isArray(saved.questions) ||
          saved.questions.length !== 3 ||
          !Array.isArray(saved.answers) ||
          saved.answers.length !== 3 ||
          saved.answers.some((answer) => typeof answer !== "string")
        )
          throw new Error("Invalid saved notes");
        const restored = saved.answers.map((answer) => answer.slice(0, 2000));
        const restoredStep =
          typeof saved.currentStep === "number" &&
          Number.isInteger(saved.currentStep) &&
          saved.currentStep >= 0 &&
          saved.currentStep < 3
            ? saved.currentStep
            : 0;
        latestAnswers.current = restored;
        latestStep.current = restoredStep;
        setAnswers(restored);
        setCurrentStep(restoredStep);
        setStoredQuestions(
          getThoughtGuide(mode, { guiding_questions: saved.questions }),
        );
      })
      .catch(() => {
        if (active) setError("Your notes couldn’t be loaded on this device.");
      });
    const restoreResponse = loadDraft(responseKey)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw) as SavedResponse;
        if (
          saved.version !== 1 ||
          !Array.isArray(saved.answers) ||
          saved.answers.length !== 3 ||
          saved.answers.some(
            (answer) => typeof answer !== "string" || answer.length > 2000,
          ) ||
          JSON.stringify(saved.questions) !==
            JSON.stringify(
              getThoughtGuide(mode, { guiding_questions: saved.questions }),
            ) ||
          !isGuidedResponseDraft(saved.draft)
        )
          throw new Error("Invalid saved draft");
        setResponseDraft(saved);
      })
      .catch(() => {
        if (active)
          setDraftError(
            "Your AI draft couldn’t be loaded. You can create it again.",
          );
      });
    void Promise.all([restoreNotes, restoreResponse]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      mounted.current = false;
      draftRequest.current?.abort();
      draftRequest.current = null;
    };
  }, [draftKey, responseKey, mode]);

  function updateAnswer(index: number, value: string) {
    if (!canEdit || !isDraftOwner(accountId)) return;
    const next = latestAnswers.current.map((answer, current) =>
      current === index ? value.slice(0, 2000) : answer,
    );
    latestAnswers.current = next;
    setAnswers(next);
    persistNotes(next, latestStep.current);
  }

  function moveStep(direction: -1 | 1) {
    if (!canEdit || !isDraftOwner(accountId)) return;
    const next = latestStep.current + direction;
    if (next < 0 || next >= questions.length) return;
    latestStep.current = next;
    setCurrentStep(next);
    setHintStep(null);
    persistNotes(latestAnswers.current, next);
  }

  function persistNotes(nextAnswers: string[], step: number) {
    if (!isDraftOwner(accountId)) return;
    setStoredQuestions(questions);
    const sequence = ++writeSequence.current;
    const saved: Notes = {
      version: 1,
      questions,
      answers: nextAnswers,
      currentStep: step,
    };
    // Invoke immediately: saveDraft captures the current account before its
    // first asynchronous operation. Closing or signing out cannot redirect a
    // delayed write into another account, and there is no debounce to lose.
    void saveDraft(draftKey, JSON.stringify(saved))
      .then(() => {
        if (
          mounted.current &&
          isDraftOwner(accountId) &&
          sequence === writeSequence.current
        )
          setError("");
      })
      .catch(() => {
        if (
          mounted.current &&
          isDraftOwner(accountId) &&
          sequence === writeSequence.current
        )
          setError("These notes couldn’t be saved. Keep this screen open.");
      });
  }

  async function persistResponse(saved: SavedResponse) {
    if (!mounted.current || !isDraftOwner(accountId)) return;
    try {
      // Capture this account immediately, before awaiting device storage.
      await saveDraft(responseKey, JSON.stringify(saved));
      if (mounted.current && isDraftOwner(accountId)) setNeedsDraftSave(false);
    } catch {
      if (mounted.current && isDraftOwner(accountId)) {
        setNeedsDraftSave(true);
        setDraftError(
          "Your draft is ready, but couldn’t be saved on this device.",
        );
      }
    }
  }

  async function retrySave() {
    if (!canEdit || !responseDraft || saveInFlight.current) return;
    if (!isDraftOwner(accountId)) return;
    saveInFlight.current = true;
    setSavingDraft(true);
    setDraftError("");
    await persistResponse(responseDraft);
    saveInFlight.current = false;
    if (mounted.current && isDraftOwner(accountId)) setSavingDraft(false);
  }

  async function createDraft() {
    if (!canEdit || !hasAnswer || draftIsCurrent || draftRequest.current)
      return;
    if (!isDraftOwner(accountId)) return;
    const controller = new AbortController();
    draftRequest.current = controller;
    const sourceQuestions = questions.map((item) => ({ ...item }));
    const sourceAnswers = [...latestAnswers.current];
    setGenerating(true);
    setDraftError("");
    try {
      const draft = await api<unknown>(
        `/attempts/${attemptId}/guided-response`,
        {
          method: "POST",
          body: { questions: sourceQuestions, answers: sourceAnswers },
          signal: controller.signal,
        },
      );
      if (
        !mounted.current ||
        !isDraftOwner(accountId) ||
        controller.signal.aborted
      )
        return;
      if (!isGuidedResponseDraft(draft))
        throw new Error("The AI draft couldn’t be checked. Please try again.");
      const saved: SavedResponse = {
        version: 1,
        questions: sourceQuestions,
        answers: sourceAnswers,
        draft,
      };
      setResponseDraft(saved);
      await persistResponse(saved);
    } catch (cause) {
      if (
        mounted.current &&
        isDraftOwner(accountId) &&
        !controller.signal.aborted
      )
        setDraftError(
          cause instanceof Error
            ? cause.message
            : "Your draft couldn’t be created. Your answers are saved; try again.",
        );
    } finally {
      if (draftRequest.current === controller) {
        draftRequest.current = null;
        if (mounted.current && isDraftOwner(accountId)) setGenerating(false);
      }
    }
  }

  return (
    <View testID="thought-guide">
      <Card style={{ gap: expanded ? 18 : 0, padding: 20 }}>
        {collapsed ? (
          <Pressable
            testID="thought-guide-toggle"
            accessibilityRole="button"
            accessibilityLabel="Your notes"
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            onPress={() => setExpanded((value) => !value)}
            style={styles.toggle}
          >
            <Text style={[T.h3, { flex: 1 }]}>Your notes</Text>
            <Icon name={expanded ? "chevron-up" : "chevron-down"} />
          </Pressable>
        ) : (
          <Text accessibilityRole="header" style={T.h2}>
            Think it through
          </Text>
        )}
        {expanded ? (
          <>
            <View
              testID={`thought-guide-field-${currentStep}`}
              style={{ gap: 12 }}
            >
              <View style={styles.questionTools}>
                <Text
                  testID="thought-guide-progress"
                  accessibilityLabel={`Question ${currentStep + 1} of ${questions.length}`}
                  accessibilityLiveRegion="polite"
                  style={styles.progress}
                >
                  {currentStep + 1}/{questions.length}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Hint for question ${currentStep + 1}`}
                  accessibilityState={{ expanded: hintOpen }}
                  aria-expanded={hintOpen}
                  onPress={() => setHintStep(hintOpen ? null : currentStep)}
                  style={({ pressed }) => [
                    styles.hintButton,
                    (pressed || hintOpen) && styles.pressed,
                  ]}
                >
                  <Icon name="help-circle" size={16} />
                  <Text style={styles.hintLabel}>Hint</Text>
                </Pressable>
              </View>
              <Text
                testID={`thought-guide-question-${currentStep}`}
                style={[T.body, { fontFamily: "DMMedium" }]}
              >
                {question}
              </Text>
              {hintOpen ? (
                <View testID="thought-guide-hint" style={styles.hint}>
                  <Text accessibilityLiveRegion="polite" style={T.small}>
                    {hints[mode][currentStep]}
                  </Text>
                </View>
              ) : null}
              <TextInput
                key={currentStep}
                accessibilityLabel={question}
                value={answers[currentStep]}
                placeholder={placeholder}
                placeholderTextColor={C.muted}
                onChangeText={(value) => updateAnswer(currentStep, value)}
                editable={canEdit}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                style={styles.input}
              />
            </View>
            <View style={styles.navigation}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous question"
                accessibilityState={{ disabled: !canEdit || currentStep === 0 }}
                disabled={!canEdit || currentStep === 0}
                onPress={() => moveStep(-1)}
                style={({ pressed }) => [
                  styles.stepButton,
                  (!canEdit || currentStep === 0) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="chevron-left" size={18} />
                <Text style={styles.stepLabel}>Back</Text>
              </Pressable>
              {currentStep < questions.length - 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next question"
                  accessibilityState={{ disabled: !canEdit }}
                  disabled={!canEdit}
                  onPress={() => moveStep(1)}
                  style={({ pressed }) => [
                    styles.stepButton,
                    !canEdit && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.stepLabel}>Next</Text>
                  <Icon name="chevron-right" size={18} />
                </Pressable>
              ) : null}
            </View>
            <ErrorNote message={error} />
            {responseDraft && !draftIsCurrent ? (
              <Text testID="guided-response-stale" style={T.small}>
                Your notes changed. Update the draft when you’re ready.
              </Text>
            ) : null}
            {currentStep === questions.length - 1 && !draftIsCurrent ? (
              <View style={{ gap: 8 }}>
                <Button
                  label={responseDraft ? "Update AI draft" : "Create AI draft"}
                  icon="feather"
                  onPress={() => void createDraft()}
                  disabled={!canEdit || !hasAnswer}
                  loading={generating}
                  style={{ alignSelf: "stretch" }}
                />
                <Text style={T.small}>
                  {hasAnswer
                    ? "Uses your answers and original response."
                    : "Add an answer to create a draft."}
                </Text>
              </View>
            ) : null}
            {draftError ? (
              <View testID="guided-response-error">
                <ErrorNote message={draftError} />
              </View>
            ) : null}
            {needsDraftSave ? (
              <Button
                label="Save draft again"
                variant="secondary"
                icon="save"
                disabled={!canEdit}
                loading={savingDraft}
                onPress={() => void retrySave()}
              />
            ) : null}
            {responseDraft ? (
              <GuidedResponse
                key={responseDraft.draft.createdAt}
                draft={responseDraft.draft}
              />
            ) : null}
            {children}
          </>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  questionTools: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  hintButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  hintLabel: { ...T.small, fontFamily: "DMMedium", color: C.forest },
  hint: {
    backgroundColor: C.sage,
    borderRadius: 12,
    padding: 12,
  },
  toggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progress: {
    ...T.small,
    color: C.forest,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: C.sage,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  stepButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stepLabel: { ...T.body, fontFamily: "DMMedium", color: C.forest },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: C.sage },
  input: {
    ...T.body,
    minHeight: 104,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.cream,
  },
});
