import { z } from "zod";
import { DARK_COLOURS, LIGHT_COLOURS, isFlightColour, isFlightShape, type FlightColour, type FlightShape } from "@/domain/flights";

const schema = z.object({
  displayName: z.string().trim().min(1, "Display name: at least 1 character").max(40, "Display name: at most 40 characters"),
  paymentName: z.string().trim().max(60, "Payment name: at most 60 characters"),
});

export type AccountInput = { displayName: string; paymentName: string };

/** FormData → updateProfile input. A missing field reads as blank. */
export function parseAccount(form: FormData): { ok: true; input: AccountInput } | { ok: false; error: string } {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  const p = schema.safeParse({ displayName: text("displayName"), paymentName: text("paymentName") });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again" };
  return { ok: true, input: p.data };
}

export type FlightInput = { colour: FlightColour; shape: FlightShape };
export type KitInput = { dark: FlightColour; light: FlightColour };

/** FormData → updateFlight input. The picker is one radio group named "flight" whose values are "<colour>-<shape>". */
export function parseFlight(form: FormData): { ok: true; input: FlightInput } | { ok: false; error: string } {
  const v = form.get("flight");
  const [colour, shape, extra] = typeof v === "string" ? v.split("-") : [];
  if (colour && shape && extra === undefined && isFlightColour(colour) && isFlightShape(shape)) return { ok: true, input: { colour, shape } };
  return { ok: false, error: "Choose one of the 32 flights" };
}

/** FormData → updateHostKit input: radio groups "kitDark" (petrol, blue, plum) and "kitLight" (yellow, orange, lime, sky, pink). */
export function parseKit(form: FormData): { ok: true; input: KitInput } | { ok: false; error: string } {
  const dark = form.get("kitDark");
  const light = form.get("kitLight");
  if (typeof dark === "string" && typeof light === "string" && isFlightColour(dark) && isFlightColour(light) && DARK_COLOURS.includes(dark) && LIGHT_COLOURS.includes(light)) {
    return { ok: true, input: { dark, light } };
  }
  return { ok: false, error: "Choose a dark colour and a light colour for your kit" };
}
