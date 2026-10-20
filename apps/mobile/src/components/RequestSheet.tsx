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
  SectionLabel,
  StateMessage,
  Stepper,
  TextField,
  short,
  tokens,
  rn,
  type Selection,
} from "@bbc/ui";

import { DatesSheet, type DatesSheetHandle } from "@/features/requests/DatesSheet";
import { bodyProblem, retryMinutes, type RequestSource } from "@/features/requests/confirmation-logic";
import { detailFacts } from "@/features/requests/request-card";
import { requestSummary, type RequestSummary } from "@/features/requests/request-summary";
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
import { defaultPhoneCountry, displayPhone, validatePhone } from "@/lib/phone";

export type RequestSheetHandle = {
  present: (opts: {
    fare?: FareVM | null;
    profile?: Profile | null;
    fromCode?: string;
    toCode?: string;
    /** The origin's city by name, for the title (`New York to London`); a fare carries its own. */
    fromCity?: string;
    city?: string;
    mode?: RequestMode;
    replacesFareId?: string;
    /** Home's dates, cabin and travelers for this search — prefilled, still editable here. */
    search?: SearchContext | null;
    /** Home showed the indicative fare for this route and cabin (ADR-IMPL-042): the quote says so, never a number. */
    estimateShown?: boolean;
    /**
     * Which confirmation follows (135:856 or 476:8871): an offer's — its photograph — or a search's — the globe. By
     * default an offer's when the fare carries one.
     */
    confirmation?: RequestSource;
    /** The offer's own picture, for its confirmation; else the city's photograph (ADR-IMPL-043). */
    photo?: string | null;
  }) => void;
  dismiss: () => void;
};

const NO_SUMMARY: RequestSummary = { title: "", facts: "", price: null };

/**
 * Figma 135:849–135:854: the tall sheet over the page. The fare summary (the route, its airline and cabin, the price per
 * traveler), the trip type, the dates side by side, the travelers, `WE WILL CONTACT YOU` with the name, the phone in
 * one field and the e-mail, then `Add a note`; the blocks 24 pt apart; the button and its promise pinned at the bottom.
 */
export const RequestSheet = forwardRef<RequestSheetHandle>(function RequestSheet(_props, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const datesRef = useRef<DatesSheetHandle>(null);
  const sourceRef = useRef<RequestSource>("offer");
  const cityRef = useRef("");
  // The destination's city by name only (never a code) — the title of the card while a request waits offline.
  const cityNameRef = useRef<string | null>(null);
  // The offer's own picture, for its confirmation.
  const photoRef = useRef<string | null>(null);
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newId());
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [summary, setSummary] = useState<RequestSummary>(NO_SUMMARY);
  // The profile's number as a person reads it: `Use saved phone number` puts it back (Figma 135:852).
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
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
      // A fare found in search confirms as a search does (476:8871); only an offer has its photograph (135:856).
      sourceRef.current = opts.confirmation ?? (opts.fare?.offerId ? "offer" : "search");
      photoRef.current = opts.photo ?? null;
      cityRef.current = opts.fare?.to.city ?? opts.city ?? opts.toCode ?? "";
      // An alternative to an expired fare passes the airport code as `city` (fare/[id].tsx): that is no name.
      const named = opts.fare?.to.city ?? opts.city ?? null;
      cityNameRef.current = named && named !== opts.toCode ? named : null;
      const outbound = next.legs[0];
      setSummary(
        requestSummary({
          fare: opts.fare,
          from: outbound?.from ?? "",
          to: outbound?.to ?? "",
          fromCity: opts.fare?.from.city ?? opts.fromCity ?? null,
          toCity: cityNameRef.current,
          cabin: next.cabin,
        }),
      );
      // Figma 135:849: one field, the saved number as a person reads it (`+1 (212) 555-0148`).
      const saved = displayPhone(next.contact.phone);
      setSavedPhone(saved);
      dispatch({ type: "reset", draft: { ...next, contact: { ...next.contact, phone: saved ?? "" } } });
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
    const outbound = state.legs[0];
    const query = new URLSearchParams({
      id: input.id,
      source: sourceRef.current,
      queued: input.queued ? "1" : "0",
      city: cityRef.current,
      route: input.route,
      facts: input.facts,
      phone: input.phone,
      // The globe of a search's confirmation draws this route; an offer's shows its photograph (476:8871, 135:856).
      from: outbound?.from ?? "",
      to: outbound?.to ?? "",
      title: summary.title,
      media: photoRef.current ?? "",
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
    // One field: a number that starts with + carries its country; any other is read in the phone's own country.
    const phone = validatePhone(state.contact.phone, defaultPhoneCountry());
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

  const round = state.tripType === "round";
  const canUseSaved = Boolean(state.phoneError && savedPhone && savedPhone !== state.contact.phone);

  return (
    <>
      {/* Figma 135:849: the tall sheet; the content from 96 pt, its blocks 24 apart; the button and its promise pinned. */}
      <ModalSheet
        ref={modalRef}
        title={sheetTitle(state.mode)}
        closeTestID="request.close"
        testID="request.sheet"
        contentTop={96}
        footerBottom={50}
        dismissible={!busy}
        closable={!busy}
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
            <Text style={styles.promise}>A specialist will call you shortly.</Text>
          </View>
        }
      >
        <View style={styles.summary} testID="request.summary">
          <Text style={styles.summaryTitle}>{summary.title}</Text>
          <Text style={styles.summaryFacts}>{summary.facts}</Text>
          {summary.price ? <Text style={styles.summaryPrice}>{summary.price}</Text> : null}
        </View>

        <View style={styles.chips}>
          <Chip
            testID="request.tripType.round"
            label="Round trip"
            selected={round}
            fill="equal"
            onPress={() => dispatch({ type: "setTripType", tripType: "round" })}
          />
          <Chip
            testID="request.tripType.oneway"
            label="One way"
            selected={!round}
            fill="equal"
            onPress={() => dispatch({ type: "setTripType", tripType: "oneway" })}
          />
        </View>

        <View ref={returnBlock} style={styles.block}>
          <View style={styles.dates}>
            <DateField
              testID="request.depart"
              label="Depart"
              value={state.legs[0]?.date ? short(state.legs[0].date) : null}
              onPress={() => presentDates("depart")}
            />
            {round ? (
              <DateField
                testID="request.return"
                label="Return"
                value={state.legs[1]?.date ? short(state.legs[1].date) : null}
                error={Boolean(state.returnError)}
                onPress={() => presentDates("return")}
              />
            ) : null}
          </View>
          {state.returnError ? (
            <Text testID="request.returnError" style={styles.help}>
              {state.returnError}
            </Text>
          ) : null}
        </View>

        <Stepper
          testID="request.travelers"
          label="Travelers"
          value={state.passengers.adult}
          min={1}
          max={9}
          onChange={(adult) => dispatch({ type: "setPassengers", passengers: { ...state.passengers, adult } })}
        />

        <View style={styles.contact}>
          <SectionLabel box label="We will contact you" />
          <TextField
            testID="request.name"
            label="Name"
            value={state.contact.name}
            onChangeText={(v) => dispatch({ type: "setContact", field: "name", value: v })}
            autoCapitalize="words"
            autoComplete="name"
          />
          <View ref={phoneBlock} style={styles.contact}>
            <TextField
              testID="request.phone"
              label="Phone"
              value={state.contact.phone}
              onChangeText={(v) => dispatch({ type: "setContact", field: "phone", value: v })}
              error={Boolean(state.phoneError)}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            {state.phoneError ? (
              <Text testID="request.phoneError" style={styles.help}>
                {state.phoneError}
              </Text>
            ) : null}
          </View>
          <TextField
            testID="request.email"
            label="Email"
            value={state.contact.email}
            onChangeText={(v) => dispatch({ type: "setContact", field: "email", value: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>

        {noteOpen ? (
          <TextField
            testID="request.note"
            label="Note · optional"
            value={state.note}
            onChangeText={(v) => dispatch({ type: "setNote", note: v })}
            multiline
            maxLength={NOTE_MAX}
            autoFocus
          />
        ) : (
          <TextAction testID="request.note" label="Add a note" onPress={() => setNoteOpen(true)} />
        )}

        {canUseSaved && savedPhone ? (
          <TextAction
            testID="request.useSavedPhone"
            label="Use saved phone number"
            onPress={() => dispatch({ type: "setContact", field: "phone", value: savedPhone })}
          />
        ) : null}

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

/** Figma 135:849 `Depart input`: the label 8 pt over a white 56-pt field holding the day; a tap opens the calendar. */
function DateField({
  testID,
  label,
  value,
  error = false,
  onPress,
}: {
  testID: string;
  label: string;
  value: string | null;
  error?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.dateLabel}>{label.toUpperCase()}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${value}` : `${label}, select date`}
        onPress={onPress}
        style={({ pressed }) => [styles.dateBox, error && styles.dateBoxError, pressed && styles.pressed]}
      >
        <Text style={value ? styles.dateValue : styles.datePlaceholder} numberOfLines={1}>
          {value ?? "Select date"}
        </Text>
      </Pressable>
    </View>
  );
}

/** Figma's text button in a form (`Add a note`, `Use saved phone number`): 48 pt, the button's words, at the left. */
function TextAction({ testID, label, onPress }: { testID: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
    >
      <Text style={styles.textActionLabel}>{label}</Text>
    </Pressable>
  );
}

/** `RequestBody.note` takes 500 characters; the field stops there instead of refusing the request. */
const NOTE_MAX = 500;

const styles = StyleSheet.create({
  footer: { gap: tokens.space.xs },
  // Figma 138:1096: the promise under the button, left-aligned, in `text-secondary`.
  promise: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  summary: { gap: tokens.space.xs },
  summaryTitle: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  summaryFacts: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  summaryPrice: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  chips: { flexDirection: "row", gap: tokens.space.xs },
  block: { gap: tokens.space.lg },
  // 138:1046: Depart and Return side by side, 16 pt apart.
  dates: { flexDirection: "row", gap: tokens.space.md },
  dateField: { flex: 1, gap: tokens.space.xs },
  dateLabel: { ...rn(tokens.type.label), color: tokens.colors.textSecondary },
  dateBox: {
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  dateBoxError: { borderColor: tokens.colors.statusDanger },
  dateValue: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  datePlaceholder: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  // 138:1069: the label's box and the fields 16 pt apart; a field's explanation under it in the same rhythm.
  contact: { gap: tokens.space.md },
  // 138:1341 / 138:1232: what a field at fault needs, in `body-sm`, under the field.
  help: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  textAction: {
    alignSelf: "flex-start",
    minHeight: 48,
    minWidth: 144,
    paddingHorizontal: tokens.space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  textActionLabel: { ...rn(tokens.type.button), color: tokens.colors.textPrimary },
  pressed: { opacity: 0.7 },
});
