import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/query-provider";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AccountLifecycleProvider } from "@/components/account-lifecycle-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { DraftCleanup } from "@/components/draft-cleanup";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fairlx",
  description: "A simple and efficient project management tool.",
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const initialState = await resolveAccountState();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, "antialiased min-h-screen")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>
            <QueryProvider>
              <Toaster />
              <DraftCleanup />
              <AccountLifecycleProvider>
                {children}
              </AccountLifecycleProvider>
            </QueryProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
