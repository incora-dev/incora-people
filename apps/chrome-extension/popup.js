import {
  apiFetch,
  getAccessToken,
  signIn,
  signOut as revokeAndClearSession,
} from "./auth.js";

const title = document.querySelector("#title");
const details = document.querySelector("#details");
const sessionStatus = document.querySelector("#session-status");
const primary = document.querySelector("#primary");
const signOut = document.querySelector("#sign-out");
const message = document.querySelector("#message");
const todaySummary = document.querySelector("#today-summary");
const todayTotal = document.querySelector("#today-total");
let todayTicker = null;

function setBusy(isBusy, label) {
  primary.disabled = isBusy;
  if (label) primary.textContent = label;
}

function notify(text = "") {
  message.textContent = text;
}

function formatMinutes(value) {
  const minutes = Math.max(0, Number(value) || 0);
  const hours = Math.floor(minutes / 60);
  return `${hours} год ${String(minutes % 60).padStart(2, "0")} хв`;
}

function showTodayTotal(status) {
  if (todayTicker) clearInterval(todayTicker);
  const initialMinutes = Math.max(0, Number(status.workedMinutesToday) || 0);
  const startedAt = Date.now();
  const render = () => {
    const liveMinutes =
      status.active && !status.openBreak
        ? Math.floor((Date.now() - startedAt) / 60_000)
        : 0;
    todayTotal.textContent = formatMinutes(initialMinutes + liveMinutes);
  };
  render();
  todayTicker = setInterval(render, 15_000);
  todaySummary.hidden = false;
}

async function loadStatus() {
  notify();
  try {
    if (!(await getAccessToken())) return showSignedOut();
    const response = await apiFetch("/api/v1/time/status");
    const status = await response.json();
    if (!status.linked) {
      sessionStatus.textContent = "АКАУНТ ПІДКЛЮЧЕНО";
      title.textContent = "Потрібен профіль працівника";
      details.textContent =
        "Ваш Google-акаунт ще не прив’язано до профілю в INCORA People.";
      primary.hidden = true;
      signOut.hidden = false;
      todaySummary.hidden = true;
      return;
    }
    sessionStatus.textContent = "АКАУНТ ПІДКЛЮЧЕНО · РОБОЧИЙ ЧАС";
    title.textContent = status.active ? "Робочий час триває" : "Готові почати?";
    details.textContent = status.active
      ? `Початок: ${new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(new Date(status.entry.clockIn))}`
      : "Запустіть таймер, коли починаєте роботу.";
    primary.textContent = status.active
      ? "Зупинити таймер"
      : "Запустити таймер";
    primary.hidden = false;
    primary.dataset.active = String(status.active);
    primary.disabled = false;
    signOut.hidden = false;
    showTodayTotal(status);
  } catch (error) {
    if (error.message === "AUTH_REQUIRED") return showSignedOut();
    title.textContent = "Не вдалося оновити стан";
    details.textContent = "Перевірте підключення до INCORA People.";
    primary.hidden = true;
    todaySummary.hidden = true;
    notify(error.message || "Спробуйте ще раз.");
  }
}

function showSignedOut() {
  if (todayTicker) clearInterval(todayTicker);
  sessionStatus.textContent = "РОБОЧИЙ ЧАС";
  title.textContent = "Увійдіть в INCORA People";
  details.textContent =
    "Використайте свій Google-акаунт, щоб запускати та зупиняти робочий час.";
  primary.hidden = false;
  primary.textContent = "Увійти через Google";
  primary.dataset.active = "signin";
  primary.disabled = false;
  signOut.hidden = true;
  todaySummary.hidden = true;
}

primary.addEventListener("click", async () => {
  setBusy(true, "Зачекайте…");
  try {
    if (primary.dataset.active === "signin") await signIn();
    else {
      const path =
        primary.dataset.active === "true"
          ? "/api/v1/time/clock-out"
          : "/api/v1/time/clock-in";
      const response = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Не вдалося змінити таймер.",
        );
      chrome.runtime.sendMessage({ type: "refresh-badge" });
    }
    await loadStatus();
  } catch (error) {
    notify(error.message || "Не вдалося завершити дію.");
    setBusy(false);
  }
});

signOut.addEventListener("click", async () => {
  signOut.disabled = true;
  try {
    await revokeAndClearSession();
    chrome.runtime.sendMessage({ type: "refresh-badge" });
    showSignedOut();
  } catch (error) {
    notify(error.message || "Не вдалося завершити сесію.");
  } finally {
    signOut.disabled = false;
  }
});

void loadStatus();
