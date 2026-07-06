export const THUMBNAILS_BASE =
  "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/maps/thumbnails";

export function getMapThumbnailUrls(layer: string): string[] {
  // Strip SquadJS prefixes like "SEC_26_"
  const stripped = layer.replace(/^SEC_?\d*_?/, "").trim();

  // The SquadMaps repo uses CamelCased map names with underscores only before
  // the game mode and version (e.g. "GooseBay_RAAS_v2.jpg", "AlBasrah_Invasion_v3.jpg").
  // Layer strings from SquadJS arrive as "Goose Bay RAAS v2" — so we need the
  // map-name portion collapsed (no spaces, no underscores) while keeping the
  // separators before mode and version.
  const parts = stripped.split(/\s+/).filter(Boolean);

  const candidates = new Set<string>();

  // Variant 1: every space -> underscore (legacy behavior, matches a few maps).
  candidates.add(parts.join("_"));

  // Variant 2: collapse map-name words, keep mode/version separated.
  // Match trailing "...<MODE> v<N>" (mode is last word before version).
  if (parts.length >= 3) {
    const versionPart = parts[parts.length - 1];
    const modePart = parts[parts.length - 2];
    const mapNamePart = parts.slice(0, -2).join("");
    if (mapNamePart && /^v\d+$/i.test(versionPart)) {
      candidates.add(`${mapNamePart}_${modePart}_${versionPart}`);
    }
  }

  // Variant 3: no trailing version — just "<Map> <MODE>".
  if (parts.length >= 2 && !/^v\d+$/i.test(parts[parts.length - 1])) {
    const modePart = parts[parts.length - 1];
    const mapNamePart = parts.slice(0, -1).join("");
    if (mapNamePart) candidates.add(`${mapNamePart}_${modePart}`);
  }

  // For each candidate, also try the zero-padded version number (v2 <-> v02).
  const urls: string[] = [];
  for (const name of candidates) {
    urls.push(`${THUMBNAILS_BASE}/${name}.jpg`);
    const m = name.match(/^(.+_v)(\d+)$/);
    if (m) {
      const padded = m[2].padStart(2, "0");
      if (padded !== m[2]) urls.push(`${THUMBNAILS_BASE}/${m[1]}${padded}.jpg`);
      const unpadded = String(parseInt(m[2], 10));
      if (unpadded !== m[2]) urls.push(`${THUMBNAILS_BASE}/${m[1]}${unpadded}.jpg`);
    }
  }
  return urls;
}
