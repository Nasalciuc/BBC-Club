/** resource:action permissions. Declared once. Consumed by:
 *  - core/identity access control (createAccessControl) → JWT/operator checks
 *  - apps/api authorize() middleware → route checks
 *  Adding a permission without adding it to a role is allowed (nobody has it); adding a role without listing it here is not. */
export const statement = {
  proposals: ["read", "respond", "ingest", "publish", "withdraw"],
  inbox: ["read", "mark-read", "manage-preferences"],
  devices: ["register", "unregister"],
  profile: ["read-self", "update-self", "delete-self", "read-any", "update-any"],
  conversions: ["ingest"],
  jobs: ["run"],
  ops: ["read", "act"],
} as const;

export type Resource = keyof typeof statement;
export type Permission = { [R in Resource]: `${R}:${(typeof statement)[R][number]}` }[Resource];

export type Role = "member" | "operator" | "system";

export const rolePermissions: Record<Role, readonly Permission[]> = {
  member: [
    "proposals:read",
    "proposals:respond",
    "inbox:read",
    "inbox:mark-read",
    "inbox:manage-preferences",
    "devices:register",
    "devices:unregister",
    "profile:read-self",
    "profile:update-self",
    "profile:delete-self",
  ],
  operator: [
    "proposals:read",
    "proposals:publish",
    "proposals:withdraw",
    "profile:read-any",
    "profile:update-any",
    "ops:read",
    "ops:act",
  ],
  system: ["proposals:ingest", "proposals:withdraw", "conversions:ingest", "jobs:run", "ops:act"],
};

export function roleHas(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

/** Better Auth shape: { resource: [actions] } per role — derived, never hand-written twice. */
export function toAccessControlRoles() {
  const out: Record<Role, Record<string, string[]>> = { member: {}, operator: {}, system: {} };
  for (const role of Object.keys(rolePermissions) as Role[]) {
    for (const p of rolePermissions[role]) {
      const [res, act] = p.split(":") as [string, string];
      (out[role][res] ??= []).push(act);
    }
  }
  return out;
}
