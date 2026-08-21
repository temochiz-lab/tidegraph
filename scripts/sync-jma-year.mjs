import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJmaTideText, buildSourceUrl } from "./import-jma-tides.mjs";

const STATION_LIST_URL = "https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station";
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const REGION_BY_NUMBER = [
  { max: 31, region: "北海道" },
  { max: 48, region: "東北" },
  { max: 75, region: "関東" },
  { max: 104, region: "中部" },
  { max: 137, region: "西日本" },
  { max: 166, region: "九州" },
  { max: 184, region: "沖縄・奄美" },
  { max: 205, region: "有明・長崎" },
  { max: 239, region: "北陸・日本海" }
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const year = validateYear(options.year || "2026");
  const stations = await loadStationList(year);
  await writeStationsJson(stations);
  await writeStationsScript(stations);

  const failed = [];
  for (const station of stations) {
    try {
      const payload = await fetchStationData(year, station);
      await writeStationJson(year, station.code, payload);
      await writeStationScript(year, station.code, payload);
      console.log(`Wrote ${year}/${station.code} ${station.name}`);
    } catch (error) {
      failed.push({ ...station, error: error.message });
      console.error(`Failed ${station.number} ${station.code} ${station.name}: ${error.message}`);
    }
  }

  await writeSyncSummary(year, stations, failed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function loadStationList(year) {
  const response = await fetch(STATION_LIST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch station list: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const stations = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/g)].map((match) => stripTags(match[0]));
    if (cells.length < 3) {
      continue;
    }
    const number = Number(cells[0]);
    const code = cells[1]?.trim().toUpperCase();
    const name = cells[2]?.trim();
    if (!Number.isInteger(number) || !/^[A-Z0-9]{2}$/.test(code || "") || !name) {
      continue;
    }
    stations.push({
      region: regionForNumber(number),
      number,
      code,
      name,
      default: code === "TK" ? true : undefined
    });
  }

  if (stations.length === 0) {
    throw new Error("Station list parse returned no stations");
  }
  if (year === 2026 && stations.length !== 239) {
    throw new Error(`Expected 239 stations for 2026, got ${stations.length}`);
  }
  return stations;
}

async function fetchStationData(year, station) {
  const response = await fetch(buildSourceUrl(year, station.code));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return parseJmaTideText(text, { year, station: station.code, name: station.name });
}

async function writeStationsJson(stations) {
  const payload = {
    stations: stations.map((station) => ({
      region: station.region,
      code: station.code,
      name: station.name,
      ...(station.default ? { default: true } : {})
    }))
  };
  await writeFile(join(ROOT, "data", "stations.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeStationsScript(stations) {
  const payload = {
    stations: stations.map((station) => ({
      region: station.region,
      code: station.code,
      name: station.name,
      ...(station.default ? { default: true } : {})
    }))
  };
  const script = [
    "window.TIDEGRAPH_STATIONS = ",
    `${JSON.stringify(payload, null, 2)};`,
    ""
  ].join("");
  await writeFile(join(ROOT, "data", "stations.js"), script, "utf8");
}

async function writeStationJson(year, code, payload) {
  const outPath = join(ROOT, "data", String(year), `${code}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeStationScript(year, code, payload) {
  const outPath = join(ROOT, "data", String(year), `${code}.js`);
  const json = JSON.stringify(payload, null, 2);
  const script = [
    "window.TIDEGRAPH_PRELOADED_DATA = window.TIDEGRAPH_PRELOADED_DATA || {};",
    `window.TIDEGRAPH_PRELOADED_DATA['${year}/${code}'] = ${json};`,
    ""
  ].join("\n");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, script, "utf8");
}

async function writeSyncSummary(year, stations, failed) {
  const lines = [
    `# JMA tide data sync ${year}`,
    "",
    `- station list: ${STATION_LIST_URL}`,
    `- total stations: ${stations.length}`,
    `- failed stations: ${failed.length}`,
    ""
  ];
  if (failed.length > 0) {
    lines.push("## Failed stations", "");
    for (const item of failed) {
      lines.push(`- ${item.number} ${item.code} ${item.name}: ${item.error}`);
    }
    lines.push("");
  }
  await writeFile(join(ROOT, "data", String(year), "sync-summary.md"), lines.join("\n"), "utf8");
}

function regionForNumber(number) {
  return REGION_BY_NUMBER.find((item) => number <= item.max)?.region || "その他";
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Usage: node scripts/sync-jma-year.mjs --year 2026");
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function validateYear(year) {
  const value = Number(year);
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error("--year must be a four-digit year from 2000 to 2100");
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
