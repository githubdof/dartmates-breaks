import Link from "next/link";

/** Terms and how draws work. Contact joins once the owner picks an address (design §8). */
export function Footer() {
  const link = "inline-flex min-h-11 items-center underline underline-offset-4";
  return (
    <footer className="mx-auto max-w-[960px] px-4 py-6 text-small text-ink-2 sm:px-6">
      <nav aria-label="Footer">
        <ul className="flex flex-wrap gap-x-4">
          <li><Link className={link} href="/legal/terms">Terms</Link></li>
          <li><Link className={link} href="/legal/draw">How draws work</Link></li>
        </ul>
      </nav>
    </footer>
  );
}
