/**
 * What the member saved (ADR-IMPL-056): a fare by its heart (05), a destination by its bookmark (13). Kept on the
 * phone — the club's server has no saved list yet — and counted on Profile (12, `8 Saved`). Pure, so it is tested
 * without React Native.
 */
export type SavedKind = "fare" | "destination";
export type SavedItem = { kind: SavedKind; id: string; at: string };

const MAX = 200;

function isItem(v: unknown): v is SavedItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.kind === "fare" || o.kind === "destination") &&
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.at === "string"
  );
}

/** The stored list, newest first; anything unreadable reads as nothing saved, never as a crash. */
export function parseSaved(raw: string | undefined | null): SavedItem[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: SavedItem[] = [];
    for (const v of list) {
      if (!isItem(v)) continue;
      const key = `${v.kind}:${v.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: v.kind, id: v.id, at: v.at });
    }
    return out.slice(0, MAX);
  } catch {
    return [];
  }
}

export function isSaved(list: readonly SavedItem[], kind: SavedKind, id: string): boolean {
  return list.some((s) => s.kind === kind && s.id === id);
}

/** Saved once more is unsaved; saved, it goes first. The list keeps the newest 200. */
export function toggled(list: readonly SavedItem[], kind: SavedKind, id: string, now: Date): SavedItem[] {
  if (isSaved(list, kind, id)) return list.filter((s) => !(s.kind === kind && s.id === id));
  return [{ kind, id, at: now.toISOString() }, ...list].slice(0, MAX);
}
