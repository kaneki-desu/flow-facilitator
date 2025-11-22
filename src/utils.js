// src/utils.js
const DEFAULTS = {
  studyTopic: "General Study",
  useLLM: true,
  backendUrl: "https://your-backend.example.com",
  flowThresholds: {
    typingRatePerMin: 20,     // keystrokes/min threshold
    dwellTimeSec: 300,        // 5 min minimum to consider sustained work
    mouseSmoothness: 0.6,     // heuristic
    fatigueTypingDropPct: 0.5 // drop to 50% of baseline indicates fatigue
  },
  blockedSites: [
    "facebook.com", "instagram.com", "twitter.com", "tiktok.com", "reddit.com"
  ],
  allowedChannels: [],
  sensitivity: 0.8
};

export async function getSettings() {
  return new Promise((res) => {
    chrome.storage.sync.get(DEFAULTS, (items) => {
      res(items);
    });
  });
}

export async function setSettings(obj) {
  return new Promise((res) => {
    chrome.storage.sync.set(obj, () => res());
  });
}

export function nowISO() {
  return new Date().toISOString();
}
