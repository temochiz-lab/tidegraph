(() => {
const { getDayRecord, loadStations, loadYearData, pickStation } = window.TideGraphData;

const elements = {
  stationSelect: document.querySelector("#stationSelect"),
  dateInput: document.querySelector("#dateInput"),
  tideInfo: document.querySelector("#tideInfo"),
  nextTide: document.querySelector("#nextTide"),
  graphRoot: document.querySelector("#graphRoot"),
  rangeLabel: document.querySelector("#rangeLabel"),
  pointReadout: document.querySelector("#pointReadout"),
  todayButton: document.querySelector("#todayButton"),
  message: document.querySelector("#message"),
  dataUpdated: document.querySelector("#dataUpdated")
};

const state = {
  stations: [],
  station: null,
  dateKey: getJstDateKey(),
  yearData: null
};

let currentTimeTimer = null;
let refreshSequence = 0;

init().catch((error) => showFatal(error));

async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      showMessage("Service Workerを登録できませんでした。HTTPサーバー経由で開くとオフライン機能が使えます。");
    });
  }

  const params = new URLSearchParams(window.location.search);
  const requestedStation = params.get("stn") || localStorage.getItem("lastStation");
  const requestedDate = params.get("date");
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "")) {
    state.dateKey = requestedDate;
  }

  state.stations = await loadStations();
  state.station = pickStation(state.stations, requestedStation);
  buildStationOptions();
  bindEvents();
  await refresh();
}

function bindEvents() {
  elements.stationSelect.addEventListener("change", async () => {
    state.station = pickStation(state.stations, elements.stationSelect.value);
    localStorage.setItem("lastStation", state.station.code);
    updateUrl();
    state.yearData = null;
    await refresh();
  });

  elements.dateInput.addEventListener("change", async () => {
    if (!elements.dateInput.value || elements.dateInput.value === state.dateKey) {
      return;
    }
    state.dateKey = elements.dateInput.value;
    updateUrl();
    if (hasLoadedYearDataFor(state.dateKey)) {
      renderCurrentDay();
      return;
    }
    await refresh();
  });

  elements.todayButton.addEventListener("click", () => setDate(getJstDateKey()));
}

async function refresh() {
  const sequence = ++refreshSequence;
  clearMessage();
  elements.stationSelect.value = state.station.code;
  elements.dateInput.value = state.dateKey;

  try {
    const year = state.dateKey.slice(0, 4);
    if (!hasLoadedYearDataFor(state.dateKey)) {
      state.yearData = await loadYearData(year, state.station.code);
    }
    if (sequence === refreshSequence) {
      renderCurrentDay();
    }
  } catch (error) {
    elements.graphRoot.replaceChildren();
    elements.nextTide.textContent = "表示できる潮汐データがありません";
    updateCurrentTimeTimer();
    showMessage(!navigator.onLine ? "初回読み込みには通信が必要です" : error.message);
  }
}

function hasLoadedYearDataFor(dateKey) {
  return (
    state.yearData &&
    state.yearData.year === Number(dateKey.slice(0, 4)) &&
    state.yearData.station?.code === state.station.code
  );
}

function renderCurrentDay() {
  clearMessage();
  elements.stationSelect.value = state.station.code;
  elements.dateInput.value = state.dateKey;
  const day = getDayRecord(state.yearData, state.dateKey);
  const graphRange = renderTideGraph(elements.graphRoot, day, {
    dateKey: state.dateKey,
    todayKey: getJstDateKey(),
    nowParts: getJstNowParts(),
    chanceWindows: buildFishingChanceWindows(day),
    onPointSelect: (hour, level) => {
      elements.pointReadout.textContent = `${String(hour).padStart(2, "0")}:00 ${level}cm`;
    }
  });
  elements.rangeLabel.textContent = `${Math.round(graphRange.minLevel)} - ${Math.round(graphRange.maxLevel)} cm`;
  elements.tideInfo.textContent = buildTideInfoText(state.dateKey);
  elements.nextTide.innerHTML = buildNextTideHtml(day, state.dateKey);
  elements.dataUpdated.textContent = `最終データ更新日: ${state.yearData.generatedAt || "不明"}`;
  updateCurrentTimeTimer();
}

function buildStationOptions() {
  const groups = new Map();
  for (const station of state.stations) {
    const region = station.region || "その他";
    if (!groups.has(region)) {
      groups.set(region, []);
    }
    groups.get(region).push(station);
  }

  elements.stationSelect.replaceChildren(
    ...Array.from(groups, ([region, stations]) => {
      const group = document.createElement("optgroup");
      group.label = region;
      for (const station of stations) {
        const option = document.createElement("option");
        option.value = station.code;
        option.textContent = `${station.name} (${station.code})`;
        group.append(option);
      }
      return group;
    })
  );
}

function buildNextTideHtml(day, dateKey) {
  const nowKey = getJstDateKey();
  const nowParts = getJstNowParts();
  const nowHour = nowParts.hour + nowParts.minute / 60;
  const events = [
    ...(day.highs || []).map((item) => ({ ...item, kind: "満潮" })),
    ...(day.lows || []).map((item) => ({ ...item, kind: "干潮" }))
  ].sort((a, b) => timeToFloat(a.time) - timeToFloat(b.time));
  const next = dateKey === nowKey ? events.find((item) => timeToFloat(item.time) >= nowHour) : events[0];
  if (!next) {
    return "この日の残りの満潮・干潮はありません";
  }
  const all = events.map((item) => `${item.kind} ${item.time} ${item.level}cm`).join(" / ");
  return `${next.kind} ${next.time} ${next.level}cm<small>この日の満干潮: ${all}</small>`;
}

function buildFishingChanceWindows(day) {
  const events = [
    ...(day.highs || []).map((item) => ({ ...item, kind: "high" })),
    ...(day.lows || []).map((item) => ({ ...item, kind: "low" }))
  ].sort((a, b) => timeToFloat(a.time) - timeToFloat(b.time));
  const windows = [];
  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index];
    const next = events[index + 1];
    const startHour = timeToFloat(current.time);
    const endHour = timeToFloat(next.time);
    const span = endHour - startHour;
    if (span <= 0) {
      continue;
    }
    if (current.kind === "low" && next.kind === "high") {
      windows.push(makeChanceWindow(startHour + span * 0.3, "上げ三分"));
    }
    if (current.kind === "high" && next.kind === "low") {
      windows.push(makeChanceWindow(startHour + span * 0.7, "下げ七分"));
    }
  }
  return windows;
}

function makeChanceWindow(centerHour, label) {
  const halfWidthHours = 0.45;
  return {
    startHour: Math.max(0, centerHour - halfWidthHours),
    endHour: Math.min(24, centerHour + halfWidthHours),
    label
  };
}

function buildTideInfoText(dateKey) {
  const lunarAge = getApproximateLunarAge(dateKey);
  return `潮回り: ${getTideCycleName(lunarAge)} / 月齢 約${lunarAge.toFixed(1)}`;
}

function getApproximateLunarAge(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = Date.UTC(year, month - 1, day, 12, 0, 0);
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodicMonthDays = 29.530588853;
  const days = (date - knownNewMoon) / 86_400_000;
  return ((days % synodicMonthDays) + synodicMonthDays) % synodicMonthDays;
}

function getTideCycleName(lunarAge) {
  const tideAge = Math.floor(lunarAge + 0.5) % 30;
  if ([28, 29, 0, 1, 2, 14, 15, 16, 17].includes(tideAge)) return "大潮";
  if ([7, 8, 9, 22, 23, 24].includes(tideAge)) return "小潮";
  if ([10, 25].includes(tideAge)) return "長潮";
  if ([11, 26].includes(tideAge)) return "若潮";
  return "中潮";
}

async function setDate(dateKey) {
  if (dateKey === state.dateKey) {
    return;
  }
  state.dateKey = dateKey;
  updateUrl();
  if (hasLoadedYearDataFor(state.dateKey)) {
    renderCurrentDay();
    return;
  }
  await refresh();
}

function updateCurrentTimeTimer() {
  if (currentTimeTimer) {
    clearInterval(currentTimeTimer);
    currentTimeTimer = null;
  }
  if (state.dateKey === getJstDateKey()) {
    currentTimeTimer = setInterval(() => {
      refresh();
    }, 60_000);
  }
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set("stn", state.station.code);
  if (state.dateKey !== getJstDateKey()) {
    params.set("date", state.dateKey);
  }
  const basePath = window.location.protocol === "file:" ? "index.html" : "./";
  history.replaceState(null, "", `${basePath}?${params.toString()}`);
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.hidden = false;
}

function clearMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
}

function showFatal(error) {
  showMessage(error.message || "アプリを起動できませんでした");
}

function getJstNowParts() {
  const formatter = new Intl.DateTimeFormat("ja-JP-u-ca-gregory", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getJstDateKey() {
  const parts = getJstNowParts();
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function timeToFloat(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour + minute / 60;
}
})();
