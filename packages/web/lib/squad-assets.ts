/**
 * Hybrid Squad asset URLs.
 *
 * Flags: aachtenberg/squadmaps-v2 (actively maintained, Squad 10.x).
 * Layer maps: Squad Wiki pipeline (layer-specific art; bulk data ~2024).
 * Map minimaps: squadmaps-v2 thumbnails (covers modern maps missing from wiki).
 * Fallback: last mahtoid/SquadMaps commit that still hosted layer thumbs.
 */

const FLAG_BASE =
  "https://raw.githubusercontent.com/aachtenberg/squadmaps-v2/main/assets/flags";

/** SDK export still has MEA/INS filenames that v2 renamed away from. */
const SQUAD_JSON_FLAG_BASE =
  "https://raw.githubusercontent.com/frobinsonj/squad-json/main/images/flags";

const WIKI_LAYER_BASE =
  "https://raw.githubusercontent.com/Squad-Wiki/squad-wiki-pipeline-map-data/master/completed_output/_Current%20Version/images";

const V2_THUMB_BASE =
  "https://raw.githubusercontent.com/aachtenberg/squadmaps-v2/main/assets/thumbnails";

const LEGACY_THUMB_BASE =
  "https://raw.githubusercontent.com/mahtoid/SquadMaps/2d6b0800952c2fa78a80daed5acfecb8f4fdbb14/img/maps/thumbnails";

/** App short codes / aliases -> flag asset URL. */
const FACTION_FLAG_URL: Record<string, string> = {
  USA: `${FLAG_BASE}/flag_USA.png`,
  USMC: `${FLAG_BASE}/flag_USMC.png`,
  RUS: `${FLAG_BASE}/flag_RGF.png`,
  RGF: `${FLAG_BASE}/flag_RGF.png`,
  VDV: `${FLAG_BASE}/flag_VDV.png`,
  GB: `${FLAG_BASE}/flag_BAF.png`,
  BAF: `${FLAG_BASE}/flag_BAF.png`,
  CAF: `${FLAG_BASE}/flag_CAF.png`,
  AUS: `${FLAG_BASE}/flag_ADF.png`,
  ADF: `${FLAG_BASE}/flag_ADF.png`,
  PLA: `${FLAG_BASE}/flag_PLA.png`,
  PLANMC: `${FLAG_BASE}/flag_PLANMC.png`,
  PLAAGF: `${FLAG_BASE}/flag_PLAAGF.png`,
  TLF: `${FLAG_BASE}/flag_TLF.png`,
  WPMC: `${FLAG_BASE}/flag_WPMC.png`,
  // Insurgents / militia (modern names on v2)
  INS: `${FLAG_BASE}/flag_MEI.png`,
  MEI: `${FLAG_BASE}/flag_MEI.png`,
  MIL: `${FLAG_BASE}/flag_IMF.png`,
  IMF: `${FLAG_BASE}/flag_IMF.png`,
  // MEA art still under old name in SDK export; not present on v2 as MEA
  MEA: `${SQUAD_JSON_FLAG_BASE}/mea.png`,
  // Extra modern codes present on v2
  AFU: `${FLAG_BASE}/flag_AFU.png`,
  CRF: `${FLAG_BASE}/flag_CRF.png`,
  GFI: `${FLAG_BASE}/flag_GFI.png`,
};

/**
 * Map display / layer name (normalized) -> squadmaps-v2 minimap thumbnail file.
 * Used when layer-specific wiki/legacy files are missing (e.g. Black Coast, Sanxian).
 */
const MAP_MINIMAP_FILE: Record<string, string> = {
  albasrah: "T_AlBasrah_Minimap.webp",
  anvil: "Anvil_Minimap.webp",
  blackcoast: "Black_Coast_Minimap.webp",
  chora: "Chora_Minimap.webp",
  fallujah: "T_Fallujah_Minimap.webp",
  foolsroad: "Fools_Road_Minimap.webp",
  goosebay: "GooseBay_Minimap.webp",
  gorodok: "gorodok_minimap.webp",
  harju: "Harju_Minimap.webp",
  kamdesh: "Kamdesh_Minimap.webp",
  kohat: "kohat_minimap.webp",
  kokan: "T_Kokan_Minimap.webp",
  lashkar: "T_Lashkar_Minimap.webp",
  lashkarvalley: "T_Lashkar_Minimap.webp",
  logar: "Logar_Valley_Minimap.webp",
  logarvalley: "Logar_Valley_Minimap.webp",
  manicouagan: "T_Manicouagan_Minimap.webp",
  manic: "T_Manicouagan_Minimap.webp",
  mestia: "T_Mestia_Minimap.webp",
  mutaha: "Mutaha_Minimap.webp",
  narva: "Narva_Minimap.webp",
  pacificprovinggrounds: "T_PacificProvingGrounds_V1_Minimap.webp",
  sanxian: "T_Sanxian_Minimap_Large.webp",
  sanxianislands: "T_Sanxian_Minimap_Large.webp",
  skorpo: "Skorpo_Minimap_RAAS_v3.webp",
  sumari: "Sumari_Minimap.webp",
  tallil: "Tallil_Outskirts_Minimap.webp",
  talliloutskirts: "Tallil_Outskirts_Minimap.webp",
  yehorivka: "Yehorivka_Minimap.webp",
};

/** Full faction display names -> short codes used in compact UI. */
const FACTION_SHORT: Record<string, string> = {
  "united states army": "USA",
  "united states marine corps": "USMC",
  "us marine corps": "USMC",
  "british army": "BAF",
  "british armed forces": "BAF",
  "canadian armed forces": "CAF",
  "russian ground forces": "RUS",
  "russian airborne forces": "VDV",
  "russian airborne": "VDV",
  "middle eastern alliance": "MEA",
  "middle eastern insurgents": "INS",
  "insurgent forces": "INS",
  "insurgents": "INS",
  "irregular militia forces": "MIL",
  "irregular militia": "MIL",
  "people's liberation army": "PLA",
  "people's liberation army navy marine corps": "PLANMC",
  "pla navy marine corps": "PLANMC",
  "pla naval marine corps": "PLANMC",
  "pla amphibious ground force": "PLAAGF",
  "people's liberation army amphibious ground force": "PLAAGF",
  "australian defence force": "ADF",
  "turkish land forces": "TLF",
  "armed forces of ukraine": "AFU",
  "ground forces of iran": "GFI",
  "western private military contractors": "WPMC",
  "canadian resistance forces": "CRF",
};

/**
 * Normalize a faction name or code to a short code when known
 * (e.g. "Armed Forces of Ukraine" -> "AFU", "USA" stays "USA").
 * Used so compact match headers stay consistent for old stored JSON.
 */
export function shortenFactionName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  if (trimmed.length <= 6 && !trimmed.includes(" ")) return trimmed;
  return FACTION_SHORT[trimmed.toLowerCase()] ?? trimmed;
}

export function getFactionFlagUrl(code: string): string | null {
  if (!code) return null;
  // Accept full names (historical match JSON) as well as short codes
  const short = shortenFactionName(code);
  return FACTION_FLAG_URL[short.toUpperCase()] ?? FACTION_FLAG_URL[code.toUpperCase()] ?? null;
}

/** Export for live-server meta tables that also need display names. */
export function getFactionFlagUrls(): Record<string, string> {
  return { ...FACTION_FLAG_URL };
}

const LAYER_MODE_RE =
  "aas|raas|invasion|skirmish|seed|tc|ta|insurgency|destruction|training";

/** Tags sometimes appended after layer version (custom / lighting / etc.). */
const TRAILING_LAYER_TAG_RE = /_(?:cl|night|day)(?=_|$)/gi;

function stripLayerPrefix(layer: string): string {
  return layer.replace(/^SEC_?\d*_?/i, "").trim();
}

/**
 * Normalize layer tokens for image lookup:
 * - strip SEC_ prefixes
 * - strip trailing tags like _CL / _Night that break version detection
 *   e.g. Gorodok_Invasion_v4_CL -> Gorodok_Invasion_v4
 */
function normalizeLayerName(layer: string): string {
  let s = stripLayerPrefix(layer);
  // Peel trailing tags repeatedly (e.g. _CL_Night)
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(TRAILING_LAYER_TAG_RE, "");
  }
  return s.replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
}

function layerNameCandidates(layer: string): string[] {
  const stripped = normalizeLayerName(layer);
  const parts = stripped.split(/[\s_]+/).filter(Boolean);
  // Ordered: prefer collapsed CamelCase (GooseBay_RAAS_v2) then wiki-style Albasrah, then underscored.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    ordered.push(name);
  };

  // Find version token (v4) — may not be last if tags remain
  let versionIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^v\d+$/i.test(parts[i])) {
      versionIdx = i;
      break;
    }
  }

  const modeRe = new RegExp(`^(?:${LAYER_MODE_RE})$`, "i");

  if (versionIdx >= 2 && modeRe.test(parts[versionIdx - 1])) {
    const versionPart = parts[versionIdx];
    const modePart = parts[versionIdx - 1];
    const mapWords = parts.slice(0, versionIdx - 1);
    const versionNum = parseInt(versionPart.slice(1), 10) || 1;

    const addModeVersion = (ver: string) => {
      // GooseBay_RAAS_v2
      add(`${mapWords.join("")}_${modePart}_${ver}`);
      // Title-case collapse: AlBasrah_RAAS_v1
      const pascal = mapWords
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("");
      add(`${pascal}_${modePart}_${ver}`);
      // Wiki Albasrah (first word capitalized, rest lower): Albasrah_RAAS_v1
      if (mapWords.length >= 2) {
        const alt =
          mapWords[0].charAt(0).toUpperCase() +
          mapWords[0].slice(1).toLowerCase() +
          mapWords.slice(1).map((w) => w.toLowerCase()).join("");
        add(`${alt}_${modePart}_${ver}`);
      }
      // Goose_Bay_RAAS_v2
      add(`${mapWords.join("_")}_${modePart}_${ver}`);
    };

    // Exact version first, then older variants (wiki often only has v1–v2 art)
    addModeVersion(versionPart);
    for (let v = versionNum - 1; v >= 1; v--) {
      addModeVersion(`v${v}`);
    }
  } else if (parts.length >= 2) {
    const modePart = parts[parts.length - 1];
    const mapWords = parts.slice(0, -1);
    add(`${mapWords.join("")}_${modePart}`);
    add(`${mapWords.join("_")}_${modePart}`);
  } else if (parts.length === 1) {
    add(parts[0]);
  }

  // Unpadded version only (wiki uses v1/v2, not v01)
  return ordered;
}

function extractMapKey(layer: string): string {
  let stripped = normalizeLayerName(layer).toLowerCase();
  // Drop trailing mode + version (+ any leftover junk after version)
  stripped = stripped
    .replace(
      new RegExp(
        `\\s+(?:${LAYER_MODE_RE})\\s+v?\\d+(?:[\\s_].*)?$`,
        "i"
      ),
      ""
    )
    .replace(
      new RegExp(`_(?:${LAYER_MODE_RE})_v?\\d+(?:_.*)?$`, "i"),
      ""
    )
    .replace(new RegExp(`_(?:${LAYER_MODE_RE})$`, "i"), "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (MAP_MINIMAP_FILE[stripped]) return stripped;

  // Prefix match: "gorodokinvasionv4cl" / "blackcoast..." -> known map key
  const keys = Object.keys(MAP_MINIMAP_FILE).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (stripped.startsWith(key)) return key;
  }
  return stripped;
}

/**
 * Ordered list of thumbnail URLs to try (MapImg walks on error).
 * 1) Wiki layer-specific JPGs (best art when present)
 * 2) squadmaps-v2 map-level minimaps (always included as map fallback)
 * 3) Legacy mahtoid layer thumbs (last resort)
 */
export function getMapThumbnailUrls(layer: string): string[] {
  if (!layer) return [];

  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  const names = layerNameCandidates(layer);
  const mapKey = extractMapKey(layer);
  const lower = normalizeLayerName(layer).toLowerCase();
  const minimap = MAP_MINIMAP_FILE[mapKey];

  // Maps missing from the wiki pipeline (post-2024) — prefer v2 minimaps first.
  const wikiSparse = new Set([
    "blackcoast",
    "harju",
    "sanxian",
    "sanxianislands",
    "pacificprovinggrounds",
  ]);

  const pushV2 = () => {
    if (mapKey === "albasrah") {
      if (lower.includes("seed")) push(`${V2_THUMB_BASE}/T_AlBasrah_Minimap_Seed_v1.webp`);
      if (lower.includes("skirmish")) push(`${V2_THUMB_BASE}/T_AlBasrah_Minimap_Skirmish_v1.webp`);
    }
    if (mapKey === "goosebay" && lower.includes("seed")) {
      push(`${V2_THUMB_BASE}/GooseBay_Minimap_Seed_v1.webp`);
    }
    if (mapKey === "blackcoast" && lower.includes("seed")) {
      push(`${V2_THUMB_BASE}/T_BlackCoast_Seed_v1.webp`);
    }
    if (mapKey === "mutaha") {
      if (lower.includes("seed")) push(`${V2_THUMB_BASE}/Mutaha_Minimap_Seed_v1.webp`);
      if (lower.includes("skirmish")) push(`${V2_THUMB_BASE}/Mutaha_Minimap_Skirmish_v1.webp`);
    }
    // Always try the map-level minimap so missing layer art (e.g. _v4_CL) still shows the map
    if (minimap) push(`${V2_THUMB_BASE}/${minimap}`);
  };

  if (wikiSparse.has(mapKey)) {
    pushV2();
  }

  // Layer-specific wiki variants (exact + older versions); cap to avoid huge 404 chains
  for (const name of names.slice(0, 6)) {
    push(`${WIKI_LAYER_BASE}/${name}.jpg`);
  }

  if (!wikiSparse.has(mapKey)) {
    pushV2();
  }

  for (const name of names.slice(0, 6)) {
    push(`${LEGACY_THUMB_BASE}/${name}.jpg`);
  }

  // Final safety: if map key resolved but pushV2 never ran (no mode-specific art), still add minimap
  if (minimap) push(`${V2_THUMB_BASE}/${minimap}`);

  return urls;
}
