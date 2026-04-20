import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = path.join(appDir, "public");
const destination = path.join(publicDir, "altcha.js");

function findPackageDir(resolvedPath) {
  let current = path.dirname(resolvedPath);

  while (current !== path.dirname(current)) {
    const packageJson = path.join(current, "package.json");

    if (fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
        if (pkg.name === "altcha") return current;
      } catch {
        return null;
      }
    }

    current = path.dirname(current);
  }

  return null;
}

const resolved = [];

if (typeof import.meta.resolve === "function") {
  resolved.push(fileURLToPath(import.meta.resolve("altcha")));
}

resolved.push(require.resolve("altcha"));

const candidates = [];

for (const resolvedPath of resolved) {
  const packageDir = findPackageDir(resolvedPath);

  if (packageDir) {
    candidates.push(
      path.join(packageDir, "dist", "altcha.js"),
      path.join(packageDir, "dist", "altcha.min.js"),
      path.join(packageDir, "dist_external", "altcha.js"),
    );
  }

  candidates.push(resolvedPath);
}

const source = candidates.find((candidate) => fs.existsSync(candidate));

if (source) {
  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(`Copied ALTCHA widget from ${path.relative(appDir, source)}.`);
} else if (fs.existsSync(destination)) {
  console.warn("ALTCHA package asset was not found; keeping existing public/altcha.js.");
} else {
  throw new Error("Unable to find the ALTCHA widget asset to copy into public/altcha.js.");
}
