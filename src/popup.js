console.log("[FlowAI] popup.js loaded");

document.getElementById("startBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_SESSION" }, (res) => {
        console.log("START response:", res);
    });
});

document.getElementById("stopBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "STOP_SESSION" }, (res) => {
        console.log("STOP response:", res);
    });
});

document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    const topic = document.getElementById("studyTopic").value;
    const backend = document.getElementById("backendUrl").value;

    chrome.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        data: { topic, backend }
    }, (res) => {
        console.log("Settings saved:", res);
    });
});
