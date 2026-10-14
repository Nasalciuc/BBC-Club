import { createContext } from "react";

/**
 * True inside a `ModalSheet`'s content. A field there is gorhom's text input, so the sheet rises with the keyboard and
 * its pinned actions stay above the keys (`SearchField`).
 */
export const InModalSheet = createContext(false);
