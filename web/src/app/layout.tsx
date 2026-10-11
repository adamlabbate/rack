import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { BorrowProvider } from "@/components/borrow-context";
import { BottomTabs, TabBar } from "@/components/bottom-tabs";
import { ThemeSync } from "@/components/theme-sync";
import { UserProvider } from "@/components/user-context";
import { THEME_SCRIPT } from "@/lib/theme";
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
  title: "Rack",
  description: "Your closet, styled by Gemini, shared with friends.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the tab bar sit above the iPhone home indicator
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the <head> script adds the "dark" class before React hydrates.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Light or dark before the first paint, so a dark phone never flashes white (lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background">
        <ThemeSync />
        <UserProvider>
          <BorrowProvider>
            <div className="mx-auto flex min-h-dvh max-w-md flex-col">
              <AppHeader />
              <main className="flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
                {children}
              </main>
            </div>
            {/* usePathname() is request data on dynamic routes like /friends/user/2, so it needs Suspense. */}
            <Suspense fallback={<TabBar pathname={null} />}>
              <BottomTabs />
            </Suspense>
          </BorrowProvider>
        </UserProvider>
      </body>
    </html>
  );
}
