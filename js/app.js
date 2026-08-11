(() => {
const { getDayRecord, loadStations, loadYearData, pickStation } = window.TideGraphData;

const elements = {
  connectionStatus: document.querySelector("#connectionStatus"),
  loadingStatus: document.querySelector("#loadingStatus"),
  dateLoadingStatus: document.querySelector("#dateLoadingStatus"),
  stationSelect: document.querySelector("#stationSelect"),
  dateInput: document.querySelector("#dateInput"),
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
  updateConnectionStatus();
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      showMessage("Service Workerを登録できませんでした。HTTPサーバー経由で開いてください。");
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

  const handleDateInput = async () => {
    if (elements.dateInput.value) {
      if (elements.dateInput.value === state.dateKey) {
        return;
      }
      state.dateKey = elements.dateInput.value;
      updateUrl();
      if (hasLoadedYearDataFor(state.dateKey)) {
        renderCurrentDay();
        return;
      }
      await refresh();
    }
  };

  elements.dateInput.addEventListener("change", handleDateInput);

  elements.todayButton.addEventListener("click", () => setDate(getJstDateKey()));
}

async function refresh() {
  const sequence = ++refreshSequence;
  clearMessage();
  elements.stationSelect.value = state.station.code;
  elements.dateInput.value = state.dateKey;

  try {
    const year = state.dateKey.slice(0, 4);
    if (!state.yearData || state.yearData.year !== Number(year) || state.yearData.station?.code !== state.station.code) {
      setLoading(true);
      showDateSwitchingContent(state.dateKey);
      await waitForPaint();
      state.yearData = await loadYearData(year, state.station.code);
    }
    renderCurrentDay();
  } catch (error) {
    elements.graphRoot.replaceChildren();
    elements.nextTide.textContent = "表示できる潮汐データがありません";
    updateCurrentTimeTimer();
    showMessage(!navigator.onLine ? "初回読み込みには通信が必要です" : error.message);
  } finally {
    if (sequence === refreshSequence) {
      setLoading(false);
    }
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
    onPointSelect: (hour, level) => {
      elements.pointReadout.textContent = `${String(hour).padStart(2, "0")}:00 ${level}cm`;
    }
  });
  elements.rangeLabel.textContent = `${Math.round(graphRange.minLevel)} - ${Math.round(graphRange.maxLevel)} cm`;
  elements.nextTide.innerHTML = buildNextTideHtml(day, state.dateKey);
  elements.dataUpdated.textContent = `最終データ更新日: ${state.yearData.generatedAt || "不明"}`;
  updateCurrentTimeTimer();
}

function buildStationOptions() {
  elements.stationSelect.replaceChildren(
    ...state.stations.map((station) => {
      const option = document.createElement("option");
      option.value = station.code;
      option.textContent = `${station.name} (${station.code})`;
      return option;
    })
  );
}

function buildNextTideHtml(day, dateKey) {
  const nowKey = getJstDateKey();
  const nowHour = getJstNowParts().hour + getJstNowParts().minute / 60;
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

function updateConnectionStatus() {
  elements.connectionStatus.textContent = navigator.onLine ? "online" : "offline";
  elements.connectionStatus.classList.toggle("offline", !navigator.onLine);
}

function setLoading(isLoading) {
  elements.loadingStatus.hidden = !isLoading;
  elements.dateLoadingStatus.hidden = !isLoading;
  document.body.classList.toggle("is-loading", isLoading);
  elements.stationSelect.disabled = isLoading;
  elements.todayButton.disabled = isLoading;
  elements.todayButton.textContent = isLoading ? "読込中" : "今日";
}

function showDateSwitchingContent(dateKey, fallbackLabel = "日付を切り替え中...") {
  const label = dateKey ? `${dateKey} を読み込み中...` : fallbackLabel;
  elements.rangeLabel.textContent = "読み込み中";
  elements.pointReadout.textContent = "日付を切り替えています。";
  elements.nextTide.innerHTML = `
    <span class="inline-loading">
      <span class="mini-spinner" aria-hidden="true"></span>
      ${label}
    </span>
  `;
  const graphLoading = document.createElement("div");
  graphLoading.className = "graph-loading";
  graphLoading.innerHTML = `
    <span class="inline-loading">
      <span class="mini-spinner" aria-hidden="true"></span>
      ${label}
    </span>
  `;
  elements.graphRoot.replaceChildren(graphLoading);
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
  setLoading(false);
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
