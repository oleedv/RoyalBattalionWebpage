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

export function getFactionFlagUrl(code: string): string | null {
  if (!code) return null;
  return FACTION_FLAG_URL[code.toUpperCase()] ?? null;
}

/** Export for live-server meta tables that also need display names. */
export function getFactionFlagUrls(): Record<string, string> {
  return { ...FACTION_FLAG_URL };
}

function stripLayerPrefix(layer: string): string {
  return layer.replace(/^SEC_?\d*_?/i, "").trim();
}

function layerNameCandidates(layer: string): string[] {
  const stripped = stripLayerPrefix(layer);
  const parts = stripped.split(/[\s_]+/).filter(Boolean);
  // Ordered: prefer collapsed CamelCase (GooseBay_RAAS_v2) then wiki-style Albasrah, then underscored.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    ordered.push(name);
  };

  const hasVersion = parts.length >= 3 && /^v\d+$/i.test(parts[parts.length - 1]);
  if (hasVersion) {
    const versionPart = parts[parts.length - 1];
    const modePart = parts[parts.length - 2];
    const mapWords = parts.slice(0, -2);
    // GooseBay_RAAS_v2
    add(`${mapWords.join("")}_${modePart}_${versionPart}`);
    // Title-case collapse: AlBasrah_RAAS_v1
    const pascal = mapWords
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
    add(`${pascal}_${modePart}_${versionPart}`);
    // Wiki Albasrah (first word capitalized, rest lower): Albasrah_RAAS_v1
    if (mapWords.length >= 2) {
      const alt =
        mapWords[0].charAt(0).toUpperCase() +
        mapWords[0].slice(1).toLowerCase() +
        mapWords.slice(1).map((w) => w.toLowerCase()).join("");
      add(`${alt}_${modePart}_${versionPart}`);
    }
    // Goose_Bay_RAAS_v2
    add(`${mapWords.join("_")}_${modePart}_${versionPart}`);
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
  const stripped = stripLayerPrefix(layer).toLowerCase();
  // Drop trailing mode + version tokens
  const cleaned = stripped
    .replace(
      /\s+(aas|raas|invasion|skirmish|seed|tc|ta|insurgency|destruction|training)\s+v?\d*$/i,
      ""
    )
    .replace(
      /_(aas|raas|invasion|skirmish|seed|tc|ta|insurgency|destruction|training)_v?\d*$/i,
      ""
    )
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
  return cleaned;
}

/**
 * Ordered list of thumbnail URLs to try (MapImg walks on error).
 * 1) Wiki layer-specific JPGs (best art when present)
 * 2) squadmaps-v2 map-level minimaps (modern maps; actively updated)
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
  const lower = layer.toLowerCase();
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
    if (minimap) push(`${V2_THUMB_BASE}/${minimap}`);
  };

  if (wikiSparse.has(mapKey)) {
    pushV2();
  }

  // Prefer the first 3 wiki name variants only (avoids long 404 chains).
  for (const name of names.slice(0, 3)) {
    push(`${WIKI_LAYER_BASE}/${name}.jpg`);
  }

  if (!wikiSparse.has(mapKey)) {
    pushV2();
  }

  for (const name of names.slice(0, 3)) {
    push(`${LEGACY_THUMB_BASE}/${name}.jpg`);
  }

  return urls;
}
