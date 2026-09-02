import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";

import { PAGE_BACKGROUND } from "@/lib/theme";

import "./globals.css";

// Two roles. Bricolage carries headings and eyebrows via .type-display;
// Figtree is the app font, set on body in globals.css.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});
const body = Figtree({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grocery Tracker",
  description: "Track what's in your fridge and use it before it expires.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    // Shown under the icon when added to the home screen, where space is
    // tight — the short form reads better there than the full name.
    title: "Groceries",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the app paint under the status bar / home indicator; the safe-area
  // padding in the layout below keeps content out from under them.
  viewportFit: "cover",
  // Matches the page ground so the browser chrome blends into the app.
  // Kept in sync with --background by pnpm run check:tokens.
  themeColor: PAGE_BACKGROUND,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} antialiased`}
      >
        {/* Single column, phone width. Desktop gets the same column centered
            rather than a different layout — one thing to maintain. */}
        <div className="mx-auto min-h-dvh w-full max-w-md">{children}</div>
      </body>
    </html>
  );
}
