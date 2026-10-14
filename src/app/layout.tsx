import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Radar",
  description: "Research any company in a minute.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ToastProvider>
          <Header />
          <main className="mx-auto max-w-[720px] px-4 py-10 sm:px-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
