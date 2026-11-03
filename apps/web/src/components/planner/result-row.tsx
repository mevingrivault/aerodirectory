"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlannerResult } from "@aerodirectory/shared";
import { cn, formatEuros, formatFlightTime, formatNm } from "@/lib/utils";
import { formatPricePerLiter, isStale } from "@/lib/community-info";
import { BikeIcon, BusIcon, FuelIcon, HomeIcon, IcePlane, RestaurantIcon } from "./icons";
import { FUEL_SHORT_LABELS, type TripScope } from "./types";

/** "14:35", in the visitor's time zone. */
const formatClock = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" });


export function ResultRow({ result: r, tripScope, briefingHref }: { result: PlannerResult; tripScope: TripScope; briefingHref: string | null }) {
  const router = useRouter();
  const displayTime = tripScope === "round_trip" ? r.tripTimeHours : r.timeHours;
  const displayFuel = tripScope === "round_trip" ? r.tripFuelLiters : r.fuelUsedLiters;
  const isUlm = false;
  const isHydro = false;

  return (
    <Link href={`/aerodrome/${r.aerodrome.id}`} style={{ textDecoration: "none" }}>
      <div className="result-row">
        <div className={cn("result-ico", isUlm && "ulm", isHydro && "hydro")}>
          <IcePlane />
        </div>
        <div className="result-main">
          <div className="result-head">
            <span className="result-name">{r.aerodrome.name}</span>
            {r.aerodrome.icaoCode && (
              <span className="badge badge-oaci">{r.aerodrome.icaoCode}</span>
            )}
            <span className="badge badge-vfr">Ouvert</span>
            {r.aerodrome.ppr && <span className="badge badge-warn" title="Prior Permission Required : prévenir le terrain avant de venir">PPR</span>}
            {r.aerodrome.privateUse && <span className="badge badge-warn">Privé</span>}
            {r.aerodrome.skydiveActivity && <span className="badge badge-warn">Parachutisme</span>}
            {r.nightOperation && <span className="badge badge-night" title="Un décollage ou un atterrissage tombe pendant la nuit aéronautique (coucher du soleil + 30 min)">Nuit aéro</span>}
            {r.aerodrome.city && <span className="result-city">{r.aerodrome.city}</span>}
          </div>
          <div className="result-line">
            <span><span className="mono">{formatNm(r.distanceNm)}</span></span>
            <span className="sep" />
            <span>◷ <span className="mono">{formatFlightTime(displayTime)}{tripScope === "round_trip" ? " A/R" : ""}</span></span>
            <span className="sep" />
            <span>⛽ <span className="mono">{displayFuel.toFixed(1)} L</span></span>
            {r.aerodrome.maxRunwayLength && (
              <>
                <span className="sep" />
                <span><span className="mono">{r.aerodrome.maxRunwayLength} m piste</span></span>
              </>
            )}
            {r.aerodrome.elevation != null && (
              <>
                <span className="sep" />
                <span><span className="mono">{r.aerodrome.elevation} ft</span></span>
              </>
            )}
          </div>
          {(r.arrivalAt || r.landingFee || r.fuelPrice) && (
            <div className="result-line">
              {r.arrivalAt && (
                <span>
                  Arrivée <span className="mono">{formatClock(r.arrivalAt)}</span>
                  {r.returnAt && <> · retour <span className="mono">{formatClock(r.returnAt)}</span></>}
                </span>
              )}
              {r.landingFee && (
                <>
                  {r.arrivalAt && <span className="sep" />}
                  <span title={`D'après un membre, constaté le ${formatDay(r.landingFee.observedAt)}`}>
                    Taxe <span className="mono">{r.landingFee.amount === 0 ? "gratuite" : formatEuros(r.landingFee.amount)}</span>
                    {r.parkingNights > 0 && r.landingFee.parkingPerNight != null && (
                      <> + parking <span className="mono">{r.parkingNights} × {formatEuros(r.landingFee.parkingPerNight)}</span></>
                    )}
                    {isStale({ kind: "LANDING_FEE", observedAt: r.landingFee.observedAt }) && " (à vérifier)"}
                  </span>
                </>
              )}
              {r.fuelPrice && (
                <>
                  {(r.arrivalAt || r.landingFee) && <span className="sep" />}
                  <span title={`D'après un membre, constaté le ${formatDay(r.fuelPrice.observedAt)}`}>
                    ⛽ <span className="mono">{formatPricePerLiter(r.fuelPrice.pricePerLiter)}</span>
                    {isStale({ kind: "FUEL_PRICE", observedAt: r.fuelPrice.observedAt }) && " (à vérifier)"}
                  </span>
                </>
              )}
            </div>
          )}
          {r.refuelRequired && (
            <div className="result-line" style={{ color: "oklch(0.45 0.12 60)" }}>
              ⛽ Retour possible seulement en refaisant le plein sur place
            </div>
          )}
          {(r.aerodrome.hasRestaurant || r.aerodrome.hasAccommodation || r.aerodrome.hasTransport || r.aerodrome.hasBikes || r.aerodrome.fuels.length > 0) && (
            <div className="result-amen">
              {r.aerodrome.hasRestaurant && (
                <span className="amen">
                  <RestaurantIcon />
                  Restaurant
                </span>
              )}
              {r.aerodrome.hasAccommodation && (
                <span className="amen">
                  <HomeIcon />
                  Hébergement
                </span>
              )}
              {r.aerodrome.hasTransport && (
                <span className="amen">
                  <BusIcon />
                  Transport
                </span>
              )}
              {r.aerodrome.hasBikes && (
                <span className="amen">
                  <BikeIcon />
                  Vélo
                </span>
              )}
              {r.aerodrome.fuels.map((fuel: string) => {
                const label = FUEL_SHORT_LABELS[fuel] ?? null;
                return label ? (
                  <span key={fuel} className="amen fuel">
                    <FuelIcon />
                    {label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
        <div className="result-right">
          {r.estimatedCost > 0 && (
            <div className="result-price">
              <div className="result-price-val">
                {r.estimatedCost.toFixed(2).replace(".", ",")} <span className="unit">€</span>
              </div>
              <div className="result-price-sub">{r.landingFee ? (r.parkingNights > 0 && r.landingFee.parkingPerNight ? "estimé, taxe et parking inclus" : "estimé, taxe incluse") : "estimé"}</div>
            </div>
          )}
          {briefingHref && (
            <button
              type="button"
              className="planner-btn-secondary"
              style={{ height: 30, fontSize: 12 }}
              // The row is a link to the sheet: open the briefing instead.
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`${briefingHref}&to=${r.aerodrome.id}`); }}
            >
              Briefing
            </button>
          )}
          <svg style={{width:16,height:16,flexShrink:0,color:"var(--ink-400)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}
