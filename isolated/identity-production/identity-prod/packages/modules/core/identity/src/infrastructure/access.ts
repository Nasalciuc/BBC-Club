import { createAccessControl } from "better-auth/plugins/access";

/** Declared once, shared with clients (authClient uses the same ac/roles). Minimal for v1. */
const statement = {
  proposals: ["read", "respond", "publish", "withdraw"],
  members:   ["read-self", "update-self", "delete-self", "read-any", "update-any"],
  ops:       ["read", "act"],
} as const;

export const ac = createAccessControl(statement);
export const roles = {
  member:   ac.newRole({ proposals: ["read", "respond"], members: ["read-self", "update-self", "delete-self"] }),
  operator: ac.newRole({ proposals: ["read", "publish", "withdraw"], members: ["read-any", "update-any"], ops: ["read", "act"] }),
  system:   ac.newRole({ proposals: ["publish", "withdraw"], ops: ["act"] }),
};
export type Role = keyof typeof roles;
