import aa from "@/assets/images/club/airlines/aa.webp";
import ba from "@/assets/images/club/airlines/ba.webp";
import vs from "@/assets/images/club/airlines/vs.webp";
import logoAegeanAirlines from "@/assets/images/club/airlines/logos/aegean-airlines.webp";
import logoAerLingus from "@/assets/images/club/airlines/logos/aer-lingus.webp";
import logoAerolineasArgentinas from "@/assets/images/club/airlines/logos/aerolineas-argentinas.webp";
import logoAeromexico from "@/assets/images/club/airlines/logos/aeromexico.webp";
import logoAirCanada from "@/assets/images/club/airlines/logos/air-canada.webp";
import logoAirEuropa from "@/assets/images/club/airlines/logos/air-europa.webp";
import logoAirFrance from "@/assets/images/club/airlines/logos/air-france.webp";
import logoAirIndia from "@/assets/images/club/airlines/logos/air-india.webp";
import logoAirMauritius from "@/assets/images/club/airlines/logos/air-mauritius.webp";
import logoAirNewZealand from "@/assets/images/club/airlines/logos/air-new-zealand.webp";
import logoAirSerbia from "@/assets/images/club/airlines/logos/air-serbia.webp";
import logoAirTransat from "@/assets/images/club/airlines/logos/air-transat.webp";
import logoAirbaltic from "@/assets/images/club/airlines/logos/airbaltic.webp";
import logoAlaskaAirlines from "@/assets/images/club/airlines/logos/alaska-airlines.webp";
import logoAllNipponAirways from "@/assets/images/club/airlines/logos/all-nippon-airways.webp";
import logoAsianaAirlines from "@/assets/images/club/airlines/logos/asiana-airlines.webp";
import logoAvianca from "@/assets/images/club/airlines/logos/avianca.webp";
import logoAzerbaijanAirlines from "@/assets/images/club/airlines/logos/azerbaijan-airlines.webp";
import logoBangkokAirways from "@/assets/images/club/airlines/logos/bangkok-airways.webp";
import logoBrusselsAirlines from "@/assets/images/club/airlines/logos/brussels-airlines.webp";
import logoCathayPacific from "@/assets/images/club/airlines/logos/cathay-pacific.webp";
import logoCopaAirlines from "@/assets/images/club/airlines/logos/copa-airlines.webp";
import logoEmirates from "@/assets/images/club/airlines/logos/emirates.webp";
import logoEthiopianAirlines from "@/assets/images/club/airlines/logos/ethiopian-airlines.webp";
import logoEtihadAirways from "@/assets/images/club/airlines/logos/etihad-airways.webp";
import logoFinnair from "@/assets/images/club/airlines/logos/finnair.webp";
import logoGarudaIndonesia from "@/assets/images/club/airlines/logos/garuda-indonesia.webp";
import logoIberia from "@/assets/images/club/airlines/logos/iberia.webp";
import logoIcelandair from "@/assets/images/club/airlines/logos/icelandair.webp";
import logoJapanAirlines from "@/assets/images/club/airlines/logos/japan-airlines.webp";
import logoJetblueAirways from "@/assets/images/club/airlines/logos/jetblue-airways.webp";
import logoKenyaAirways from "@/assets/images/club/airlines/logos/kenya-airways.webp";
import logoKlm from "@/assets/images/club/airlines/logos/klm.webp";
import logoKoreanAir from "@/assets/images/club/airlines/logos/korean-air.webp";
import logoKuwaitAirways from "@/assets/images/club/airlines/logos/kuwait-airways.webp";
import logoLatamAirlines from "@/assets/images/club/airlines/logos/latam-airlines.webp";
import logoLotPolishAirlines from "@/assets/images/club/airlines/logos/lot-polish-airlines.webp";
import logoLufthansa from "@/assets/images/club/airlines/logos/lufthansa.webp";
import logoMalaysiaAirlines from "@/assets/images/club/airlines/logos/malaysia-airlines.webp";
import logoOmanAir from "@/assets/images/club/airlines/logos/oman-air.webp";
import logoPhilippineAirlines from "@/assets/images/club/airlines/logos/philippine-airlines.webp";
import logoQatarAirways from "@/assets/images/club/airlines/logos/qatar-airways.webp";
import logoRiyadhAir from "@/assets/images/club/airlines/logos/riyadh-air.webp";
import logoRoyalAirMaroc from "@/assets/images/club/airlines/logos/royal-air-maroc.webp";
import logoScandinavianAirlines from "@/assets/images/club/airlines/logos/scandinavian-airlines.webp";
import logoSingaporeAirlines from "@/assets/images/club/airlines/logos/singapore-airlines.webp";
import logoSwiss from "@/assets/images/club/airlines/logos/swiss.webp";
import logoTapAirPortugal from "@/assets/images/club/airlines/logos/tap-air-portugal.webp";
import logoTurkishAirlines from "@/assets/images/club/airlines/logos/turkish-airlines.webp";
import logoUnitedAirlines from "@/assets/images/club/airlines/logos/united-airlines.webp";
import type { AirlineMark, AirlineRibbon } from "@bbc/ui";

import {
  airlineLogoSlug,
  airlineMarkKey,
  LOGO_BOX,
  MARK_NUDGE,
  MARK_PIXELS,
  type MarkKey,
  RIBBON_WINDOW,
} from "./airline-mark-logic";

const SOURCES: Record<MarkKey, number> = { BA: ba, VS: vs, AA: aa };

/** The package's fifty further logos (`assets/airlines-expanded/png`), copied without scaling as lossless WebP. */
const LOGOS: Record<string, number> = {
  "aegean-airlines": logoAegeanAirlines,
  "aer-lingus": logoAerLingus,
  "aerolineas-argentinas": logoAerolineasArgentinas,
  aeromexico: logoAeromexico,
  "air-canada": logoAirCanada,
  "air-europa": logoAirEuropa,
  "air-france": logoAirFrance,
  "air-india": logoAirIndia,
  "air-mauritius": logoAirMauritius,
  "air-new-zealand": logoAirNewZealand,
  "air-serbia": logoAirSerbia,
  "air-transat": logoAirTransat,
  airbaltic: logoAirbaltic,
  "alaska-airlines": logoAlaskaAirlines,
  "all-nippon-airways": logoAllNipponAirways,
  "asiana-airlines": logoAsianaAirlines,
  avianca: logoAvianca,
  "azerbaijan-airlines": logoAzerbaijanAirlines,
  "bangkok-airways": logoBangkokAirways,
  "brussels-airlines": logoBrusselsAirlines,
  "cathay-pacific": logoCathayPacific,
  "copa-airlines": logoCopaAirlines,
  emirates: logoEmirates,
  "ethiopian-airlines": logoEthiopianAirlines,
  "etihad-airways": logoEtihadAirways,
  finnair: logoFinnair,
  "garuda-indonesia": logoGarudaIndonesia,
  iberia: logoIberia,
  icelandair: logoIcelandair,
  "japan-airlines": logoJapanAirlines,
  "jetblue-airways": logoJetblueAirways,
  "kenya-airways": logoKenyaAirways,
  klm: logoKlm,
  "korean-air": logoKoreanAir,
  "kuwait-airways": logoKuwaitAirways,
  "latam-airlines": logoLatamAirlines,
  "lot-polish-airlines": logoLotPolishAirlines,
  lufthansa: logoLufthansa,
  "malaysia-airlines": logoMalaysiaAirlines,
  "oman-air": logoOmanAir,
  "philippine-airlines": logoPhilippineAirlines,
  "qatar-airways": logoQatarAirways,
  "riyadh-air": logoRiyadhAir,
  "royal-air-maroc": logoRoyalAirMaroc,
  "scandinavian-airlines": logoScandinavianAirlines,
  "singapore-airlines": logoSingaporeAirlines,
  swiss: logoSwiss,
  "tap-air-portugal": logoTapAirPortugal,
  "turkish-airlines": logoTurkishAirlines,
  "united-airlines": logoUnitedAirlines,
};

/**
 * The airline's mark as the design draws it (04; ADR-IMPL-056): the package's own crops, white-backed, set at the size
 * the image draws them; else the package's logo of the airline (#76) in the British Airways mark's box — never
 * recoloured or redrawn. An airline the package has no logo for has none here: its card shows the fare's logo, else
 * the airline's name.
 */
export function airlineMark(code: string | null | undefined): AirlineMark | null {
  const key = airlineMarkKey(code);
  if (key) {
    const { width, height } = MARK_PIXELS[key];
    return { source: SOURCES[key], width, height, nudge: MARK_NUDGE[key] };
  }
  const slug = airlineLogoSlug(code);
  const source = slug ? LOGOS[slug] : undefined;
  return source === undefined ? null : { source, width: LOGO_BOX.width, height: LOGO_BOX.height };
}

/** The airline's ribbon alone where the design draws it so (05: British Airways); null for the others. */
export function airlineRibbon(code: string | null | undefined): AirlineRibbon | null {
  const key = airlineMarkKey(code);
  const window = key ? RIBBON_WINDOW[key] : undefined;
  if (!key || !window) return null;
  const { width, height } = MARK_PIXELS[key];
  return { source: SOURCES[key], width, height, window };
}
