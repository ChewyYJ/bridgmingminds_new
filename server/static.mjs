import express from "express";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

/** Serve only the exported web bundle; user data and recordings are outside this root. */
export function serveWeb(app, directory = resolve("dist")) {
  const root = resolve(directory);
  const index = join(root, "index.html");
  if (!existsSync(index)) return false;
  app.use(
    express.static(root, { index: false, dotfiles: "deny", maxAge: "1h" }),
  );
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (!req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(index);
  });
  return true;
}
