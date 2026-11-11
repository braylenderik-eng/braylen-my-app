import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { GameProvider } from "@/components/GameProvider";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const display = Oswald({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Portal Wars",
  description: "College football GM game: recruit, work the January transfer window, set your game plan and chase a title.",
  applicationName: "Portal Wars",
};

export const viewport: Viewport = {
  themeColor: "#0b101c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <GameProvider>
          <AppShell>{children}</AppShell>
        </GameProvider>
      </body>
    </html>
  );
}
