import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

// Windows stat mode bits do not expose ACL permissions. Record the real calls
// as well as doing real I/O, so private creation intent remains tested there.
export function observePrivateFileOperations(t) {
  const calls = { mkdir: [], chmod: [], writeFile: [] };
  const mocks = Object.keys(calls).map((name) => {
    const original = fs[name];
    return t.mock.method(fs, name, (...args) => {
      calls[name].push(args);
      return original(...args);
    });
  });
  syncBuiltinESMExports();
  t.after(() => {
    for (const mocked of mocks) mocked.mock.restore();
    syncBuiltinESMExports();
  });
  return calls;
}
