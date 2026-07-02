import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TicketBox — Đặt Vé Concert",
  description:
    "Nền tảng đặt vé concert dành cho giới trẻ. Trải nghiệm đặt vé nhanh chóng, hiện đại và an toàn.",
  keywords: ["concert", "ticket", "booking", "vietnam", "event", "music"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${nunitoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster position="top-center" reverseOrder={false} />
      </body>
    </html>
  );
}
