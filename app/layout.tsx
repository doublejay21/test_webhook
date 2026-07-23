import type { Metadata } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-noto-sans-thai",
  weight: ["300", "400", "500", "600", "700"],
});

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
      <body className={`${inter.variable} ${notoSansThai.variable} font-sans antialiased text-slate-900 selection:bg-pink-100 selection:text-pink-900 bg-slate-50 relative overflow-x-hidden transition-colors duration-300`}>
        {/* Dreamy Purple-Pink Background (Static & Performant) */}
        <div className="fixed inset-0 -z-10 bg-gradient-to-br from-fuchsia-50 via-white to-pink-50 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/40 blur-[120px]"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-pink-200/40 blur-[120px]"></div>
        </div>
        {children}
      </body>
    </html>
  );
}