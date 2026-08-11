const STATIONS_URL = "./data/stations.json";

export async function loadStations() {
  const payload = await fetchJson(STATIONS_URL, "地点一覧を読み込めません");
  if (!payload || !Array.isArray(payload.stations) || payload.stations.length === 0) {
    throw new Error("データ形式エラー。再取得してください");
  }
  return payload.stations;
}

export function pickStation(stations, requestedCode) {
  const normalized = requestedCode?.trim().toUpperCase();
  return (
    stations.find((station) => station.code === normalized) ||
    stations.find((station) => station.default) ||
    stations[0]
  );
}

export async function loadYearData(year, stationCode) {
  const safeYear = String(year).replace(/[^0-9]/g, "");
  const safeStation = String(stationCode).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const url = `./data/${safeYear}/${safeStation}.json`;
  return fetchJson(url, "この地点のデータがありません");
}

export function getDayRecord(yearData, dateKey) {
  if (!yearData || !yearData.days || typeof yearData.days !== "object") {
    throw new Error("データ形式エラー。再取得してください");
  }
  const day = yearData.days[dateKey];
  if (!day) {
    throw new Error("この日のデータがありません");
  }
  if (!Array.isArray(day.hourly) || day.hourly.length !== 24) {
    throw new Error("データ形式エラー。再取得してください");
  }
  return day;
}

async function fetchJson(url, fallbackMessage) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("データ形式エラー。再取得してください");
  }
}
