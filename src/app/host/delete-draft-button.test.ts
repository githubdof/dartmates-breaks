import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeleteDraftButton } from "./delete-draft-button";

vi.mock("./actions", () => ({ deleteDraftAction: vi.fn() }));

describe("DeleteDraftButton", () => {
  it("renders the Delete draft button and keeps the confirm closed", () => {
    const h = renderToStaticMarkup(createElement(DeleteDraftButton, { breakId: "6f1c2a3b-0000-4000-8000-000000000001", title: "Target Chronos" }));
    expect(h).toMatch(/<button[^>]*type="button"[^>]*data-testid="delete-draft"[^>]*>Delete draft<\/button>|<button[^>]*data-testid="delete-draft"[^>]*type="button"[^>]*>Delete draft<\/button>/);
    expect(h).not.toContain("Delete this draft?");
    expect(h).not.toContain('data-testid="delete-draft-confirm"');
  });
});
