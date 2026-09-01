"use client";

import Link from "next/link";

type PublicNavSection = "map" | "trails" | "account";

type Props = {
  current?: PublicNavSection;
  compact?: boolean;
};

const navItems: { href: string; label: string; section: PublicNavSection }[] = [
  { href: "/", label: "Redline Map", section: "map" },
  { href: "/trails", label: "Trails", section: "trails" },
  { href: "/account", label: "Account", section: "account" },
];

export function PublicNav({ current, compact = false }: Props) {
  return (
    <nav className={compact ? "publicNav compact" : "publicNav"} aria-label="Primary">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} aria-current={current === item.section ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
