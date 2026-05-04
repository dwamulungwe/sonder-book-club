import type { Metadata } from "next";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full text-zinc-950">
        {children}
      </body>
    </html>
  );
}
