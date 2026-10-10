import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { BottomTabs } from "@/components/bottom-tabs";
import { UserProvider } from "@/components/user-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pull",
  description: "Your closet, styled by Gemini, shared with friends.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the tab bar sit above the iPhone home indicator
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background">
        <UserProvider>
          <div className="mx-auto flex min-h-dvh max-w-md flex-col">
            <AppHeader />
            <main className="flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
              {children}
            </main>
          </div>
          <BottomTabs />
        </UserProvider>
      </body>
    </html>
  );
}
