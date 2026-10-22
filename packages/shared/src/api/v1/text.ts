/** Text Postgres keeps as sent, shared by every body a member or operator can type into. U+0000: `text` refuses
 *  it. A UTF-16 surrogate without its pair (JSON can carry "\ud800"): `jsonb` refuses its escape, so travel notes
 *  answered 500, and `text` would keep U+FFFD in its place. Either passed the contracts once. A loop, not
 *  `isWellFormed` or a lookbehind: the same check runs in the app on Hermes. */
export const storable = (s: string) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return false;
    if (c >= 0xdc00 && c <= 0xdfff) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    }
  }
  return true;
};
export const NOT_STORABLE = { message: "That text has a character we can't keep. Remove it and try again." };
