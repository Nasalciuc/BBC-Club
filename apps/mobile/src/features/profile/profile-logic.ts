/** Figma 233:4453: `Client since 2019` — the year the member joined; nothing while the profile is still a stub. */
export function clientSince(memberSince: string | null | undefined): string | null {
  if (!memberSince) return null;
  const d = new Date(memberSince);
  return Number.isNaN(d.getTime()) ? null : `Client since ${d.getUTCFullYear()}`;
}
