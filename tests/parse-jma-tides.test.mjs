import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJmaTideText } from "../scripts/import-jma-tides.mjs";

test("parses hourly values, negative levels, and omits 9999/999 tide events", () => {
  const text = makeRow({
    hourly: [-5, 0, 12, 24, 33, 41, 50, 61, 73, 82, 91, 100, 106, 112, 118, 119, 114, 103, 88, 71, 52, 31, 14, -2],
    dateToken: "26 1 1",
    station: "TK",
    highs: [
      [" 412", "169"],
      ["1415", "176"],
      ["9999", "999"],
      ["9999", "999"]
    ],
    lows: [
      [" 911", "123"],
      ["2135", "-02"],
      ["9999", "999"],
      ["9999", "999"]
    ]
  });

  const parsed = parseJmaTideText(text, { year: 2026, station: "TK", name: "東京" });
  const day = parsed.days["2026-01-01"];
  assert.equal(day.hourly.length, 24);
  assert.equal(day.hourly[0], -5);
  assert.equal(day.hourly[23], -2);
  assert.deepEqual(day.highs, [
    { time: "04:12", level: 169 },
    { time: "14:15", level: 176 }
  ]);
  assert.deepEqual(day.lows, [
    { time: "09:11", level: 123 },
    { time: "21:35", level: -2 }
  ]);
});

test("rejects station mismatches", () => {
  const text = makeRow({ station: "AB" });
  assert.throws(() => parseJmaTideText(text, { year: 2026, station: "TK", name: "東京" }), /does not match/);
});

test("rejects duplicated date keys", () => {
  const row = makeRow({ dateToken: "260101" });
  assert.throws(() => parseJmaTideText(`${row}\n${row}`, { year: 2026, station: "TK", name: "東京" }), /duplicated date/);
});

test("rejects short fixed-width rows", () => {
  assert.throws(() => parseJmaTideText("123", { year: 2026, station: "TK", name: "東京" }), /at least 136/);
});

function makeRow(overrides = {}) {
  const hourly = overrides.hourly || Array.from({ length: 24 }, (_, index) => index);
  const dateToken = overrides.dateToken || "260101";
  const station = overrides.station || "TK";
  const highs = overrides.highs || [
    ["0412", "169"],
    ["9999", "999"],
    ["9999", "999"],
    ["9999", "999"]
  ];
  const lows = overrides.lows || [
    ["0911", "123"],
    ["9999", "999"],
    ["9999", "999"],
    ["9999", "999"]
  ];
  return `${hourly.map(formatLevel).join("")}${dateToken}${station}${formatEvents(highs)}${formatEvents(lows)}`;
}

function formatEvents(events) {
  return events.map(([time, level]) => `${time}${formatLevel(Number(level))}`).join("");
}

function formatLevel(value) {
  const sign = value < 0 ? "-" : "";
  return value < 0 ? `${sign}${String(Math.abs(value)).padStart(2, "0")}` : String(value).padStart(3, "0");
}
