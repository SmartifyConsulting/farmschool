import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function prepareOcrAssets(root: string) {
  const require = createRequire(join(root, "package.json"));
  const target = join(root, "public", "ocr", "v7-eng1");
  mkdirSync(target, { recursive: true });
  const engine = dirname(require.resolve("tesseract.js-core/package.json"));
  const client = dirname(require.resolve("tesseract.js/package.json"));
  const language = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
  const cores = readdirSync(engine).filter((name) =>
    /^tesseract-core(?:-[a-z-]+)?\.wasm\.js$/.test(name),
  );
  if (cores.length !== 6) throw new Error("Expected the six pinned OCR engine variants");
  for (const name of cores) copyFileSync(join(engine, name), join(target, name));
  copyFileSync(join(client, "dist", "worker.min.js"), join(target, "worker.min.js"));
  copyFileSync(join(client, "LICENSE.md"), join(target, "TESSERACT-LICENSE.txt"));
  copyFileSync(join(engine, "LICENSE"), join(target, "CORE-LICENSE.txt"));
  copyFileSync(
    join(language, "4.0.0_best_int", "eng.traineddata.gz"),
    join(target, "eng.traineddata.gz"),
  );
}
