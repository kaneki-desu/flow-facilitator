console.log("[FlowAI] service_worker.js loaded");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[FlowAI] Received message:", msg);

    if (msg.type === "START_SESSION") {
        chrome.storage.local.set({ sessionActive: true });
        sendResponse({ ok: true, message: "Session started" });
        return true;
    }

    if (msg.type === "STOP_SESSION") {
        chrome.storage.local.set({ sessionActive: false });
        sendResponse({ ok: true, message: "Session stopped" });
        return true;
    }

    if (msg.type === "SAVE_SETTINGS") {
        chrome.storage.local.set(msg.data, () => {
            sendResponse({ ok: true });
        });
        return true;
    }

    return true; // Keep message port open
});
