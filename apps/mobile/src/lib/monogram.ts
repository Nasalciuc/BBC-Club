/** `Alex Morgan` → `AM`; a single word → its first two letters; nothing from an empty name (never from an e-mail). */
export function monogram(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}
