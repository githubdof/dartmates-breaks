import { FLIGHT_COLOURS, type Kit } from "@/domain/flights";

/** The host's kit beside "Hosted by @jim" (Mosaic §4): 20 × 10 px, split dark | light. Decorative: copy never names a kit. */
export function KitSwatch({ kit }: { kit: Kit }) {
  return (
    <span aria-hidden data-testid="kit-swatch" className="inline-block h-[10px] w-5 shrink-0"
      style={{ background: `linear-gradient(90deg, ${FLIGHT_COLOURS[kit.dark].face} 50%, ${FLIGHT_COLOURS[kit.light].face} 50%)` }} />
  );
}
