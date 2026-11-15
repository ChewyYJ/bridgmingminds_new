/** Valid synthetic PCM for ownership/transport tests, never speech-quality evidence. */
export function silentWav(seconds = 1) {
  const rate = 16000, samples = Math.round(seconds * rate), bytes = samples * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF'); buffer.writeUInt32LE(36 + bytes, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
  return buffer;
}
