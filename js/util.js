/* ============================================================
   Мелкие утилиты форматирования.
   ============================================================ */

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtWeekday(iso) {
  return WD[new Date(iso).getDay()];
}

// "через 2 дня", "завтра", "сегодня", "прошёл"
function relDays(iso) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0)  return diff === -1 ? "вчера" : `${-diff} дн. назад`;
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return `через ${diff} дн.`;
}

// ---- Педагогические метрики обратной связи (1–10) ----
const FEEDBACK_METRICS = [
  { key: "understanding", label: "Понимание материала" },
  { key: "independence",  label: "Самостоятельность" },
  { key: "homework",      label: "Домашние задания" },
  { key: "engagement",    label: "Вовлечённость" },
];

function scoreColor(v) {
  return v >= 8 ? "var(--ok)" : v >= 5 ? "var(--warn)" : "var(--danger)";
}

// Отрисовка набора оценок (для просмотра в админке и у родителя)
function renderScores(scores) {
  if (!scores) return "";
  const items = FEEDBACK_METRICS.map(m => {
    const v = scores[m.key];
    if (v == null) return "";
    return `
      <div class="score">
        <div class="score-head"><span>${m.label}</span><span class="mono" style="color:${scoreColor(v)}">${v}/10</span></div>
        <div class="progress"><span style="width:${v * 10}%; background:${scoreColor(v)};"></span></div>
      </div>`;
  }).join("");
  return `<div class="scores">${items}</div>`;
}

// Список обратной связи: последняя запись раскрыта, остальные — под спойлером.
// items — массив УЖЕ отрисованного HTML (от новых к старым).
function renderFeedbackList(items, emptyMsg) {
  if (!items.length) return `<p class="muted">${emptyMsg}</p>`;
  const [latest, ...rest] = items;
  if (!rest.length) return latest;
  return `
    ${latest}
    <details class="fb-history">
      <summary>Предыдущие записи (${rest.length})</summary>
      <div class="fb-history-body">${rest.join("")}</div>
    </details>`;
}

// для <input type="datetime-local">
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
