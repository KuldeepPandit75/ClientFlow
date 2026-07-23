import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "ClientFlow",
  description: "ClientFlow WhatsApp inbox MVP powered by Evolution API",
  icons: {
    icon: "/brand-app-icon.png",
    shortcut: "/brand-app-icon.png",
    apple: "/brand-app-icon.png",
  },
  openGraph: {
    title: "ClientFlow",
    description: "ClientFlow WhatsApp inbox MVP powered by Evolution API",
    images: ["/logowithname.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
