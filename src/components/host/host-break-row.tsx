import Link from "next/link";
import type { HostBreakRow as Row } from "@/domain/breaks/queries";
import type { PhotoSrc } from "@/photos/urls";
import { DeleteDraftButton } from "@/app/host/delete-draft-button";
import { FillBar } from "@/components/fill-bar";
import { Plate } from "@/components/photos/plate";
import { StatusPill } from "@/components/status-pill";

/** One break in the /host list. The lead photo (public bucket only, so a draft has none) is a decorative plate beside the title. */
export function HostBreakRow({ b, photo }: { b: Row; photo: PhotoSrc | null }) {
  return (
    <li>
      <Link href={b.status === "draft" ? `/host/${b.id}/edit` : `/b/${b.id}`} className="flex gap-3 px-4 py-3">
        {photo && <Plate photo={photo} size={40} surface="paper" decorative />}
        <span className="block min-w-0 flex-1 space-y-2">
          <span className="flex items-start justify-between gap-3">
            <span className="font-semibold">{b.title}</span>
            <StatusPill status={b.status} />
          </span>
          <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} />
          <span className="block text-small text-ink-2 tabular">{b.paid} of {b.lineCount} paid</span>
        </span>
      </Link>
      {b.status === "draft" && <div className="px-4 pb-3"><DeleteDraftButton breakId={b.id} title={b.title} /></div>}
    </li>
  );
}
