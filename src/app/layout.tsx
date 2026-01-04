import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/query-provider";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AccountProvider } from "@/components/account-provider";
import { resolveAccountState } from "@/features/auth/server/actions";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fairlx",
  description: "A simple and efficient project management tool.",
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = await resolveAccountState();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, "antialiased min-h-screen")}>
        <NuqsAdapter>
          <QueryProvider>
            <Toaster />
            <AccountProvider initialState={initialState}>
              {children}
            </AccountProvider>
          </QueryProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
