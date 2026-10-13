export type Role = "member" | "host" | "admin";
export type Caller = { id: string; role: Role; onboarded: boolean; banned: boolean };
export const SYSTEM: Caller = { id: "00000000-0000-4000-8000-000000000000", role: "admin", onboarded: true, banned: false };
