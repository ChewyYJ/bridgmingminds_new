const fail = (status, message) => Object.assign(new Error(message), { status });
const MAX_BYTES = 5 * 1024 * 1024;

export function createElevenLabsReader({
  key = process.env.ELEVENLABS_API_KEY,
  voiceId = process.env.ELEVENLABS_VOICE_ID,
  model = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
  fetchImpl = fetch,
  timeoutMs = 45000,
} = {}) {
  const configured = Boolean(
    key &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(voiceId || "") &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(model),
  );
  return {
    configured,
    identity: `${voiceId}:${model}:reading-v1`,
    async synthesize(text) {
      if (!configured) throw fail(503, "Sample audio isn’t available yet.");
      if (typeof text !== "string" || !text.trim() || text.length > 5000)
        throw fail(400, "This passage is unavailable for sample reading.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": key,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({ text, model_id: model }),
            signal: controller.signal,
          },
        );
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("audio/mpeg") ||
          !response.body
        )
          throw fail(502, "The sample couldn’t be prepared. Please try again.");
        if (Number(response.headers.get("content-length")) > MAX_BYTES)
          throw fail(502, "The sample audio was too large. Please try again.");
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > MAX_BYTES)
            throw fail(
              502,
              "The sample audio was too large. Please try again.",
            );
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        const mp3 =
          bytes.subarray(0, 3).toString() === "ID3" ||
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
        if (bytes.length < 16 || !mp3)
          throw fail(
            502,
            "The sample audio could not be read. Please try again.",
          );
        return bytes;
      } catch (error) {
        controller.abort();
        // Provider bodies may contain account details; never expose or log them.
        if (error.status) throw error;
        throw fail(502, "The sample couldn’t be prepared. Please try again.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
