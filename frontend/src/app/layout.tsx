import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-sarabun",
});

export const metadata: Metadata = {
  title: "ร้านข้าวแกง | สั่งอาหารด้วยเสียง",
  description: "ระบบสั่งอาหารด้วยเสียงสำหรับร้านข้าวแกง - Voice-Controlled Ordering System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${sarabun.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
