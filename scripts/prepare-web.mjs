import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { brotliCompress, constants, gzip } from "node:zlib";
import { promisify } from "node:util";

const root = resolve("dist");
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));
const fontFiles = files.filter((file) =>
  /(?:DMSans|Lora|Feather)[^/]*\.woff2$/.test(file),
);
const index = join(root, "index.html");
let html = await readFile(index, "utf8");
// Fonts begin downloading with the document instead of waiting for JavaScript.
const preloads = fontFiles
  .map(
    (file) =>
      `<link rel="preload" href="/${relative(root, file).split("\\").join("/")}" as="font" type="font/woff2" crossorigin>`,
  )
  .join("");
html = html.replace(
  "</head>",
  `${preloads}<meta name="description" content="Find your voice with daily speaking practice, thoughtful feedback and new perspectives."></head>`,
);
await writeFile(index, html);

const br = promisify(brotliCompress),
  gz = promisify(gzip);
let compressed = 0;
for (const file of files.filter((file) =>
  /\.(?:js|css|svg|json|ttf|html)$/.test(file),
)) {
  const input = await readFile(file);
  if (input.length < 1024) continue;
  const [brotli, gzipBytes] = await Promise.all([
    br(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
    gz(input, { level: 9 }),
  ]);
  if (brotli.length >= input.length || gzipBytes.length >= input.length)
    continue;
  await Promise.all([
    writeFile(`${file}.br`, brotli),
    writeFile(`${file}.gz`, gzipBytes),
  ]);
  compressed++;
}
console.log(
  `Prepared ${fontFiles.length} font preloads and ${compressed} compressed web assets.`,
);
