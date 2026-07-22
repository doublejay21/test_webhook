import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interior Designer",
  description:
    "ออกแบบห้องจากแปลน รูปห้อง และเฟอร์นิเจอร์ด้วย AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}