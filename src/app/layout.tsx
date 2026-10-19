import { SITE_NAME } from "@/shared/config/site";
import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${SITE_NAME} — India's First AYUSH Digital Health Platform`,
  description:
    `Reinvent You. ${SITE_NAME} connects patients with verified AYUSH practitioners across Ayurveda, Yoga, Naturopathy, Unani, Siddha & Homeopathy — with smart booking, telemedicine, EMR, AI wellness, and ABDM-integrated care.`,
  keywords: "AYUSH, Ayurveda, digital health, telemedicine, ABDM, ABHA, India health",
  openGraph: {
    title: `${SITE_NAME} — Reinvent You`,
    description: "India's First AYUSH Digital Health Platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
