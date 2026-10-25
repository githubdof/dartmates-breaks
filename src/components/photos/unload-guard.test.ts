import { describe, expect, it, vi } from "vitest";
import { LEAVE_WHILE_UPLOADING, guardLinks, guardUnload } from "./unload-guard";

describe("guardLinks (spec §5.3: leaving with uploads in flight asks first)", () => {
  type Click = { target: unknown; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean; preventDefault: () => void; stopPropagation: () => void };
  const anchor = (attrs: Record<string, string>) => ({
    closest: (sel: string) => (sel === "a[href]" && "href" in attrs ? { getAttribute: (k: string) => attrs[k] ?? null, hasAttribute: (k: string) => k in attrs } : null),
  });
  const click = (target: unknown, o: Partial<Click> = {}): Click => ({
    target, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), ...o,
  });
  const setup = (answer: boolean) => {
    const doc = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const ask = vi.fn(() => answer);
    const stop = guardLinks(doc, true, ask);
    const [type, handler, capture] = doc.addEventListener.mock.calls[0];
    return { doc, ask, stop, type, handler: handler as (e: Click) => void, capture };
  };

  it("listens for clicks in the capture phase, before the router's own handler, and the cleanup removes it", () => {
    const { doc, stop, type, handler, capture } = setup(true);
    expect([type, capture]).toEqual(["click", true]);
    stop();
    expect(doc.removeEventListener).toHaveBeenCalledWith("click", handler, true);
  });
  it("a link clicked and refused stays put: the navigation is cancelled before anything else sees it", () => {
    const { ask, handler } = setup(false);
    const e = click(anchor({ href: "/account" }));
    handler(e);
    expect(ask).toHaveBeenCalledWith(LEAVE_WHILE_UPLOADING);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });
  it("a link clicked and agreed to goes ahead untouched", () => {
    const { handler } = setup(true);
    const e = click(anchor({ href: "/account" }));
    handler(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
  it("asks nothing for what does not leave this tab: a button, a new tab, a download, a modified click, an in-page anchor", () => {
    const { ask, handler } = setup(false);
    handler(click({ closest: () => null }));
    handler(click(anchor({ href: "/x", target: "_blank" })));
    handler(click(anchor({ href: "/x", download: "" })));
    handler(click(anchor({ href: "/x" }), { metaKey: true }));
    handler(click(anchor({ href: "/x" }), { button: 1 }));
    handler(click(anchor({ href: "#prizes" })));
    handler(click(anchor({ href: "/x" }), { defaultPrevented: true }));
    expect(ask).not.toHaveBeenCalled();
  });
  it("adds nothing when nothing is in flight", () => {
    const doc = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    guardLinks(doc, false, () => false)();
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });
});

const target = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() });

it("adds one beforeunload handler while uploads are in flight, and the cleanup removes that same handler", () => {
  const t = target();
  const stop = guardUnload(t, true);
  expect(t.addEventListener).toHaveBeenCalledTimes(1);
  const [type, handler] = t.addEventListener.mock.calls[0];
  expect(type).toBe("beforeunload");
  const e = { preventDefault: vi.fn(), returnValue: undefined as unknown };
  handler(e);
  expect(e.preventDefault).toHaveBeenCalledTimes(1);
  expect(e.returnValue).toBe("");
  stop();
  expect(t.removeEventListener).toHaveBeenCalledWith("beforeunload", handler);
});
it("adds nothing when nothing is in flight", () => {
  const t = target();
  guardUnload(t, false)();
  expect(t.addEventListener).not.toHaveBeenCalled();
  expect(t.removeEventListener).not.toHaveBeenCalled();
});
