/** 35: `Delete account` confirms only with a password typed, and never twice at once. */
export function canConfirmDelete(password: string, busy: boolean): boolean {
  return !busy && password.trim().length > 0;
}
