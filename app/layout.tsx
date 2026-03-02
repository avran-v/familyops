import type { ReactNode } from "react";
import "../styles.css";
import { Nunito } from "next/font/google";
import { CommandPalette } from "./command-palette";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-familyops",
});

export const metadata = {
  title: "FamilyOps",
  description: "Shared household financial transparency with AI support",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${nunito.variable} min-h-screen bg-background antialiased font-sans`}
      >
        {children}
        <CommandPalette />
      </body>
    </html>
  );
}