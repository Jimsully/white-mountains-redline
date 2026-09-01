import type { Metadata } from "next";
import { rootMetadata } from "@/lib/seo/metadata";
import "./globals.css";

export const metadata: Metadata = rootMetadata();

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
