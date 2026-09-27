import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import NetInfo from "@react-native-community/netinfo";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FareVM } from "@bbc/shared/api/v1/fares";
import { Button, Chip, CloseButton, Icon, short, tokens, rn, type Selection } from "@bbc/ui";

import { PhoneField } from "@/components/phone-field";
import { DatesSheet, type DatesSheetHandle } from "@/features/requests/DatesSheet";
import { buildDraft, draftToBody, useRequestDraft, type RequestDraft } from "@/features/requests/useRequestDraft";
import { submitRequest, type Profile } from "@/lib/api";
import { enqueueRequest } from "@/lib/queue";
import { env } from "@/lib/env";
import { defaultPhoneCountry, splitStoredPhone, validatePhone, type CountryCode } from "@/lib/phone";

export type RequestSheetHandle = {
  present: (opts: { fare?: FareVM | null; profile?: Profile | null; fromCode?: string; toCode?: string }) => void;
  dismiss: () => void;
};

type Props = {
  onDone?: () => void;
  onSeeRequests?: () => void;
};

const SNAP = ["90%"] as const;

export const RequestSheet = forwardRef<RequestSheetHandle, Props>(function RequestSheet(
  { onDone, onSeeRequests },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const datesRef = useRef<DatesSheetHandle>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(() => defaultPhoneCountry());
  const [seed] = useState<RequestDraft>(() => buildDraft({}));
  const { state, dispatch } = useRequestDraft(seed);
  const keyRef = useRef(idempotencyKey);

  useEffect(() => {
    keyRef.current = idempotencyKey;
  }, [idempotencyKey]);

  useImperativeHandle(ref, () => ({
    present(opts) {
      const next = buildDraft(opts);
      const split = splitStoredPhone(next.contact.phone, defaultPhoneCountry());
      dispatch({
        type: "reset",
        draft: { ...next, contact: { ...next.contact, phone: split.national } },
      });
      setPhoneCountry(split.country);
      setIdempotencyKey(crypto.randomUUID());
      setBusy(false);
      setNoteOpen(false);
      modalRef.current?.present();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function onSubmit() {
    const phone = validatePhone(state.contact.phone, phoneCountry);
    if (!phone.valid) {
      dispatch({ type: "setPhoneError", error: phone.error });
      return;
    }
    const body = draftToBody({
      ...state,
      contact: { ...state.contact, phone: phone.e164 },
    });
    const net = await NetInfo.fetch();
    const online = net.isConnected && net.isInternetReachable !== false;

    if (!online) {
      enqueueRequest(body, keyRef.current);
      const route = `${body.legs[0]!.from} → ${body.legs[body.legs.length - 1]!.to}`;
      dispatch({
        type: "confirm",
        phone: phone.e164,
        route,
        dates: body.legs.map((l) => l.date).join(" · "),
        saved: true,
      });
      return;
    }

    setBusy(true);
    const result = await submitRequest(body, keyRef.current);
    setBusy(false);
    if (!result.ok) {
      // Timeout / mid-flight offline: same idempotency key → queue + saved confirm.
      // Real 4xx stays an error (no queue).
      if (result.code === "TIMEOUT" || result.code === "OFFLINE") {
        enqueueRequest(body, keyRef.current);
        const route = `${body.legs[0]!.from} → ${body.legs[body.legs.length - 1]!.to}`;
        dispatch({
          type: "confirm",
          phone: phone.e164,
          route,
          dates: body.legs.map((l) => l.date).join(" · "),
          saved: true,
        });
        return;
      }
      dispatch({ type: "setSubmitError", error: result.message });
      return;
    }
    dispatch({
      type: "confirm",
      phone: phone.e164,
      route: result.data.route,
      dates: result.data.dates,
    });
  }

  const monoLine = `${state.legs[0]?.from ?? "JFK"} → ${state.legs[0]?.to ?? "LHR"} · ${state.cabin.toUpperCase()}${
    state.priceAtRequest != null ? ` · FROM $${state.priceAtRequest.toLocaleString("en-US")}` : ""
  }`;

  const confirmed = state.phase === "confirm" || state.phase === "saved";

  function presentDates(editing: Selection["editing"]) {
    datesRef.current?.present({
      tripType: state.tripType,
      depart: state.legs[0]?.date || null,
      ret: state.tripType === "round" ? state.legs[1]?.date || null : null,
      editing,
    });
  }

  return (
    <>
      <BottomSheetModal
        ref={modalRef}
        snapPoints={[...SNAP]}
        enablePanDownToClose={!busy}
        keyboardBehavior="interactive"
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content} testID="request.sheet">
          {confirmed ? (
            <>
              <View style={styles.checkWrap}>
                <Icon name="check" size={24} color={tokens.colors.textPrimary} />
              </View>
              <Text style={styles.display}>{state.phase === "saved" ? "Saved." : "Request received."}</Text>
              <Text style={styles.body}>
                {state.phase === "saved"
                  ? "We'll send it when you're back online."
                  : `A specialist will call you shortly on ${state.confirmedPhone}.`}
              </Text>
              <Text style={styles.mono}>
                {state.confirmedRoute} · {state.confirmedDates} · {state.cabin.toUpperCase()}
              </Text>
              <Button
                testID="request.done"
                label="Done"
                shape="card"
                onPress={() => {
                  modalRef.current?.dismiss();
                  onDone?.();
                }}
              />
              <Pressable
                testID="request.seeRequests"
                accessibilityRole="link"
                onPress={() => {
                  modalRef.current?.dismiss();
                  onSeeRequests?.();
                }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.link}>See it in Requests</Text>
              </Pressable>
              {env.EXPO_PUBLIC_SUPPORT_PHONE ? (
                <Text style={styles.caption}>{`Don't want to wait? Call ${env.EXPO_PUBLIC_SUPPORT_PHONE}`}</Text>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Request this fare</Text>
                <CloseButton testID="request.close" onPress={() => modalRef.current?.dismiss()} />
              </View>
              <Text style={styles.mono}>{monoLine}</Text>

              <View style={styles.chips}>
                <Chip
                  testID="request.tripType.round"
                  label="Round trip"
                  selected={state.tripType === "round"}
                  onPress={() => dispatch({ type: "setTripType", tripType: "round" })}
                />
                <Chip
                  testID="request.tripType.oneway"
                  label="One way"
                  selected={state.tripType === "oneway"}
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
                <DateRow
                  testID="request.return"
                  label="RETURN"
                  value={state.legs[1]?.date ? short(state.legs[1].date) : "Select date"}
                  onPress={() => presentDates("return")}
                />
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

              {state.submitError ? <Text style={styles.error}>{state.submitError}</Text> : null}

              <Button
                testID="request.submit"
                label={busy ? "Sending…" : "Request this fare"}
                busy={busy}
                shape="card"
                onPress={() => void onSubmit()}
              />
              <Text style={styles.caption}>A specialist will call you shortly.</Text>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
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
  onPress,
}: {
  testID: string;
  label: string;
  value: string;
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
      <Text style={styles.dateValue}>{value}</Text>
    </Pressable>
  );
}

function Field({
  testID,
  label,
  value,
  onChangeText,
  empty,
  keyboardType,
  multiline,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  empty?: boolean;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "email-address";
  multiline?: boolean;
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
        style={[styles.field, empty && styles.fieldEmpty, multiline && styles.fieldMulti]}
        placeholderTextColor={tokens.colors.textTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl, gap: tokens.space.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
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
