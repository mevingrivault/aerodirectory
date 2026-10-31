/**
 * Sunrise, sunset and civil twilight, after the NOAA solar calculator
 * (https://gml.noaa.gov/grad/solcalc/), accurate to about a minute between
 * the polar circles. Computed at sea level with a flat horizon.
 */

export interface SunTimes {
  /** UTC calendar day the times belong to (local solar day at the aerodrome). */
  date: string;
  sunrise: string | null;
  sunset: string | null;
  civilDawn: string | null;
  civilDusk: string | null;
  /** Sunrise − 30 min / sunset + 30 min: the bounds of aeronautical night in France. */
  aeronauticalDayStart: string | null;
  aeronauticalDayEnd: string | null;
}

// Zenith angles: refraction and the solar disc put sunrise at 90°50'.
const SUNRISE_ZENITH = 90.833;
const CIVIL_TWILIGHT_ZENITH = 96;
const AERONAUTICAL_MARGIN_MINUTES = 30;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function julianCentury(jd: number): number {
  return (jd - 2451545) / 36525;
}

/** Solar declination (°) and equation of time (minutes) at a Julian century. */
function solarPosition(t: number): { declination: number; equationOfTime: number } {
  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const m = rad(meanAnomaly);
  const center =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const omega = rad(125.04 - 1934.136 * t);
  const apparentLong = meanLong + center - 0.00569 - 0.00478 * Math.sin(omega);

  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega);

  const declination = deg(Math.asin(Math.sin(rad(obliquity)) * Math.sin(rad(apparentLong))));

  const y = Math.tan(rad(obliquity) / 2) ** 2;
  const l0 = rad(meanLong);
  const eot =
    y * Math.sin(2 * l0) -
    2 * eccentricity * Math.sin(m) +
    4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * m);

  return { declination, equationOfTime: 4 * deg(eot) };
}

/**
 * Minutes after 00:00 UTC of the event, or null when the sun never reaches
 * that zenith that day (polar day or night).
 */
function eventMinutesUtc(
  jdMidnight: number,
  lat: number,
  lon: number,
  zenith: number,
  rising: boolean,
): number | null {
  // Start from local solar noon, then refine once at the event time itself.
  let minutes = 720 - 4 * lon;
  for (let i = 0; i < 2; i++) {
    const { declination, equationOfTime } = solarPosition(julianCentury(jdMidnight + minutes / 1440));
    const cosHourAngle =
      Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(rad(declination))) -
      Math.tan(rad(lat)) * Math.tan(rad(declination));
    if (cosHourAngle < -1 || cosHourAngle > 1) return null;
    const hourAngle = deg(Math.acos(cosHourAngle)) * (rising ? 1 : -1);
    minutes = 720 - 4 * (lon + hourAngle) - equationOfTime;
  }
  return minutes;
}

/** Sun times at a point for a UTC calendar day ("YYYY-MM-DD"). */
export function computeSunTimes(date: string, lat: number, lon: number): SunTimes {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const jdMidnight = midnight / 86_400_000 + 2440587.5;

  const at = (minutes: number | null, offsetMinutes = 0) =>
    minutes == null ? null : new Date(midnight + Math.round((minutes + offsetMinutes) * 60) * 1000).toISOString();

  const sunrise = eventMinutesUtc(jdMidnight, lat, lon, SUNRISE_ZENITH, true);
  const sunset = eventMinutesUtc(jdMidnight, lat, lon, SUNRISE_ZENITH, false);

  return {
    date,
    sunrise: at(sunrise),
    sunset: at(sunset),
    civilDawn: at(eventMinutesUtc(jdMidnight, lat, lon, CIVIL_TWILIGHT_ZENITH, true)),
    civilDusk: at(eventMinutesUtc(jdMidnight, lat, lon, CIVIL_TWILIGHT_ZENITH, false)),
    aeronauticalDayStart: at(sunrise, -AERONAUTICAL_MARGIN_MINUTES),
    aeronauticalDayEnd: at(sunset, AERONAUTICAL_MARGIN_MINUTES),
  };
}
