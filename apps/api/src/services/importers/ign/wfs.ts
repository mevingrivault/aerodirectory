/** Paged GeoJSON reads from the IGN Géoplateforme WFS (BD TOPO, Licence Ouverte). */

const WFS_URL = "https://data.geopf.fr/wfs/ows";
const REQUEST_TIMEOUT_MS = 120_000;

export interface WfsQuery {
  layer: string;
  properties: string[];
  pageSize: number;
  cqlFilter?: string;
}

export type FetchPage = (startIndex: number) => Promise<unknown>;

/** A page fetcher for one query, in WGS 84, stably sorted so paging is consistent. */
export function wfsPageFetcher(query: WfsQuery): FetchPage {
  return async (startIndex) => {
    const params = new URLSearchParams({
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      TYPENAMES: query.layer,
      OUTPUTFORMAT: "application/json",
      SRSNAME: "EPSG:4326",
      PROPERTYNAME: [...query.properties, "geometrie"].join(","),
      SORTBY: "cleabs",
      COUNT: String(query.pageSize),
      STARTINDEX: String(startIndex),
      ...(query.cqlFilter ? { CQL_FILTER: query.cqlFilter } : {}),
    });
    const res = await fetch(`${WFS_URL}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Géoplateforme WFS (${query.layer}): HTTP ${res.status}`);
    return res.json();
  };
}
