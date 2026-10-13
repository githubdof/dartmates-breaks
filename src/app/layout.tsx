import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Breaks",
  description: "Group buys for darts gear, with a draw you can check.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
