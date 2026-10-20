import NetInfo from "@react-native-community/netinfo";
import { useRouter, type Href } from "expo-router";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import {
  Button,
  Divider,
  FieldError,
  Icon,
  ModalSheet,
  type ModalSheetHandle,
  NoticeCard,
  PickerField,
  Segmented,
  TextButton,
  TextField,
  TripSummaryCard,
  dayText,
  rn,
  tokens,
  type Selection,
} from "@bbc/ui";

import { SearchTravelersSheet, type TravelersSheetHandle } from "@/features/explore/SearchPreferenceSheets";
import { cabinLabel, datesChipLabel, travelersLabel } from "@/features/explore/travel-preferences";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { DatesPage, type DatesPageHandle } from "@/features/requests/DatesPage";
import { bodyProblem, retryMinutes, type RequestSource } from "@/features/requests/confirmation-logic";
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
    /** Which confirmation follows: an offer's — its own picture — or a search's. By default an offer's when the fare
     *  carries one. */
    confirmation?: RequestSource;
    /** The offer's own picture, for its confirmation; else the city's photograph (ADR-IMPL-043). */
    photo?: string | null;
  }) => void;
  dismiss: () => void;
};

const NO_SUMMARY: RequestSummary = { title: "", cabin: "", route: "", carrier: null, price: null };

/** `RequestBody.note` takes 500 characters; the field stops there instead of refusing the request. */
const NOTE_MAX = 500;

/**
 * The request (06, 22, 23): the tall sheet over the page — the trip (the city's photograph, the route, the cabin, the
 * airline, the days and the fare), `Round trip` / `One way`, the dates and the travelers, then `We will contact you`
 * with the name, the phone, the e-mail and a note; `Request a quote →` and its promise pinned at the foot. A missing
 * return says so under its field (22); while it sends, the fields rest and the pill says `Sending…` (23).
 */
export const RequestSheet = forwardRef<RequestSheetHandle>(function RequestSheet(_props, ref) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
  const datesRef = useRef<DatesPageHandle>(null);
  const travelersRef = useRef<TravelersSheetHandle>(null);
  const sourceRef = useRef<RequestSource>("offer");
  const cityRef = useRef("");
  // The destination's city by name only (never a code) — the title of the card while a request waits offline.
  const cityNameRef = useRef<string | null>(null);
  // The offer's own picture, for its confirmation.
  const photoRef = useRef<string | null>(null);
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newId());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<RequestSummary>(NO_SUMMARY);
  // The trip's cities and destination, for the dates page's heading and the summary's photograph — the offer's own
  // picture first (ADR-IMPL-043).
  const [trip, setTrip] = useState<{
    fromCity: string | null;
    toCity: string | null;
    toCode: string | null;
    media: string | null;
  }>({ fromCity: null, toCity: null, toCode: null, media: null });
  // The profile's number as a person reads it: `Use saved phone number` puts it back.
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [seed] = useState<RequestDraft>(() => buildDraft({}));
  const { state, dispatch } = useRequestDraft(seed);
  const photoFor = usePlacePhotos([trip.toCode]);
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
      // A fare found in search confirms as a search does; only an offer has a picture of its own.
      sourceRef.current = opts.confirmation ?? (opts.fare?.offerId ? "offer" : "search");
      photoRef.current = opts.photo ?? null;
      cityRef.current = opts.fare?.to.city ?? opts.city ?? opts.toCode ?? "";
      // An alternative to an expired fare passes the airport code as `city` (fare/[id].tsx): that is no name.
      const named = opts.fare?.to.city ?? opts.city ?? null;
      cityNameRef.current = named && named !== opts.toCode ? named : null;
      const outbound = next.legs[0];
      const fromCity = opts.fare?.from.city ?? opts.fromCity ?? null;
      setTrip({ fromCity, toCity: cityNameRef.current, toCode: outbound?.to ?? null, media: opts.photo ?? null });
      setSummary(
        requestSummary({
          fare: opts.fare,
          from: outbound?.from ?? "",
          to: outbound?.to ?? "",
          fromCity,
          toCity: cityNameRef.current,
          cabin: next.cabin,
        }),
      );
      // One field, the saved number as a person reads it (`+1 212 555 0142`).
      const saved = displayPhone(next.contact.phone);
      setSavedPhone(saved);
      dispatch({ type: "reset", draft: { ...next, contact: { ...next.contact, phone: saved ?? "" } } });
      setIdempotencyKey(newId());
      setBusy(false);
      submittingRef.current = false;
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  /**
   * The confirmation (08) reads the trip from here: the route's codes, the cabin, the days, the trip and the travelers,
   * the airline; `phone`, the number this request will be called on — the one in the sheet, which may differ from the
   * profile's.
   */
  function openConfirmation(input: { id: string; queued: boolean; phone: string }) {
    modalRef.current?.dismiss();
    const outbound = state.legs[0];
    const round = state.tripType === "round";
    const query = new URLSearchParams({
      id: input.id,
      source: sourceRef.current,
      queued: input.queued ? "1" : "0",
      city: cityRef.current,
      phone: input.phone,
      from: outbound?.from ?? "",
      to: outbound?.to ?? "",
      cabin: state.cabin,
      trip: state.tripType,
      dates: datesChipLabel({ depart: outbound?.date || null, return: round ? state.legs[1]?.date || null : null }),
      travelers: travelersLabel(state.passengers),
      carrier: summary.carrier?.name ?? "",
      logo: summary.carrier?.logoUrl ?? "",
      media: photoRef.current ?? "",
    });
    router.push(`/request/confirmed?${query.toString()}` as Href);
  }

  /** Save the request on the phone; it goes out when the phone is back online (26). */
  function saveOnPhone(body: RequestBody) {
    if (!enqueueRequest(body, keyRef.current, cityNameRef.current)) {
      dispatch({ type: "setSubmitError", error: stateCopy("notSent").body });
      return;
    }
    openConfirmation({ id: "", queued: true, phone: "" });
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
      // The number this request will be called on: the server's reading of it, else the one the member just sent.
      phone: displayPhone(result.data.phone ?? body.contact.phone) ?? "",
    });
  }

  function presentDates(editing: Selection["editing"]) {
    // The dates page opens over the sheet: the keyboard of a field being typed in would stay over it.
    Keyboard.dismiss();
    datesRef.current?.present(
      {
        tripType: state.tripType,
        depart: state.legs[0]?.date || null,
        ret: state.tripType === "round" ? state.legs[1]?.date || null : null,
        editing,
      },
      { fromCity: trip.fromCity, toCity: trip.toCity, toCode: trip.toCode },
    );
  }

  const round = state.tripType === "round";
  const canUseSaved = Boolean(state.phoneError && savedPhone && savedPhone !== state.contact.phone);
  const outbound = state.legs[0];
  const title = sheetTitle(state.mode);

  return (
    <>
      <ModalSheet
        ref={modalRef}
        title={title}
        closeTestID="request.close"
        testID="request.sheet"
        contentGap={tokens.space.sm}
        // 06: the pill and its promise just over the home indicator, leaving the form its room.
        footerBottom={tokens.space.sm}
        dismissible={!busy}
        closable={!busy}
        insets={insets}
        footer={
          <View style={styles.footer}>
            <Button
              testID="request.submit"
              label={busy ? "Sending…" : title}
              variant="primary"
              trailing="arrow"
              busy={busy}
              onPress={() => void onSubmit()}
            />
            <View style={styles.promise}>
              <Icon name="phone" size={16} color={tokens.colors.textPrimary} strokeWidth={1.75} />
              <Text style={styles.promiseText}>A specialist will call you shortly.</Text>
            </View>
          </View>
        }
      >
        <TripSummaryCard
          testID="request.summary"
          photo={cardPicture(trip.media, photoFor(trip.toCode), PICTURE_HEADERS)}
          fallback={CLUB_PICTURE}
          title={summary.title}
          cabin={cabinLabel(state.cabin)}
          dates={datesChipLabel({ depart: outbound?.date || null, return: round ? state.legs[1]?.date || null : null })}
          route={summary.route}
          carrier={summary.carrier}
          price={summary.price}
        />

        <Segmented
          options={[
            { key: "round", label: "Round trip", testID: "request.tripType.round" },
            { key: "oneway", label: "One way", testID: "request.tripType.oneway" },
          ]}
          value={state.tripType}
          disabled={busy}
          onChange={(tripType) => dispatch({ type: "setTripType", tripType })}
        />

        <View ref={returnBlock}>
          <View style={styles.dates}>
            <PickerField
              testID="request.depart"
              label="Depart"
              icon="calendar"
              value={outbound?.date ? dayText(outbound.date) : null}
              placeholder="Select date"
              disabled={busy}
              onPress={() => presentDates("depart")}
            />
            {round ? (
              <PickerField
                testID="request.return"
                label="Return"
                icon="calendar"
                value={state.legs[1]?.date ? dayText(state.legs[1].date) : null}
                placeholder="Select date"
                error={Boolean(state.returnError)}
                disabled={busy}
                onPress={() => presentDates("return")}
              />
            ) : null}
          </View>
          {state.returnError ? (
            <View style={round ? styles.returnErrorRound : undefined}>
              <FieldError testID="request.returnError">{state.returnError}</FieldError>
            </View>
          ) : null}
        </View>

        <View style={styles.row}>
          <PickerField
            testID="request.travelers"
            label="Travelers"
            icon="user"
            value={travelersLabel(state.passengers)}
            disabled={busy}
            onPress={() => {
              Keyboard.dismiss();
              travelersRef.current?.present(state.passengers);
            }}
          />
        </View>

        <Divider style={styles.divider} />
        <Text style={styles.contactTitle} accessibilityRole="header">
          We will contact you
        </Text>
        <TextField
          testID="request.name"
          label="Name"
          icon="user"
          value={state.contact.name}
          editable={!busy}
          onChangeText={(v) => dispatch({ type: "setContact", field: "name", value: v })}
          autoCapitalize="words"
          autoComplete="name"
        />
        <View ref={phoneBlock}>
          <TextField
            testID="request.phone"
            label="Phone"
            icon="phone"
            value={state.contact.phone}
            editable={!busy}
            onChangeText={(v) => dispatch({ type: "setContact", field: "phone", value: v })}
            error={Boolean(state.phoneError)}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          {state.phoneError ? <FieldError testID="request.phoneError">{state.phoneError}</FieldError> : null}
          {canUseSaved && savedPhone ? (
            <View style={styles.savedPhone}>
              <TextButton
                testID="request.useSavedPhone"
                label="Use saved phone number"
                onPress={() => dispatch({ type: "setContact", field: "phone", value: savedPhone })}
              />
            </View>
          ) : null}
        </View>
        <TextField
          testID="request.email"
          label="Email"
          icon="mail"
          value={state.contact.email}
          editable={!busy}
          onChangeText={(v) => dispatch({ type: "setContact", field: "email", value: v })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField
          testID="request.note"
          label="Note (optional)"
          icon="message"
          value={state.note}
          editable={!busy}
          placeholder="Tell us about your travel plans or any special requests"
          onChangeText={(v) => dispatch({ type: "setNote", note: v })}
          multiline
          maxLength={NOTE_MAX}
        />

        {state.submitError ? (
          <View ref={notSent}>
            <NoticeCard
              testID="request.notSent"
              tone="error"
              title={stateCopy("notSent").title}
              body={state.submitError || stateCopy("notSent").body}
              link={{ label: "Try again", testID: "request.notSent.retry", onPress: () => void onSubmit() }}
            />
          </View>
        ) : null}
      </ModalSheet>
      <DatesPage
        ref={datesRef}
        onUse={(s) => {
          if (s.depart) dispatch({ type: "setDepart", date: s.depart });
          if (s.tripType === "round") dispatch({ type: "setReturn", date: s.ret ?? "" });
        }}
      />
      <SearchTravelersSheet
        ref={travelersRef}
        testIDPrefix="request.travelers"
        stackBehavior="push"
        onPick={(passengers) => dispatch({ type: "setPassengers", passengers })}
      />
    </>
  );
});

const styles = StyleSheet.create({
  footer: { gap: tokens.space.xs },
  promise: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.xs },
  promiseText: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  // 06: Depart and Return side by side, 12 pt apart.
  dates: { flexDirection: "row", gap: tokens.space.sm },
  // 22: the return's line under the return's field, in the right half.
  returnErrorRound: { marginLeft: "50%", paddingLeft: tokens.space.xs },
  row: { flexDirection: "row" },
  divider: { marginTop: tokens.space.xs },
  contactTitle: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, marginTop: tokens.space.xs },
  savedPhone: { alignItems: "flex-start" },
});
