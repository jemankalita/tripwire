import type { Metadata, Viewport } from "next";
import { Geist_Mono, Hanken_Grotesk } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Tripwire — real changes, not noise", template: "%s · Tripwire" },
  description:
    "Tripwire watches public web pages and sends one alert when something meaningful changes. Clocks, counters, ads, rotating banners and CAPTCHAs never reach you.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dfdedb" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hanken.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
