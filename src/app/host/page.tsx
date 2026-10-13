import Link from "next/link";
import { sql, eq, desc } from "drizzle-orm";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { breaks } from "@/db/schema";

export default async function HostHome() {
  const caller = await requireCaller("/host");
  if (caller.role !== "host" && caller.role !== "admin") return <main className="p-4">Only hosts can list a break.</main>;
  const rows = await db.select({ id: breaks.id, title: breaks.title, status: breaks.status, lineCount: breaks.lineCount,
    paid: sql<number>`(select count(*)::int from lines l where l.break_id = ${breaks.id} and l.paid_at is not null and l.number <= ${breaks.lineCount})` })
    .from(breaks).where(eq(breaks.hostId, caller.id)).orderBy(desc(breaks.createdAt));
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">My breaks</h1><Link href="/host/new" className="rounded bg-black px-3 py-2 text-sm text-white">New break</Link></div>
      <ul className="mt-4 divide-y">
        {rows.map((b) => (
          <li key={b.id} className="py-3"><Link href={`/b/${b.id}`} className="block"><div className="font-medium">{b.title}</div><div className="text-sm text-neutral-600">{b.status} · {b.paid}/{b.lineCount} paid</div></Link></li>
        ))}
        {rows.length === 0 && <li className="py-3 text-sm text-neutral-600">No breaks yet.</li>}
      </ul>
    </main>
  );
}
