import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getAuth } from "@/lib/auth";
import { RoleProvider } from "./RoleControls";
import Nav from "./Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DiscoveryOS",
  description: "Manual transcript-first live discovery HUD",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { role, userId } = await getAuth();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RoleProvider role={role}>
          <Nav signedIn={!!userId} role={role} />
          {children}
        </RoleProvider>
      </body>
    </html>
  );
}
