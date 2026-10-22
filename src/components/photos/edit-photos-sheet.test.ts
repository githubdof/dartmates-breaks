import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditPhotosSheet } from "./edit-photos-sheet";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/photos/actions", () => ({
  describePhotoAction: vi.fn(), removePhotoAction: vi.fn(), reorderPhotosAction: vi.fn(), requestPhotoUpload: vi.fn(), retagPhotoAction: vi.fn(),
}));

describe("EditPhotosSheet", () => {
  it("renders the Edit photos button and no open sheet", () => {
    const h = renderToStaticMarkup(createElement(EditPhotosSheet, { breakId: "b1", initial: [], prizes: [], title: "T", max: 8, claimed: false }));
    expect(h).toMatch(/<button[^>]*data-testid="edit-photos"[^>]*>Edit photos<\/button>/);
    expect(h).not.toContain('data-testid="photo-strip"');
  });
});
