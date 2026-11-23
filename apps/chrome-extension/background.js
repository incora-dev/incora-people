import { apiFetch, getSession } from "./auth.js";

async function refreshBadge() {
  try {
    if (!(await getSession())) {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setTitle({ title: "INCORA People — Час" });
      return;
    }
    const response = await apiFetch("/api/v1/time/status");
    const status = await response.json();
    await chrome.action.setBadgeText({ text: status.active ? "●" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#f8c400" });
    await chrome.action.setTitle({
      title: status.active ? "INCORA People — таймер працює" : "INCORA People — таймер зупинено",
    });
  } catch {
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refreshIncoraTimer", { periodInMinutes: 1 });
  void refreshBadge();
});
chrome.runtime.onStartup.addListener(() => void refreshBadge());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshIncoraTimer") void refreshBadge();
});
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "refresh-badge") void refreshBadge();
});
