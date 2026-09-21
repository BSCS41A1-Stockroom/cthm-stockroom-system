import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const output = join(process.cwd(), "dist");
const assets = join(output, "assets");
const cssFiles = readdirSync(assets).filter((file) => file.endsWith(".css"));

if (cssFiles.length !== 1) {
  throw new Error(`Expected one shared stylesheet for all portal layouts; found ${cssFiles.length}.`);
}

const html = readFileSync(join(output, "index.html"), "utf8");
const css = readFileSync(join(assets, cssFiles[0]), "utf8");
if (!html.includes(`/assets/${cssFiles[0]}`)) {
  throw new Error("The shared stylesheet is not linked from index.html.");
}

for (const selector of ["layout", "sidebar", "topbar", "admin-layout", "professor-layout"]) {
  if (!new RegExp(`\\.${selector}\\s*\\{`).test(css)) {
    throw new Error(`The shared stylesheet is missing .${selector} layout styles.`);
  }
}

console.log("Verified shared portal styles in the production build.");
