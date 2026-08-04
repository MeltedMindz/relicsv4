import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "relics-v4-starter",
  description:
    "Educational starter for fully on-chain generative art powered by Uniswap v4 hooks. Not audited, not affiliated with any production collection.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="container">{children}</main>
          <footer className="footer">
            <p>
              Educational starter. NOT audited. NOT affiliated with Uniswap, OpenZeppelin,
              OpenSea, or any production collection. Do your own security, legal, and economic
              review before deploying anything.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
