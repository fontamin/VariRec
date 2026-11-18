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
  title: "VariRec — Variable Font Animation Studio",
  description:
    "Drag & drop a variable font, animate its axes, and export the result as GIF, MP4 or WebM — entirely in your browser. Built with Z.ai.",
  keywords: [
    "VariRec",
    "variable font",
    "font animation",
    "variable axes",
    "font-variation-settings",
    "GIF export",
    "MP4 export",
    "WebM export",
    "typography",
    "WebCodecs",
  ],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "VariRec — Variable Font Animation Studio",
    description:
      "Animate variable font axes and export to GIF, MP4 or WebM — 100% client-side, built with Z.ai.",
    siteName: "VariRec",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VariRec — Variable Font Animation Studio",
    description:
      "Animate variable font axes and export to GIF, MP4 or WebM — 100% client-side, built with Z.ai.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
