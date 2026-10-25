// Import-free on purpose: the client composer imports it (plan D ruling 6).

/** A prize's condition (photos spec §7, decision 16). */
export const ITEM_CONDITIONS = ["new_in_box", "new_opened", "used"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];
export const isItemCondition = (v: unknown): v is ItemCondition => typeof v === "string" && (ITEM_CONDITIONS as readonly string[]).includes(v);

export const CONDITION_LABEL: Record<ItemCondition, string> = { new_in_box: "New in box", new_opened: "New, opened", used: "Used" };
