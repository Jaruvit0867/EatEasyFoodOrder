import type { Metadata } from "next";
import { Chonburi, Sarabun } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-sarabun",
});

const chonburi = Chonburi({
  weight: "400",
  subsets: ["thai", "latin"],
  variable: "--font-chonburi",
});

export const metadata: Metadata = {
  title: "EatEasy Order",
  description: "ระบบสั่งอาหารด้วยเสียงสำหรับร้านอาหารตามสั่ง",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${sarabun.variable} ${chonburi.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
