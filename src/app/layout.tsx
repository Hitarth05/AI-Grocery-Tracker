import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fridge",
  description: "Track what's in your fridge and use it before it expires.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Fridge" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the app paint under the status bar / home indicator; the safe-area
  // padding in the layout below keeps content out from under them.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased`}>
        {/* Single column, phone width. Desktop gets the same column centered
            rather than a different layout — one thing to maintain. */}
        <div className="mx-auto min-h-dvh w-full max-w-md">{children}</div>
      </body>
    </html>
  );
}
