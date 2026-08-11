const STATIONS_URL = "./data/stations.json";

async function loadStations() {
  if (window.location.protocol === "file:") {
    return [{ code: "TK", name: "東京", default: true }];
  }
  try {
    const payload = await fetchJson(STATIONS_URL, "地点一覧を読み込めません");
    if (payload && Array.isArray(payload.stations) && payload.stations.length > 0) {
      return payload.stations;
    }
  } catch {
    // file:// in some browsers blocks JSON fetch. Fall back to bundled MVP station data.
  }
  return [{ code: "TK", name: "東京", default: true }];
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
  const preloaded = window.TIDEGRAPH_PRELOADED_DATA?.[`${safeYear}/${safeStation}`];
  if (preloaded) {
    return preloaded;
  }
  const url = `./data/${safeYear}/${safeStation}.json`;
  return fetchJson(url, "この地点のデータがありません");
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
