import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeTranslator Agent - AI-Powered Code Translation",
  description: "Translate code between programming languages with AI-powered analysis, translation, and verification.",
  keywords: ["Code Translation", "AI", "Next.js", "TypeScript", "LLM"],
  authors: [{ name: "CodeTranslator Team" }],
  icons: {
    icon: "/codetranslator.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
          {children}
          <Toaster />
      </body>
    </html>
  );
}
