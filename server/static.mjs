import express from "express";
import { existsSync } from "node:fs";
import { resolve, join, sep, extname } from "node:path";

/** Serve only the exported web bundle; user data and recordings are outside this root. */
export function serveWeb(app, directory = resolve("dist")) {
  const root = resolve(directory);
  const index = join(root, "index.html");
  if (!existsSync(index)) return false;
  const cacheControl = (file) =>
    /[.-][a-f0-9]{16,}\./i.test(file)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) ||
      /^\/api(?:\/|$)/.test(req.path)
    )
      return next();
    let pathname;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (
      !/\.(?:js|css|svg|json|ttf)$/.test(pathname) ||
      pathname.split("/").some((part) => part.startsWith("."))
    )
      return next();
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root + sep) || !existsSync(file)) return next();
    res.vary("Accept-Encoding");
    const available = ["br", "gzip"].filter((encoding) =>
      existsSync(`${file}.${encoding === "gzip" ? "gz" : "br"}`),
    );
    const encoding = req.acceptsEncodings(...available, "identity");
    if (!encoding || encoding === "identity") return next();
    res.type(extname(file));
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Cache-Control", cacheControl(file));
    return res.sendFile(`${file}.${encoding === "gzip" ? "gz" : "br"}`);
  });
  app.use(
    express.static(root, {
      index: false,
      dotfiles: "deny",
      maxAge: "1h",
      setHeaders: (res, file) =>
        res.setHeader("Cache-Control", cacheControl(file)),
    }),
  );
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (!req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(index);
  });
  return true;
}
