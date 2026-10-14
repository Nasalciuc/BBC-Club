import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import NetInfo from "@react-native-community/netinfo";
import { useRouter, type Href } from "expo-router";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { requestRoute } from "@bbc/shared/requests/display";
import {
  Button,
  Chip,
  ModalSheet,
  type ModalSheetHandle,
  StateMessage,
  short,
  tokens,
  rn,
  type Selection,
} from "@bbc/ui";

import { PhoneField } from "@/components/phone-field";
import { DatesSheet, type DatesSheetHandle } from "@/features/requests/DatesSheet";
import { bodyProblem, retryMinutes, type RequestSource } from "@/features/requests/confirmation-logic";
import { detailFacts } from "@/features/requests/request-card";
import {
  buildDraft,
  draftToBody,
  missingReturn,
  sheetTitle,
  useRequestDraft,
  type RequestDraft,
  type RequestMode,
  type SearchContext,
} from "@/features/requests/useRequestDraft";
import { submitRequest, type Profile } from "@/lib/api";
import { stateCopy, submitFailureKind } from "@/lib/error-context";
import { newId } from "@/lib/id";
import { enqueueRequest } from "@/lib/queue";
import { defaultPhoneCountry, displayPhone, splitStoredPhone, validatePhone, type CountryCode } from "@/lib/phone";

export type RequestSheetHandle = {
  present: (opts: {
    fare?: FareVM | null;
    profile?: Profile | null;
    fromCode?: string;
    toCode?: string;
    city?: string;
    mode?: RequestMode;
    replacesFareId?: string;
    /** Home's dates, cabin and travelers for this search — prefilled, still editable here. */
    search?: SearchContext | null;
    /** Home showed the indicative fare for this route and cabin (ADR-IMPL-042): the quote says so, never a number. */
    estimateShown?: boolean;
  }) => void;
  dismiss: () => void;
};

export const RequestSheet = forwardRef<RequestSheetHandle>(function RequestSheet(_props, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const datesRef = useRef<DatesSheetHandle>(null);
  const sourceRef = useRef<RequestSource>("offer");
  const cityRef = useRef("");
  // The destination's city by name only (never a code) — the title of the card while a request waits offline.
  const cityNameRef = useRef<string | null>(null);
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newId());
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => defaultPhoneCountry());
  const [seed] = useState<RequestDraft>(() => buildDraft({}));
  const { state, dispatch } = useRequestDraft(seed);
  const keyRef = useRef(idempotencyKey);
  // Set at the first line of a submit, before anything is awaited: a second tap while the first is still checking the
  // network would otherwise send, or save, the request twice.
  const submittingRef = useRef(false);
  // The actions are pinned over the content's end, the keyboard may be up: each new error scrolls into view — the
  // return's and the phone's with the field at fault, the sending one with its Try again.
  const returnBlock = useRef<View>(null);
  const phoneBlock = useRef<View>(null);
  const notSent = useRef<View>(null);

  useEffect(() => {
    keyRef.current = idempotencyKey;
  }, [idempotencyKey]);

  useEffect(() => {
    if (state.returnError) modalRef.current?.reveal(returnBlock.current);
  }, [state.returnError]);
  useEffect(() => {
    if (state.phoneError) modalRef.current?.reveal(phoneBlock.current);
  }, [state.phoneError]);
  useEffect(() => {
    if (state.submitError) modalRef.current?.reveal(notSent.current);
  }, [state.submitError]);

  useImperativeHandle(ref, () => ({
    present(opts) {
      const next = buildDraft(opts);
      const split = splitStoredPhone(next.contact.phone, defaultPhoneCountry());
      sourceRef.current = opts.fare ? "offer" : "search";
      cityRef.current = opts.fare?.to.city ?? opts.city ?? opts.toCode ?? "";
      // An alternative to an expired fare passes the airport code as `city` (fare/[id].tsx): that is no name.
      const named = opts.fare?.to.city ?? opts.city ?? null;
      cityNameRef.current = named && named !== opts.toCode ? named : null;
      dispatch({
        type: "reset",
        draft: { ...next, contact: { ...next.contact, phone: split.national } },
      });
      setPhoneCountry(split.country);
      setIdempotencyKey(newId());
      setBusy(false);
      submittingRef.current = false;
      setNoteOpen(false);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  /** `facts` is the request's line as the server read it (Figma 135:856: `JFK → LHR · OCT 12–19 · ROUND TRIP · 1 ADULT`);
   *  `phone`, the number this request will be called on — the one in the sheet, which may differ from the profile's. */
  function openConfirmation(input: { id: string; queued: boolean; route: string; facts: string; phone: string }) {
    modalRef.current?.dismiss();
    const query = new URLSearchParams({
      id: input.id,
      source: sourceRef.current,
      queued: input.queued ? "1" : "0",
      city: cityRef.current,
      route: input.route,
      facts: input.facts,
      phone: input.phone,
    });
    router.push(`/request/confirmed?${query.toString()}` as Href);
  }

  /** Save the request on the phone; it goes out when the phone is back online (Figma 135:855). */
  function saveOnPhone(body: RequestBody) {
    if (!enqueueRequest(body, keyRef.current, cityNameRef.current)) {
      dispatch({ type: "setSubmitError", error: stateCopy("notSent").body });
      return;
    }
    openConfirmation({ id: "", queued: true, route: requestRoute(body.legs, body.tripType), facts: "", phone: "" });
  }

  async function onSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitOnce();
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function submitOnce() {
    if (missingReturn(state.tripType, state.legs[1]?.date)) {
      dispatch({ type: "setReturnError", error: "Select a return date or choose One way." });
      return;
    }
    const phone = validatePhone(state.contact.phone, phoneCountry);
    if (!phone.valid) {
      dispatch({ type: "setPhoneError", error: phone.error });
      return;
    }
    // Checked before anything leaves the sheet: a request saved on the phone with details the server refuses could
    // never be sent.
    const valid = RequestBody.safeParse(
      draftToBody({
        ...state,
        contact: { ...state.contact, phone: phone.e164 },
      }),
    );
    if (!valid.success) {
      dispatch({ type: "setSubmitError", error: bodyProblem(valid.error.issues) });
      return;
    }
    const body = valid.data;
    setBusy(true);
    const net = await NetInfo.fetch();
    const online = net.isConnected && net.isInternetReachable !== false;

    if (!online) {
      setBusy(false);
      saveOnPhone(body);
      return;
    }

    const result = await submitRequest(body, keyRef.current);
    setBusy(false);
    if (!result.ok) {
      const kind = submitFailureKind(result.code);
      if (kind === "rateLimited") {
        modalRef.current?.dismiss();
        router.push(`/request/limited?minutes=${retryMinutes(result.retryAfterS)}` as Href);
        return;
      }
      if (kind === "queued") {
        saveOnPhone(body);
        return;
      }
      dispatch({ type: "setSubmitError", error: result.message });
      return;
    }
    openConfirmation({
      id: result.data.id,
      queued: false,
      route: result.data.route,
      facts: detailFacts(result.data),
      // The number this request will be called on: the server's reading of it, else the one the member just sent.
      phone: displayPhone(result.data.phone ?? body.contact.phone) ?? "",
    });
  }

  const monoLine = `${state.legs[0]?.from ?? "JFK"} → ${state.legs[0]?.to ?? "LHR"} · ${state.cabin.toUpperCase()}${
    state.priceAtRequest != null ? ` · FROM $${state.priceAtRequest.toLocaleString("en-US")}` : ""
  }`;

  function presentDates(editing: Selection["editing"]) {
    // The calendar opens over the sheet: the keyboard of a field being typed in would cover its button.
    Keyboard.dismiss();
    datesRef.current?.present({
      tripType: state.tripType,
      depart: state.legs[0]?.date || null,
      ret: state.tripType === "round" ? state.legs[1]?.date || null : null,
      editing,
    });
  }

  return (
    <>
      {/* Figma 135:849: the tall sheet; the content from 96 pt; the button and its promise pinned at the bottom. */}
      <ModalSheet
        ref={modalRef}
        title={sheetTitle(state.mode)}
        closeTestID="request.close"
        testID="request.sheet"
        contentTop={96}
        contentGap={tokens.space.sm}
        footerBottom={50}
        dismissible={!busy}
        insets={insets}
        footer={
          <View style={styles.footer}>
            <Button
              testID="request.submit"
              label={busy ? "Sending…" : sheetTitle(state.mode)}
              variant="primary"
              busy={busy}
              onPress={() => void onSubmit()}
            />
            <Text style={styles.caption}>A specialist will call you shortly.</Text>
          </View>
        }
      >
        <Text style={styles.mono}>{monoLine}</Text>

        <View style={styles.chips}>
          <Chip
            testID="request.tripType.round"
            label="Round trip"
            selected={state.tripType === "round"}
            fill="equal"
            onPress={() => dispatch({ type: "setTripType", tripType: "round" })}
          />
          <Chip
            testID="request.tripType.oneway"
            label="One way"
            selected={state.tripType === "oneway"}
            fill="equal"
            onPress={() => dispatch({ type: "setTripType", tripType: "oneway" })}
          />
        </View>

        <DateRow
          testID="request.depart"
          label="DEPART"
          value={state.legs[0]?.date ? short(state.legs[0].date) : "Select date"}
          onPress={() => presentDates("depart")}
        />
        {state.tripType === "round" ? (
          <View ref={returnBlock} style={styles.block}>
            <DateRow
              testID="request.return"
              label="RETURN"
              value={state.legs[1]?.date ? short(state.legs[1].date) : "Select date"}
              error={Boolean(state.returnError)}
              onPress={() => presentDates("return")}
            />
            {state.returnError ? (
              <Text testID="request.returnError" style={styles.error}>
                {state.returnError}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Field
          testID="request.travelers"
          label="TRAVELERS"
          value={String(state.passengers.adult)}
          onChangeText={(v) => {
            const n = Math.max(1, Math.min(9, Number(v) || 1));
            dispatch({ type: "setPassengers", passengers: { ...state.passengers, adult: n } });
          }}
          keyboardType="number-pad"
        />
        <Field
          testID="request.name"
          label="NAME"
          value={state.contact.name}
          onChangeText={(v) => dispatch({ type: "setContact", field: "name", value: v })}
          empty={!state.contact.name}
        />
        <View ref={phoneBlock} style={styles.block}>
          <PhoneField
            testID="request.phone"
            countryTestID="phone.country"
            value={state.contact.phone}
            country={phoneCountry}
            empty={!state.contact.phone}
            onChangeText={(v) => dispatch({ type: "setContact", field: "phone", value: v })}
            onCountryChange={(c) => {
              setPhoneCountry(c);
              dispatch({ type: "setPhoneError", error: null });
            }}
          />
          {state.phoneError ? <Text style={styles.error}>{state.phoneError}</Text> : null}
        </View>
        <Field
          testID="request.email"
          label="EMAIL"
          value={state.contact.email}
          onChangeText={(v) => dispatch({ type: "setContact", field: "email", value: v })}
          empty={!state.contact.email}
          keyboardType="email-address"
        />

        {noteOpen ? (
          <Field
            testID="request.note"
            label="NOTE"
            value={state.note}
            onChangeText={(v) => dispatch({ type: "setNote", note: v })}
            multiline
            maxLength={NOTE_MAX}
          />
        ) : (
          <Pressable
            testID="request.note"
            accessibilityRole="button"
            onPress={() => setNoteOpen(true)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.link}>+ Add a note</Text>
          </Pressable>
        )}

        {state.submitError ? (
          <View ref={notSent}>
            <StateMessage
              testID="request.notSent"
              variant="error"
              title={stateCopy("notSent").title}
              body={state.submitError || stateCopy("notSent").body}
              primary={{ label: "Try again", onPress: () => void onSubmit() }}
            />
          </View>
        ) : null}
      </ModalSheet>
      <DatesSheet
        ref={datesRef}
        onUse={(s) => {
          if (s.depart) dispatch({ type: "setDepart", date: s.depart });
          if (s.tripType === "round") dispatch({ type: "setReturn", date: s.ret ?? "" });
        }}
      />
    </>
  );
});

function DateRow({
  testID,
  label,
  value,
  error,
  onPress,
}: {
  testID: string;
  label: string;
  value: string;
  error?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.fieldWrap, pressed && styles.pressed]}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.field, styles.dateValue, error && styles.fieldError]}>{value}</Text>
    </Pressable>
  );
}

/** `RequestBody.note` takes 500 characters; the field stops there instead of refusing the request. */
const NOTE_MAX = 500;

function Field({
  testID,
  label,
  value,
  onChangeText,
  empty,
  keyboardType,
  multiline,
  maxLength,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  empty?: boolean;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "email-address";
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <BottomSheetTextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        style={[styles.field, empty && styles.fieldEmpty, multiline && styles.fieldMulti]}
        placeholderTextColor={tokens.colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: tokens.space.xs },
  block: { gap: tokens.space.sm },
  mono: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  chips: { flexDirection: "row", gap: tokens.space.xs },
  fieldWrap: { gap: tokens.space.xxs },
  fieldLabel: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  dateValue: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  field: {
    minHeight: 56,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    backgroundColor: tokens.colors.surfaceCard,
  },
  fieldEmpty: { borderColor: tokens.colors.primary },
  fieldError: { borderColor: tokens.colors.statusDanger },
  fieldMulti: { minHeight: 88, textAlignVertical: "top" },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
  link: { ...rn(tokens.type.bodySm), color: tokens.colors.primary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textTertiary, textAlign: "center" },
  pressed: { opacity: 0.7 },
  checkWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: tokens.colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: tokens.space.md,
  },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary, textAlign: "center" },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, textAlign: "center" },
});
