import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useContext } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";
import { InModalSheet } from "../layout/in-modal-sheet";

/**
 * A text input that knows where it stands. Inside a modal sheet it is gorhom's input, so the sheet rises with the
 * keyboard and its actions stay above the keys; elsewhere, and on the web — which has no keyboard to rise above and
 * lacks the TextInput API gorhom's input calls on blur — React Native's own.
 */
export function SheetTextInput({ testID, ...props }: TextInputProps & { testID: string }) {
  const inSheet = useContext(InModalSheet) && Platform.OS !== "web";
  return inSheet ? <BottomSheetTextInput testID={testID} {...props} /> : <TextInput testID={testID} {...props} />;
}
