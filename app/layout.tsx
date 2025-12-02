import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs"
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HiveChat",
  description: "Real-time Team Chat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="max-w-6xl mx-auto min-h-screen bg-slate-950 text-slate-50 antialiased pt-20 px-4 sm:px-6 lg:px-8">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
