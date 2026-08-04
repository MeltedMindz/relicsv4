import Link from "next/link";
import { WalletButton } from "./WalletButton";

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
          relics-v4-starter
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
