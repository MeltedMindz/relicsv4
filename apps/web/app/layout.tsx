import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { collectionConfig } from "@config";

export const metadata: Metadata = {
  title: collectionConfig.nftName,
  description: collectionConfig.description,
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
