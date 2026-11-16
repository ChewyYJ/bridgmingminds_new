let pending: Promise<typeof import("../screens/LearningWorkspace")> | undefined;

/** Begin the public code download as soon as a returning session is known. */
export function loadWorkspace() {
  pending ??= import("../screens/LearningWorkspace").catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
