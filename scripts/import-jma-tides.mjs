import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_VERSION = "0.1.0";
const BASE_URL = "https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt";

export function parseJmaTideText(text, { year, station, name }) {
  const normalizedStation = validateStation(station);
  const normalizedYear = validateYear(year);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const days = {};

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.length < 136) {
      throw new Error(`Line ${lineNumber}: fixed-width row must be at least 136 columns`);
    }

    const hourly = [];
    for (let cursor = 0; cursor < 72; cursor += 3) {
      hourly.push(parseFixedInteger(line.slice(cursor, cursor + 3), `Line ${lineNumber}: hourly`));
    }

    const dateToken = line.slice(72, 78);
    const dateKey = normalizeDate(normalizedYear, dateToken, lineNumber);
    const rowStation = line.slice(78, 80).trim().toUpperCase();
    if (rowStation !== normalizedStation) {
      throw new Error(`Line ${lineNumber}: station ${rowStation} does not match ${normalizedStation}`);
    }
    if (days[dateKey]) {
      throw new Error(`Line ${lineNumber}: duplicated date ${dateKey}`);
    }

    days[dateKey] = {
      hourly,
      highs: parseTideEvents(line.slice(80, 108), lineNumber, "high"),
      lows: parseTideEvents(line.slice(108, 136), lineNumber, "low")
    };
  }

  return {
    station: {
      code: normalizedStation,
      name
    },
    year: normalizedYear,
    unit: "cm",
    source: "JMA tide table",
    sourceUrl: buildSourceUrl(normalizedYear, normalizedStation),
    generatedAt: new Date().toISOString(),
    scriptVersion: SCRIPT_VERSION,
    days
  };
}

export function buildSourceUrl(year, station) {
  return `${BASE_URL}/${year}/${station}.txt`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const year = validateYear(options.year);
  const station = validateStation(options.station);
  const name = options.name?.trim();
  if (!name) {
    throw new Error("--name is required");
  }

  const sourceUrl = buildSourceUrl(year, station);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const payload = parseJmaTideText(text, { year, station, name });
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const outPath = join(root, "data", String(year), `${station}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Usage: node scripts/import-jma-tides.mjs --year 2026 --station TK --name 東京");
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function parseTideEvents(chunk, lineNumber, kind) {
  const events = [];
  for (let cursor = 0; cursor < 28; cursor += 7) {
    const timeChunk = chunk.slice(cursor, cursor + 4);
    const timeToken = timeChunk.trim();
    const levelToken = chunk.slice(cursor + 4, cursor + 7).trim();
    if (timeToken === "9999" && levelToken === "999") {
      continue;
    }
    const hourToken = timeChunk.slice(0, 2).trim();
    const minuteToken = timeChunk.slice(2, 4).trim();
    if (!/^\d{1,2}$/.test(hourToken) || !/^\d{1,2}$/.test(minuteToken)) {
      throw new Error(`Line ${lineNumber}: invalid ${kind} tide time ${timeChunk}`);
    }
    const hour = Number(hourToken);
    const minute = Number(minuteToken);
    if (hour > 23 || minute > 59) {
      throw new Error(`Line ${lineNumber}: invalid ${kind} tide time ${timeToken}`);
    }
    events.push({
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      level: parseFixedInteger(levelToken, `Line ${lineNumber}: ${kind} tide level`)
    });
  }
  return events;
}

function parseFixedInteger(value, label) {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${label}: invalid integer ${JSON.stringify(value)}`);
  }
  return Number(trimmed);
}

function normalizeDate(year, token, lineNumber) {
  const yearToken = token.slice(0, 2).trim();
  const monthToken = token.slice(2, 4).trim();
  const dayToken = token.slice(4, 6).trim();
  if (!/^\d{2}$/.test(yearToken) || !/^\d{1,2}$/.test(monthToken) || !/^\d{1,2}$/.test(dayToken)) {
    throw new Error(`Line ${lineNumber}: invalid date token ${token}`);
  }
  const yy = Number(yearToken);
  const expectedYY = year % 100;
  if (yy !== expectedYY) {
    throw new Error(`Line ${lineNumber}: date year ${yy} does not match import year ${expectedYY}`);
  }
  const month = Number(monthToken);
  const day = Number(dayToken);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error(`Line ${lineNumber}: invalid calendar date ${token}`);
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validateYear(year) {
  const value = Number(year);
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error("--year must be a four-digit year from 2000 to 2100");
  }
  return value;
}

function validateStation(station) {
  const normalized = station?.trim().toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(normalized || "")) {
    throw new Error("--station must be a two-character JMA station code");
  }
  return normalized;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
