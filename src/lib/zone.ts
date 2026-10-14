import "server-only";
import { cookies } from "next/headers";
import { resolveZone, type Zone } from "./time";

/** The zone for server-rendered fallbacks: the tz cookie when valid (unlabelled), else America/New_York, labelled. */
export async function viewerZone(): Promise<Zone> {
  return resolveZone((await cookies()).get("tz")?.value);
}
