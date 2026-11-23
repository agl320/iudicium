// Toolbar button: toggle the panel. Known ATS pages already have the content
// script; anywhere else it is injected on click (activeTab), so the generic
// form scanner only ever runs where you asked for it.

async function toggle(tabId: number) {
  await chrome.tabs.sendMessage(tabId, { type: "toggle" });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  try {
    await toggle(tab.id);
  } catch {
    // No content script yet: inject it, then toggle. chrome:// and the
    // Web Store can't be scripted; fall back to the profile editor there.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await toggle(tab.id);
    } catch {
      await chrome.runtime.openOptionsPage();
    }
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "openOptions") void chrome.runtime.openOptionsPage();
});
