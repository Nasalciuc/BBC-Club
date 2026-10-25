import { ProfilePatchBody } from "@bbc/shared/api/v1/proposals";

import { REQUEST_NAME_MAX } from "../requests/confirmation-logic";

/**
 * The member's own name (brief 3.4.1): what Edit profile's `Name` sheet takes, and how Profile and Edit profile say it
 * — pure, so it is tested without React Native.
 *
 * One rule, the request sheet's: trimmed, 2 to 80 characters (`RequestBody.contact.name`), and text the club can keep
 * (`ProfilePatchBody`, which itself takes 1 to 120). Every request starts from the saved name (useRequestDraft), so a
 * name saved here always passes a request as it is: never cut to 80 there, never refused there as one letter.
 */
export const NAME_MIN = 2;
export const NAME_MAX = REQUEST_NAME_MAX;

/** The request sheet's own words for the same faults (confirmation-logic `bodyProblem`). */
const NAME_MISSING = "Add your name, so your specialist knows who to ask for.";
const NAME_SHORT = "Use your full name.";

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** The name as it will be saved (trimmed), or why it cannot be, in the sheet's words — the first fault only. */
export function checkName(typed: string): NameCheck {
  const name = typed.trim();
  if (name.length === 0) return { ok: false, error: NAME_MISSING };
  if (name.length < NAME_MIN) return { ok: false, error: NAME_SHORT };
  if (name.length > NAME_MAX) return { ok: false, error: `Shorten the name to ${NAME_MAX} characters.` };
  // The contract has the last word: a character Postgres cannot keep is refused here as the server would refuse it.
  const parsed = ProfilePatchBody.safeParse({ displayName: name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? NAME_MISSING };
  return { ok: true, name: parsed.data.displayName ?? name };
}

/**
 * A save the club did not take. The field is at fault only when the server refused the name (400): a red border and
 * red words under it. Offline, a timeout, the club not answering or busy: its own calm words in slate, the field as it
 * was — the name stays as typed for `Save name` again.
 */
export function nameSaveFailure(failure: { status: number; message: string }): { field: boolean; message: string } {
  return { field: failure.status === 400, message: failure.message };
}

/**
 * Profile's hero (12): the name as saved. `Member` only while there is none — never a part of the e-mail (greeting.ts,
 * monogram.ts: a name is never made from an e-mail, which is personal data the member did not choose to show there),
 * and no prompt 12 does not draw: the `Name` row of Edit profile is where a name is added.
 */
export function profileName(displayName: string | null | undefined): string {
  return displayName?.trim() || "Member";
}

/** Edit profile's `Name` row: the name as saved, else `Not set` — as its `Home airport` row says it. */
export function nameRowValue(displayName: string | null | undefined): string {
  return displayName?.trim() || "Not set";
}
