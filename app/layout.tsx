import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayMeld - Sync playlists across music platforms",
  description: "Connect Spotify, Apple Music, YouTube Music and more. Transfer and synchronize playlists seamlessly with BullMQ background jobs.",
  keywords: ["music", "playlist", "sync", "Spotify", "Apple Music", "YouTube Music", "SaaS", "BullMQ"],
  authors: [{ name: "PlayMeld" }],
  openGraph: {
    title: "PlayMeld - Sync playlists across music platforms",
    description: "Connect Spotify, Apple Music, YouTube Music and more. Transfer and synchronize playlists seamlessly.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never disable zoom - accessibility
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7C3AED" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F23" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        {children}
      </body>
    </html>
  );
}
