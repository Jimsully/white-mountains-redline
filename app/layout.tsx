import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "White Mountains Redline",
  description: "An independent White Mountains trail-completion tracker.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
