import { test, expect } from "bun:test";
import { getMapThumbnailUrls, THUMBNAILS_BASE } from "@/lib/map-thumbnails";

test("resolves spaced A2S layer names to CamelCase repo names", () => {
  const urls = getMapThumbnailUrls("Goose Bay RAAS v2");
  expect(urls).toContain(`${THUMBNAILS_BASE}/GooseBay_RAAS_v2.jpg`);
});

test("strips SquadJS SEC prefixes", () => {
  const urls = getMapThumbnailUrls("SEC_26_Narva RAAS v1");
  expect(urls).toContain(`${THUMBNAILS_BASE}/Narva_RAAS_v1.jpg`);
});

test("adds zero-padded version fallbacks", () => {
  const urls = getMapThumbnailUrls("Yehorivka RAAS v2");
  expect(urls).toContain(`${THUMBNAILS_BASE}/Yehorivka_RAAS_v02.jpg`);
});

test("handles mode-only layers without version", () => {
  const urls = getMapThumbnailUrls("Fallujah Skirmish");
  expect(urls).toContain(`${THUMBNAILS_BASE}/Fallujah_Skirmish.jpg`);
});
