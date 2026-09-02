/**
 * Guards the invariant that every primary action renders the same green.
 *
 * The failure this exists to catch is not "someone picked the wrong hex" —
 * it's the quieter one where a button stops resolving to the token at all
 * and silently loses its fill, or a screen reintroduces a literal that
 * looks right today and drifts later.
 *
 * Run: pnpm run check:tokens
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const CSS = "src/app/globals.css";
const SRC = "src";

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const css = readFileSync(CSS, "utf8");
const failures = [];
const checks = [];

function check(label, ok, detail) {
  checks.push({ label, ok, detail });
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

// 1. Exactly one definition of the green.
const defs = [...css.matchAll(/--primary:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1]);
check(
  "--primary is defined exactly once",
  defs.length === 1,
  `found ${defs.length}: ${defs.join(", ") || "none"}`,
);

// 2. The primary button resolves to the token, never to a literal.
const rule = css.match(/\.btn-primary\s*\{([^}]*)\}/);
check("`.btn-primary` rule exists", Boolean(rule));
check(
  "`.btn-primary` fills from var(--primary)",
  Boolean(rule && /background:\s*var\(--primary\)/.test(rule[1])),
  rule ? rule[1].trim() : "",
);

// 3. Components sit in a layer, so preflight can't strip the fill and a
//    utility can still override deliberately.
check(
  "component classes are in @layer components",
  /@layer components\s*\{/.test(css),
);

// 4. No colour literals in components — the token must be the only source.
const files = walk(SRC).filter((f) => [".tsx", ".ts"].includes(extname(f)));
const literals = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    const hit = line.match(
      /(?:bg|text|border|ring)-(?:emerald|green|red|amber|orange|neutral|stone|slate|gray|zinc)-\d{2,3}|#[0-9a-fA-F]{6}\b/,
    );
    // globals.css owns the palette; TSX may reference tokens via var(--…),
    // and lib/theme.ts is the one declared bridge for values the framework
    // needs as JS strings — checked separately below.
    if (hit && !line.includes("var(--") && !file.endsWith("lib/theme.ts")) {
      literals.push(`${file}:${i + 1}  ${hit[0]}`);
    }
  });
}
check("no colour literals in src", literals.length === 0, literals.join("\n    "));

// 5. Every primary button inherits the fill rather than setting its own.
const conflicts = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("btn-primary") && /\bbg-\S+/.test(line)) {
        conflicts.push(`${file}:${i + 1}`);
      }
    });
}
check(
  "no primary button overrides its own background",
  conflicts.length === 0,
  conflicts.join(", "),
);

// 6. The one JS-side colour must still agree with the CSS token it mirrors.
const bridged = readFileSync("src/lib/theme.ts", "utf8").match(
  /PAGE_BACKGROUND\s*=\s*"(#[0-9a-fA-F]{6})"/,
);
const cssBackground = css.match(/--background:\s*(#[0-9a-fA-F]{6})/);
check(
  "lib/theme.ts PAGE_BACKGROUND matches --background",
  Boolean(bridged && cssBackground && bridged[1] === cssBackground[1]),
  `theme.ts ${bridged?.[1] ?? "?"} vs css ${cssBackground?.[1] ?? "?"}`,
);

for (const { label, ok, detail } of checks) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

if (failures.length) {
  console.error(`\n${failures.length} design-token check(s) failed.`);
  process.exit(1);
}
console.log("\nAll primary actions resolve to the one --primary token.");
