import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayMeld - Sync playlists across music platforms",
  description: "Connect Spotify, Apple Music, YouTube Music and more. Transfer and synchronize playlists seamlessly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background">{children}</body>
    </html>
  );
}
