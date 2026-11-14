import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Animal Admin | User management",
  description: "Admin dashboard for managing user accounts and roles.",
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = { themeColor: "#0a0d13", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
