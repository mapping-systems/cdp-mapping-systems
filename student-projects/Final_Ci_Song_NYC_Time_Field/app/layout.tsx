import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const SITE_URL =
  "https://cisanotheraccount.github.io/cdp-mapping-systems_Ci/";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NYC TIME FIELD",
    template: "%s · NYC TIME FIELD",
  },
  description:
    "Where can 30 minutes take you? A scheduled subway and walking accessibility model for New York City.",
  applicationName: "NYC TIME FIELD",
  icons: {
    icon: `${SITE_URL}favicon.svg`,
  },
  keywords: [
    "New York City",
    "subway",
    "commute",
    "isochrone",
    "H3",
    "Mapping Systems",
  ],
  openGraph: {
    title: "NYC TIME FIELD",
    description:
      "A circle measures distance. A network measures opportunity.",
    type: "website",
    images: [
      {
        url: `${SITE_URL}og.png`,
        width: 1731,
        height: 909,
        alt: "NYC TIME FIELD transit accessibility visualization",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NYC TIME FIELD",
    description:
      "A circle measures distance. A network measures opportunity.",
    images: [`${SITE_URL}og.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script src="/vendor/maplibre-gl.js" strategy="beforeInteractive" />
        <Script src="/map-renderer-runtime.js" strategy="beforeInteractive" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
