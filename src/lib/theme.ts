/**
 * The one place a design token has to exist as a JS value.
 *
 * `themeColor` in Next's metadata sets the browser-chrome colour and has to
 * be a literal string — it can't read a CSS custom property. Rather than let
 * that become a quiet second source of truth for the page ground, it lives
 * here and `pnpm run check:tokens` asserts it still equals `--background` in
 * globals.css. If they ever drift, the check fails.
 */
export const PAGE_BACKGROUND = "#f5e9dc";
