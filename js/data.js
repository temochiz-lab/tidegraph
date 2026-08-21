const STATIONS_URL = "./data/stations.json";
const DATA_SCRIPT_VERSION = "20260822-1";

const FALLBACK_STATIONS = [
  { region: "関東", code: "TK", name: "東京", default: true }
];

const scriptLoads = new Map();

async function loadStations() {
  const preloaded = window.TIDEGRAPH_STATIONS?.stations;
  if (Array.isArray(preloaded) && preloaded.length > 0) {
    return preloaded;
  }

  if (window.location.protocol === "file:") {
    return FALLBACK_STATIONS;
  }

  try {
    const payload = await fetchJson(STATIONS_URL, "地点一覧を読み込めません");
    if (payload && Array.isArray(payload.stations) && payload.stations.length > 0) {
      return payload.stations;
    }
  } catch {
    // file:// や一部ブラウザで JSON fetch が止まる場合は内蔵リストを使う。
  }
  return FALLBACK_STATIONS;
}

function pickStation(stations, requestedCode) {
  const normalized = requestedCode?.trim().toUpperCase();
  return (
    stations.find((station) => station.code === normalized) ||
    stations.find((station) => station.default) ||
    stations[0]
  );
}

async function loadYearData(year, stationCode) {
  const safeYear = String(year).replace(/[^0-9]/g, "");
  const safeStation = String(stationCode).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const key = `${safeYear}/${safeStation}`;

  const loaded = getPreloadedData(key);
  if (loaded) {
    return loaded;
  }

  await loadDataScript(safeYear, safeStation);
  const scriptLoaded = getPreloadedData(key);
  if (scriptLoaded) {
    return scriptLoaded;
  }

  if (window.location.protocol !== "file:") {
    return fetchJson(`./data/${safeYear}/${safeStation}.json`, "この地点のデータがありません");
  }

  throw new Error("この地点のデータがありません");
}

function getPreloadedData(key) {
  return window.TIDEGRAPH_PRELOADED_DATA?.[key];
}

function loadDataScript(year, stationCode) {
  const key = `${year}/${stationCode}`;
  if (scriptLoads.has(key)) {
    return scriptLoads.get(key);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `./data/${year}/${stationCode}.js?v=${DATA_SCRIPT_VERSION}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("この地点のデータがありません"));
    document.head.append(script);
  });

  scriptLoads.set(key, promise);
  return promise;
}

function getDayRecord(yearData, dateKey) {
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

window.TideGraphData = {
  getDayRecord,
  loadStations,
  loadYearData,
  pickStation
};
