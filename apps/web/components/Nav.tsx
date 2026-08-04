import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { collectionConfig } from "@config";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/acquire", label: "Acquire" },
  { href: "/mint", label: "Mint / Awaken" },
  { href: "/explore", label: "Explore" },
  { href: "/technical", label: "Technical" },
];

export function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          {collectionConfig.tokenSymbol}
        </Link>
        <nav className="links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}
