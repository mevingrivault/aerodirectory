/**
 * Map popup content built from DOM nodes. Names and remarks come from
 * openAIP and OSM, which anyone can edit: they are set as text, never parsed
 * as HTML (the CSP allows inline scripts, so injected markup would run).
 */

export interface PopupLine {
  text: string;
  style?: Partial<CSSStyleDeclaration>;
}

export const POPUP_TITLE: Partial<CSSStyleDeclaration> = { fontWeight: "600" };
export const POPUP_DETAIL: Partial<CSSStyleDeclaration> = { fontSize: "12px", color: "#666" };
export const POPUP_NOTE: Partial<CSSStyleDeclaration> = { fontSize: "11px", color: "#888", marginTop: "2px" };

export function popupContent(lines: PopupLine[], image?: { src: string; alt: string }): HTMLElement {
  const root = document.createElement("div");
  if (image) {
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt;
    img.decoding = "async";
    Object.assign(img.style, {
      display: "block",
      width: "200px",
      height: "112px",
      objectFit: "cover",
      borderRadius: "4px",
      marginBottom: "6px",
      background: "#eef2f6",
    });
    root.append(img);
  }
  for (const line of lines) {
    if (!line.text) continue;
    const div = document.createElement("div");
    div.textContent = line.text;
    Object.assign(div.style, line.style ?? {});
    root.append(div);
  }
  return root;
}
