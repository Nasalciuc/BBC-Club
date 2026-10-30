import NetInfo from "@react-native-community/netinfo";
import { useRouter, type Href } from "expo-router";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, type TextStyle, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import {
  Button,
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
  baselineOffset,
  dayText,
  rn,
  tokens,
  type Selection,
} from "@bbc/ui";

import { SearchTravelersSheet, type TravelersSheetHandle } from "@/features/explore/SearchPreferenceSheets";
import { cabinLabel, datesChipLabel, travelersLabel } from "@/features/explore/travel-preferences";
import { airlineMark } from "@/features/fares/airline-marks";
import { clubPhoto } from "@/features/places/club-photos";
import { cardPicture } from "@/features/places/place-photo-logic";
import { CLUB_PICTURE, PICTURE_HEADERS, usePlacePhotos } from "@/features/places/usePlacePhotos";
import { DatesPage, type DatesPageHandle } from "@/features/requests/DatesPage";
import { putConfirmation } from "@/features/requests/confirmation-handoff";
import {
  REQUEST_NAME_MAX,
  bodyProblem,
  limitScope,
  retryMinutes,
  type RequestSource,
} from "@/features/requests/confirmation-logic";
import { requestSummary, type RequestSummary } from "@/features/requests/request-summary";
import {
  buildDraft,
  draftToBody,
  missingReturn,
  sheetTitle,
  useRequestDraft,
  type RequestDraft,
  type RequestMode,
  type RequestOffer,
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
    /** An offer's own page (F067): the request is the offer — its id and price, never a catalogue fare's. */
    offer?: RequestOffer | null;
    /** The offer as its page showed it (its facts), for the trip card — always at the offer's own price. */
    facts?: FareVM | null;
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
/** An offer whose page named no airline: none on the trip card (knownCarrier). */
const NO_AIRLINE = { code: null, name: "", logoUrl: null };

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
      sourceRef.current = opts.confirmation ?? (opts.offer || opts.fare?.offerId ? "offer" : "search");
      photoRef.current = opts.photo ?? null;
      cityRef.current = opts.fare?.to.city ?? opts.city ?? opts.toCode ?? "";
      // An alternative to an expired fare passes the airport code as `city` (fare/[id].tsx): that is no name.
      const named = opts.fare?.to.city ?? opts.city ?? null;
      cityNameRef.current = named && named !== opts.toCode ? named : null;
      const outbound = next.legs[0];
      const fromCity = opts.fare?.from.city ?? opts.fromCity ?? null;
      setTrip({ fromCity, toCity: cityNameRef.current, toCode: outbound?.to ?? null, media: opts.photo ?? null });
      // The trip card: the fare, or the offer as its page showed it — at the offer's own price, which is what is sent.
      const offer = opts.offer ?? null;
      const shown = offer
        ? {
            ...(opts.facts ?? { carrier: NO_AIRLINE, departLocal: null, arriveLocal: null, arriveDayOffset: 0 }),
            price: offer.price,
          }
        : opts.fare;
      setSummary(
        requestSummary({
          fare: shown,
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
  function openConfirmation(input: { id: string; queued: boolean; unreachable?: boolean; phone: string }) {
    modalRef.current?.dismiss();
    const outbound = state.legs[0];
    const round = state.tripType === "round";
    // Handed over in memory, keyed by the request's id (saved offline: its queued key) — the URL carries only that key
    // and whether it was queued, never the phone, the city or a picture (F014).
    const key = input.id || keyRef.current;
    putConfirmation(key, {
      source: sourceRef.current,
      city: cityRef.current,
      phone: input.phone,
      from: outbound?.from ?? "",
      to: outbound?.to ?? "",
      cabin: state.cabin,
      trip: state.tripType,
      dates: datesChipLabel({ depart: outbound?.date || null, return: round ? state.legs[1]?.date || null : null }),
      travelers: travelersLabel(state.passengers),
      carrier: summary.carrier
        ? { name: summary.carrier.name, code: summary.carrier.code, logoUrl: summary.carrier.logoUrl }
        : null,
      media: photoRef.current,
    });
    const query = new URLSearchParams({ id: key, queued: input.queued ? "1" : "0" });
    if (input.queued && input.unreachable) query.set("why", "unreachable");
    router.push(`/request/confirmed?${query.toString()}` as Href);
  }

  /** Save the request on the phone; it goes out when the phone is back online, or when the club answers (26). */
  function saveOnPhone(body: RequestBody, unreachable: boolean) {
    if (!enqueueRequest(body, keyRef.current, cityNameRef.current)) {
      dispatch({ type: "setSubmitError", error: stateCopy("notSent").body });
      return;
    }
    openConfirmation({ id: "", queued: true, unreachable, phone: "" });
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
    // A new attempt: the last one's notice goes, whatever stops this one (DESIGN.md: never stacked).
    dispatch({ type: "setSubmitError", error: null });
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
      dispatch({ type: "setSubmitError", error: bodyProblem(valid.error.issues, state) });
      return;
    }
    const body = valid.data;
    setBusy(true);
    const net = await NetInfo.fetch();
    const online = net.isConnected && net.isInternetReachable !== false;

    if (!online) {
      setBusy(false);
      saveOnPhone(body, false);
      return;
    }

    const result = await submitRequest(body, keyRef.current);
    setBusy(false);
    if (!result.ok) {
      const kind = submitFailureKind(result.code);
      if (kind === "rateLimited") {
        modalRef.current?.dismiss();
        // Which limit refused: the member's own, or an address shared with others (F086) — the page words them apart.
        const scope = limitScope(result.context);
        const query = `minutes=${retryMinutes(result.retryAfterS)}${scope ? `&scope=${scope}` : ""}`;
        router.push(`/request/limited?${query}` as Href);
        return;
      }
      if (kind === "queued") {
        // A timeout or a server that did not answer while the phone is online is not "offline" (F110).
        saveOnPhone(body, result.code !== "OFFLINE");
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
        look="request"
        closeTestID="request.close"
        testID="request.sheet"
        dismissible={!busy}
        closable={!busy}
        insets={insets}
        footer={
          <View>
            <Button
              testID="request.submit"
              label={busy ? "Sending…" : title}
              variant="primary"
              trailing="arrow"
              height={SHEET.pill.height}
              text="buttonRequest"
              trailingSize={SHEET.pill.arrow}
              trailingStroke={SHEET.pill.arrowStroke}
              trailingGap={SHEET.pill.arrowGap}
              style={{ ...SHEET.pill.shadow, paddingBottom: 2 * SHEET.pill.lift }}
              busy={busy}
              onPress={() => void onSubmit()}
            />
            <View style={[styles.promise, { marginTop: SHEET.promise.below - baselineOffset(PROMISE) }]}>
              <View style={{ marginTop: baselineOffset(PROMISE) - SHEET.promise.iconRise - SHEET.promise.icon / 2 }}>
                <Icon name="phone-fill" size={SHEET.promise.icon} color={tokens.colors.textPrimary} />
              </View>
              <Text style={[PROMISE, styles.promiseText]}>An agent will call you shortly.</Text>
            </View>
          </View>
        }
      >
        <View style={SHEET.card}>
          <TripSummaryCard
            testID="request.summary"
            // The design's photograph of the city where it has one (ADR-IMPL-056); else the offer's own picture or the
            // city's photograph (ADR-IMPL-043).
            photo={
              (!trip.media ? clubPhoto(trip.toCode, "request") : null) ??
              cardPicture(trip.media, photoFor(trip.toCode), PICTURE_HEADERS)
            }
            fallback={CLUB_PICTURE}
            title={summary.title}
            cabin={cabinLabel(state.cabin)}
            dates={summaryDates(outbound?.date || null, round ? state.legs[1]?.date || null : null)}
            route={summary.route}
            carrier={summary.carrier}
            mark={airlineMark(summary.carrier?.code)}
            price={summary.price}
          />
        </View>

        <View style={[SHEET.column, { marginTop: SHEET.segments.top - SHEET.cardBottom }]}>
          <Segmented
            look="request"
            options={[
              { key: "round", label: "Round trip", testID: "request.tripType.round" },
              { key: "oneway", label: "One way", testID: "request.tripType.oneway" },
            ]}
            value={state.tripType}
            disabled={busy}
            onChange={(tripType) => dispatch({ type: "setTripType", tripType })}
          />
        </View>

        <View ref={returnBlock} style={[SHEET.column, { marginTop: SHEET.dates.top - SHEET.segments.bottom }]}>
          <View style={[styles.dates, { gap: SHEET.dates.gap }]}>
            <PickerField
              look="request"
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
                look="request"
                testID="request.return"
                label="Return"
                icon="calendar"
                value={state.legs[1]?.date ? dayText(state.legs[1].date) : null}
                placeholder=" "
                error={Boolean(state.returnError)}
                disabled={busy}
                onPress={() => presentDates("return")}
              />
            ) : null}
          </View>
          {state.returnError ? (
            <View style={round ? { marginLeft: SHEET.returnError.left } : undefined}>
              <FieldError testID="request.returnError" look="request">
                {state.returnError}
              </FieldError>
            </View>
          ) : null}
        </View>

        <View style={[SHEET.column, styles.row, { marginTop: SHEET.travelers.top - SHEET.dates.bottom }]}>
          <PickerField
            look="request"
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

        <View style={[styles.divider, SHEET.divider]} />
        <Text
          style={[SECTION, styles.contactTitle, { marginTop: SHEET.section.top, marginLeft: SHEET.section.left }]}
          accessibilityRole="header"
        >
          We will contact you
        </Text>
        <View style={[SHEET.column, { marginTop: SHEET.contact.first - SHEET.section.bottom }]}>
          <TextField
            look="request"
            testID="request.name"
            label="Name"
            icon="user"
            value={state.contact.name}
            editable={!busy}
            onChangeText={(v) => dispatch({ type: "setContact", field: "name", value: v })}
            autoCapitalize="words"
            autoComplete="name"
            // `RequestBody.contact.name` takes 80 characters: the field stops there instead of refusing the request.
            maxLength={REQUEST_NAME_MAX}
          />
        </View>
        <View ref={phoneBlock} style={[SHEET.column, { marginTop: SHEET.contact.gap }]}>
          <TextField
            look="request"
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
          {state.phoneError ? (
            <FieldError testID="request.phoneError" look="request">
              {state.phoneError}
            </FieldError>
          ) : null}
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
        <View style={[SHEET.column, { marginTop: SHEET.contact.gap }]}>
          <TextField
            look="request"
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
        </View>
        <View style={[SHEET.column, { marginTop: SHEET.contact.gap }]}>
          <TextField
            look="request"
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
        </View>

        {state.submitError ? (
          <View ref={notSent} style={[SHEET.column, { marginTop: SHEET.contact.gap }]}>
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

type Role = TextStyle & { fontSize: number; lineHeight: number };
const PROMISE = rn(tokens.type.requestPromise) as Role;
const SECTION = rn(tokens.type.requestSection) as Role;

/**
 * 06 from the screen's top (pt; the sheet's top on 266): the trip card 17.3 in and 16.2 from the right, 318.4 to 408.5;
 * the segments from 418.4, 24.8 tall; Depart and Return from 453.2, 37.4 tall, 9.5 apart; Travelers from 499.3; the
 * rule on 549.6; `We will contact you` on 576.7, 20.2 in; the contact fields from 589.3, 36.8 tall, 7.6 apart — the
 * fields 19.2 in and 17.8 from the right; the pill 29 tall, its words and arrow centred, the promise 15.3 under it.
 */
const SHEET = {
  card: { marginLeft: 17.3, marginRight: 16.2 },
  cardBottom: 408.5,
  column: { marginLeft: 19.2, marginRight: 17.8 },
  segments: { top: 418.4, bottom: 418.4 + 24.8 },
  dates: { top: 453.17, bottom: 453.17 + 37.4, gap: 9.5 },
  // 22: the return's line under its field, from the field's own left.
  returnError: { left: 173.1 + 9.5 },
  travelers: { top: 499.32, bottom: 499.32 + 37.4 },
  divider: { marginTop: 549.37 - (499.32 + 37.4), marginLeft: 18.7, marginRight: 17.8 },
  section: {
    top: 576.68 - baselineOffset(SECTION) - 549.83,
    left: 20.2,
    bottom: 576.68 - baselineOffset(SECTION) + SECTION.lineHeight,
  },
  contact: { first: 588.12, gap: 7.6 },
  pill: {
    height: 29,
    arrow: 16.4,
    arrowStroke: 1.6,
    arrowGap: 5.2,
    // 06: the words 0.19 over the pill's middle.
    lift: 0.19,
    shadow: { ...tokens.elevation.card },
  },
  promise: { below: 15.91, icon: 9.5, iconRise: 3.4 },
} as const;

/** 06's days on the card: `Nov 12 – Nov 19, 2026` — each day by its month, the year once. */
function summaryDates(depart: string | null, ret: string | null): string {
  if (!depart) return datesChipLabel({ depart: null, return: null });
  const day = (ymd: string) => {
    const label = dayText(ymd) ?? ymd;
    return label.replace(/, \d{4}$/, "");
  };
  if (!ret) return dayText(depart) ?? depart;
  const sameYear = depart.slice(0, 4) === ret.slice(0, 4);
  return sameYear ? `${day(depart)} – ${day(ret)}, ${ret.slice(0, 4)}` : `${dayText(depart)} – ${dayText(ret)}`;
}

const styles = StyleSheet.create({
  promise: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 7.2 },
  promiseText: { color: tokens.colors.textLabel },
  // 06: Depart and Return side by side.
  dates: { flexDirection: "row" },
  row: { flexDirection: "row" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.borderDefault },
  contactTitle: { color: tokens.colors.textPrimary },
  savedPhone: { alignItems: "flex-start" },
});
