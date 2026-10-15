import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FLIGHT_COLOURS } from "@/domain/flights";
import { ComposerForm } from "./form";
import { newComposerInitial } from "./initial";

// The server action is never called by a static render; stub it so the form's import pulls in no database.
vi.mock("./actions", () => ({ saveBreak: async () => null }));

describe("the composer's board preview (recorded ruling 32)", () => {
  it("wears the host's kit, so the host previews the board in the kit it opens in", () => {
    const h = renderToStaticMarkup(createElement(ComposerForm, { initial: newComposerInitial(null, {}), maxLines: 100, kit: { dark: "plum", light: "lime" } }));
    expect(h).toContain(`--kit-dark:${FLIGHT_COLOURS.plum.face}`);
    expect(h).toContain(`--kit-light:${FLIGHT_COLOURS.lime.face}`);
    expect(h).not.toContain(FLIGHT_COLOURS.blue.face);
  });
});
