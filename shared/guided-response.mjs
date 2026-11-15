export const GUIDED_RESPONSE_LIMITS = {
  text: 6000,
  quote: 400,
  label: 60,
  explanation: 500,
};

// Hermes-compatible Unicode check; exact offsets always use JavaScript UTF-16.
function wellFormed(text) {
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validText(value, max) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    wellFormed(value)
  );
}

/** Validate a saved/displayed draft without changing text or inventing spans. */
export function isGuidedResponseDraft(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !validText(value.text, GUIDED_RESPONSE_LIMITS.text) ||
    value.provider !== "openai" ||
    !validText(value.model, 200) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.annotations) ||
    value.annotations.length < 2 ||
    value.annotations.length > 5
  )
    return false;
  if (value.vocabulary !== undefined) {
    if (
      !Array.isArray(value.vocabulary) ||
      value.vocabulary.length > 3 ||
      new Set(value.vocabulary.map((word) => word?.wordId)).size !==
        value.vocabulary.length
    )
      return false;
    for (const word of value.vocabulary) {
      if (
        !validText(word?.wordId, 60) ||
        !validText(word.word, 60) ||
        !validText(word.meaning, 500) ||
        !Array.isArray(word.spans) ||
        !word.spans.length
      )
        return false;
      for (const span of word.spans) {
        if (
          !Number.isSafeInteger(span.start) ||
          !Number.isSafeInteger(span.end) ||
          span.start < 0 ||
          span.end <= span.start ||
          span.end > value.text.length ||
          value.text.slice(span.start, span.end).toLowerCase() !==
            word.word.toLowerCase()
        )
          return false;
      }
    }
  }
  let previousEnd = 0;
  for (const annotation of value.annotations) {
    if (
      !annotation ||
      typeof annotation !== "object" ||
      Array.isArray(annotation) ||
      !Number.isSafeInteger(annotation.start) ||
      !Number.isSafeInteger(annotation.end) ||
      annotation.start < previousEnd ||
      annotation.end <= annotation.start ||
      annotation.end > value.text.length ||
      !validText(annotation.quote, GUIDED_RESPONSE_LIMITS.quote) ||
      !validText(annotation.label, GUIDED_RESPONSE_LIMITS.label) ||
      !validText(annotation.explanation, GUIDED_RESPONSE_LIMITS.explanation) ||
      value.text.slice(annotation.start, annotation.end) !== annotation.quote ||
      value.text.indexOf(annotation.quote) !== annotation.start ||
      value.text.indexOf(annotation.quote, annotation.start + 1) !== -1
    )
      return false;
    previousEnd = annotation.end;
  }
  return true;
}
