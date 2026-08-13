import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

// robots: noindex — this is an internal production-management tool, not
// a public site; nothing here should end up in a search index. Not
// asked for explicitly, added on the same reasoning as the rest of the
// app's privacy posture.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: "Backlot",
  description: "Internal production management platform",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Backlot",
    description: "Internal production management platform",
    siteName: "Backlot",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Backlot",
    description: "Internal production management platform",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;600;700;800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+Malayalam:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
