const STATIONS_URL = "./data/stations.json";
const DATA_SCRIPT_VERSION = "20260811-16";

const FALLBACK_STATIONS = [
  { region: "北海道", code: "WN", name: "稚内" },
  { region: "北海道", code: "B3", name: "小樽" },
  { region: "北海道", code: "KR", name: "釧路" },
  { region: "北海道", code: "HK", name: "函館" },
  { region: "東北", code: "AO", name: "青森" },
  { region: "東北", code: "MY", name: "宮古" },
  { region: "東北", code: "AY", name: "鮎川" },
  { region: "東北", code: "ON", name: "小名浜" },
  { region: "関東", code: "TK", name: "東京", default: true },
  { region: "関東", code: "QS", name: "横浜" },
  { region: "関東", code: "CS", name: "銚子漁港" },
  { region: "関東", code: "TT", name: "館山" },
  { region: "中部", code: "SM", name: "清水港" },
  { region: "中部", code: "OM", name: "御前崎" },
  { region: "中部", code: "NG", name: "名古屋" },
  { region: "中部", code: "TB", name: "鳥羽" },
  { region: "北陸・日本海", code: "S6", name: "新潟西港" },
  { region: "北陸・日本海", code: "TY", name: "富山" },
  { region: "北陸・日本海", code: "T1", name: "金沢" },
  { region: "北陸・日本海", code: "MZ", name: "舞鶴" },
  { region: "北陸・日本海", code: "SK", name: "境" },
  { region: "西日本", code: "OS", name: "大阪" },
  { region: "西日本", code: "KB", name: "神戸" },
  { region: "西日本", code: "TA", name: "高松" },
  { region: "西日本", code: "KC", name: "高知" },
  { region: "九州", code: "QF", name: "博多" },
  { region: "九州", code: "NS", name: "長崎" },
  { region: "九州", code: "KG", name: "鹿児島" },
  { region: "九州", code: "AB", name: "油津" },
  { region: "沖縄", code: "NH", name: "那覇" },
  { region: "沖縄", code: "DJ", name: "南大東" },
  { region: "沖縄", code: "IS", name: "石垣" },
  { region: "沖縄", code: "YJ", name: "与那国" }
];

const scriptLoads = new Map();

async function loadStations() {
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
