const SVG_NS = "http://www.w3.org/2000/svg";

function renderTideGraph(root, day, options) {
  const { dateKey, todayKey, nowParts, chanceWindows = [], onPointSelect } = options;
  const width = 720;
  const height = 500;
  const margin = { top: 42, right: 24, bottom: 48, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const levels = [
    ...day.hourly,
    ...(day.highs || []).map((item) => item.level),
    ...(day.lows || []).map((item) => item.level)
  ];
  const rawMin = Math.min(...levels);
  const rawMax = Math.max(...levels);
  const span = Math.max(rawMax - rawMin, 10);
  const padding = Math.max(8, Math.ceil(span * 0.08));
  const minLevel = rawMin - padding;
  const maxLevel = rawMax + padding;

  const svg = element("svg", {
    viewBox: `0 0 ${width} ${height}`,
    "aria-labelledby": "graphTitle graphDesc"
  });
  svg.append(
    element("title", { id: "graphTitle" }, "24時間タイドグラフ"),
    element("desc", { id: "graphDesc" }, `${dateKey}の毎時潮位、満潮、干潮、現在時刻線`)
  );

  drawChanceWindows(svg, chanceWindows, { margin, plotWidth, plotHeight });
  drawGrid(svg, { width, height, margin, plotWidth, plotHeight, minLevel, maxLevel });

  const points = day.hourly.map((level, hour) => ({
    hour,
    level,
    x: xForHour(hour, margin.left, plotWidth),
    y: yForLevel(level, margin.top, plotHeight, minLevel, maxLevel)
  }));

  svg.append(element("polyline", {
    class: "tide-line",
    points: points.map((point) => `${point.x},${point.y}`).join(" ")
  }));

  for (const point of points) {
    const circle = element("circle", {
      class: "tide-point",
      cx: point.x,
      cy: point.y,
      r: 4.4,
      tabindex: "0",
      role: "button",
      "aria-label": `${String(point.hour).padStart(2, "0")}:00 ${point.level}cm`
    });
    circle.addEventListener("click", () => onPointSelect?.(point.hour, point.level));
    circle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPointSelect?.(point.hour, point.level);
      }
    });
    svg.append(circle);
  }

  drawMarkers(svg, day.highs || [], "満潮", "marker-high", margin, plotWidth, plotHeight, minLevel, maxLevel);
  drawMarkers(svg, day.lows || [], "干潮", "marker-low", margin, plotWidth, plotHeight, minLevel, maxLevel);

  if (dateKey === todayKey && nowParts) {
    const hourFloat = nowParts.hour + nowParts.minute / 60 + nowParts.second / 3600;
    const x = margin.left + (hourFloat / 24) * plotWidth;
    drawNowMarker(svg, x, { width, margin, plotHeight });
  }

  root.replaceChildren(svg);
  return { minLevel, maxLevel };
}

function drawNowMarker(svg, x, geometry) {
  const { width, margin, plotHeight } = geometry;
  const bandWidth = 18;
  const bandX = Math.max(margin.left, Math.min(width - margin.right - bandWidth, x - bandWidth / 2));
  const labelWidth = 68;
  const labelHeight = 32;
  const labelX = Math.max(margin.left, Math.min(width - margin.right - labelWidth, x - labelWidth / 2));
  const labelY = margin.top - 40;

  svg.append(element("rect", {
    class: "now-band",
    x: bandX,
    y: margin.top,
    width: bandWidth,
    height: plotHeight,
    rx: 9
  }));
  svg.append(element("line", {
    class: "now-line",
    x1: x,
    y1: margin.top,
    x2: x,
    y2: margin.top + plotHeight
  }));
  svg.append(element("rect", {
    class: "now-label-bg",
    x: labelX,
    y: labelY,
    width: labelWidth,
    height: labelHeight,
    rx: 11
  }));
  svg.append(element("text", {
    class: "now-label",
    x: labelX + labelWidth / 2,
    y: labelY + 22,
    "text-anchor": "middle"
  }, "現在"));
}

function drawChanceWindows(svg, windows, geometry) {
  const { margin, plotWidth, plotHeight } = geometry;
  for (const windowItem of windows) {
    const startX = margin.left + (windowItem.startHour / 24) * plotWidth;
    const endX = margin.left + (windowItem.endHour / 24) * plotWidth;
    const width = Math.max(2, endX - startX);
    svg.append(element("rect", {
      class: "chance-band",
      x: startX,
      y: margin.top,
      width,
      height: plotHeight
    }));
    svg.append(element("text", {
      class: "chance-label",
      x: startX + width / 2,
      y: margin.top + 18,
      "text-anchor": "middle"
    }, windowItem.label));
  }
}

function drawGrid(svg, geometry) {
  const { width, height, margin, plotWidth, plotHeight, minLevel, maxLevel } = geometry;
  for (let hour = 0; hour <= 24; hour += 3) {
    const x = margin.left + (hour / 24) * plotWidth;
    svg.append(element("line", {
      class: "grid-line",
      x1: x,
      y1: margin.top,
      x2: x,
      y2: margin.top + plotHeight
    }));
    svg.append(element("text", {
      class: "axis-label",
      x,
      y: height - 16,
      "text-anchor": "middle"
    }, `${hour}`));
  }

  const ticks = makeLevelTicks(minLevel, maxLevel);
  for (const level of ticks) {
    const y = yForLevel(level, margin.top, plotHeight, minLevel, maxLevel);
    svg.append(element("line", {
      class: "grid-line",
      x1: margin.left,
      y1: y,
      x2: width - margin.right,
      y2: y
    }));
    svg.append(element("text", {
      class: "axis-label",
      x: margin.left - 8,
      y: y + 4,
      "text-anchor": "end"
    }, `${level}`));
  }
}

function drawMarkers(svg, items, label, className, margin, plotWidth, plotHeight, minLevel, maxLevel) {
  for (const item of items) {
    const hour = timeToHour(item.time);
    const x = margin.left + (hour / 24) * plotWidth;
    const y = yForLevel(item.level, margin.top, plotHeight, minLevel, maxLevel);
    svg.append(element("circle", { class: className, cx: x, cy: y, r: 7 }));
    svg.append(element("text", {
      class: "marker-label",
      x,
      y: y - 12,
      "text-anchor": "middle"
    }, `${label} ${item.time} ${item.level}cm`));
  }
}

function xForHour(hour, left, plotWidth) {
  return left + (hour / 23) * plotWidth;
}

function yForLevel(level, top, plotHeight, minLevel, maxLevel) {
  return top + ((maxLevel - level) / (maxLevel - minLevel)) * plotHeight;
}

function timeToHour(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour + minute / 60;
}

function makeLevelTicks(min, max) {
  const span = max - min;
  const step = span > 180 ? 50 : span > 80 ? 25 : 10;
  const first = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = first; value <= max; value += step) {
    ticks.push(value);
  }
  return ticks;
}

function element(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

window.renderTideGraph = renderTideGraph;
