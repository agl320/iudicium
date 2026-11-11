// Toolbar button: toggle the panel on application pages, else open profiles.

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  } catch {
    // No content script on this page.
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "openOptions") void chrome.runtime.openOptionsPage();
});
