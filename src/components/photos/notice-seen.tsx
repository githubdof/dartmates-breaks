"use client";
import { useEffect } from "react";
import { markPhotoNoticeSeenAction } from "@/app/photos/actions";
import { markSeenOnce } from "./notice-seen-logic";

/** Records, after the page renders for a holder, that they saw the latest photo change. Renders nothing. */
export function NoticeSeen({ breakId, unseen }: { breakId: string; unseen: boolean }) {
  useEffect(() => { void markSeenOnce(breakId, unseen, markPhotoNoticeSeenAction); }, [breakId, unseen]);
  return null;
}
