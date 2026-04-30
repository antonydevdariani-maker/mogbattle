import type { Metadata } from "next";
import { IBM_Plex_Mono, Lora, Plus_Jakarta_Sans } from "next/font/google";
import { MogBattlePrivyProvider } from "@/components/providers/privy-provider";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MogBattle — 1v1 Face-Off Arena",
  description: "Queue. Bet. Mog. The highest-stakes 1v1 face rating arena on the internet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <MogBattlePrivyProvider>
      <html
        lang="en"
        className={`${plusJakarta.variable} ${ibmPlexMono.variable} ${lora.variable} dark h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </MogBattlePrivyProvider>
  );
}
