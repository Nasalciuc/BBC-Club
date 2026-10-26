/** 02: `Good morning,` over the member's first name — the part of the day on the phone's own clock. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** `Alex Morgan` → `Alex`; nothing from an empty name — the greeting then stands alone, never with an e-mail. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}
