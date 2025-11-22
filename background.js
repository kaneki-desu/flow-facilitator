// ==========================================
// CONFIGURATION
// ==========================================
// TODO: PASTE YOUR GROQ API KEY HERE
const GROQ_API_KEY = "Your groq API Key Here";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// HARDCODED DISTRACTION LIST (Saves API Calls)
const BLOCKED_DOMAINS = [
    "instagram.com",
    "facebook.com", 
    "tiktok.com",
    "twitter.com", 
    "x.com",
    "reddit.com",
    "netflix.com",
    "hulu.com",
    "disneyplus.com",
    "twitch.tv",
    "pinterest.com",
    "9gag.com",
    "buzzfeed.com"
];

// State Management
let userGoal = "General Productivity";
let flowScore = 0; // 0 to 100. > 80 is Flow State.
let isFlowState = false;
let currentVideoAnalysis = null;

console.log("[Background] 🚀 Service Worker Initialized");

// ==========================================
// PASSIVE SCORE GAIN (Linear Function)
// ==========================================
// Increase score by 2 every minute if not distracted, simulating "building focus"
setInterval(() => {
    updateFlowScore('passive_gain');
}, 60 * 1000); 

// ==========================================
// LLM ANALYSIS (The Core Feature)
// ==========================================
async function analyzeContentRelevance(title, description) {
    console.log(`[Step 2] 🤖 AI Analysis Starting for: "${title}"`);
    
    if (!GROQ_API_KEY || GROQ_API_KEY.includes("YOUR_GROQ_API_KEY")) {
        console.warn("[Background] ❌ API Key missing");
        return { productive: true, reason: "API Key missing" };
    }

    let safeDescription = "No description provided";
    if (description) {
        safeDescription = String(description);
    }
    
    const snippet = (typeof safeDescription === 'string') 
        ? safeDescription.substring(0, 300) 
        : "No description";

    const prompt = `
    User Study Goal: "${userGoal}"
    Page Title: "${title}"
    Content Snippet: "${snippet}"
    
    Task: Detailedly analyze if this content is PRODUCTIVE for the goal or a DISTRACTION.
    Strictly output ONLY valid JSON in this format:
    {
        "productive": boolean,
        "score": number_1_to_10,
        "reason": "short explanation"
    }
    `;

    try {
        console.log("[Step 3] 📡 Sending request to Groq API...");
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error("[Background] ❌ Invalid Groq Response:", data);
            return { productive: true, score: 5, reason: "API Error" };
        }

        const text = data.choices[0].message.content;
        console.log("[Step 4] 📥 LLM RAW RESPONSE:", text);

        const jsonStr = text.replace(/```json|```/g, "").trim();
        const parsedAnalysis = JSON.parse(jsonStr);

        console.log("[Step 5] ✅ PARSED ANALYSIS:", parsedAnalysis);
        
        return parsedAnalysis;

    } catch (error) {
        console.error("[Background] 💥 LLM Error:", error);
        return { productive: true, score: 5, reason: "AI unavailable" };
    }
}

// ==========================================
// MESSAGE LISTENER
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.type === "UPDATE_GOAL") {
        userGoal = request.goal;
        chrome.storage.local.set({ userGoal: request.goal });
        console.log("🎯 New Goal Set:", userGoal);
        sendResponse({ success: true });
        return false;
    }

    // Renamed from CHECK_YOUTUBE to CHECK_CONTENT to reflect global capability
    if (request.type === "CHECK_CONTENT") {
        if (request.data && request.data.title) {
            console.log("[Step 1] 📥 Received Content Data:", request.data.title);
            // Reset previous analysis to prevent stale decision logic
            currentVideoAnalysis = null; 
            
            // Extract URL from sender tab
            const url = sender.tab ? sender.tab.url : "";
            
            handleContentCheck(request.data, sender.tab.id, url, sendResponse);
        } else {
            sendResponse({ status: "error", message: "No data" });
        }
        return true; // Keep channel open
    }

    if (request.type === "GET_STATUS") {
        sendResponse({ flowScore, isFlowState, userGoal, currentVideoAnalysis });
        return false;
    }

    if (request.type === "ACTIVITY_UPDATE") {
        updateFlowScore(request.action);
        sendResponse({ ack: true });
        return false;
    }
});

// ==========================================
// LOGIC HANDLERS
// ==========================================
async function handleContentCheck(data, tabId, url, sendResponse) {
    let analysis;

    // 1. CHECK BLOCKLIST FIRST (Save API Calls)
    // We check if the URL contains any of the blocked domains
    const isBlocked = BLOCKED_DOMAINS.some(domain => url.toLowerCase().includes(domain));

    if (isBlocked) {
        console.log(`[Step 2] 🚫 Site is in Blocklist: ${url}. Skipping AI.`);
        // Create synthetic "distraction" analysis
        analysis = {
            productive: false,
            score: 0,
            reason: "This website is in your known list of high-distraction sites."
        };
    } else {
        // 2. IF NOT BLOCKED, ASK LLM
        analysis = await analyzeContentRelevance(data.title, data.description);
    }

    currentVideoAnalysis = analysis;

    // Threshold for distraction (Score < 4)
    if (analysis.score < 4) {
        console.log(`[Step 6] ⚠️ Distraction Detected (Score: ${analysis.score}). Applying Penalty.`);
        updateFlowScore('distraction');
        
        if (tabId) {
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: "SHOW_WARNING",
                    message: `⚠️ Distraction Detected!\nThis content does not align with "${userGoal}".\nReason: ${analysis.reason}`
                });
            } catch (e) {
                console.log("[Background] Tab closed before warning could be sent.");
            }
        }
    } else {
        console.log(`[Step 6] ✅ Productive Content. Maintaining Focus.`);
        // We DO NOT add score here anymore. Score only increases linearly with time.
    }

    sendResponse({ status: "completed", analysis: analysis });
}

function updateFlowScore(action) {
    const oldScore = flowScore;
    let change = 0;

    // LINEAR GROWTH
    if (action === 'passive_gain') {
        // +2 points every minute, capped at 100
        change = 2;
    }
    
    // DYNAMIC PENALTY
    if (action === 'distraction') {
        // The higher the score, the bigger the fall.
        // Base penalty 10 + 30% of current score.
        // If score is 100 -> Penalty is 40.
        // If score is 20 -> Penalty is 6.
        const penalty = 10 + (flowScore * 0.3);
        change = -Math.floor(penalty);
    }

    if (action === 'tab_switch') {
        change = -1; // Small penalty for erratic switching
    }
    
    if (action === 'typing') {
        change = 0; // Typing keeps flow alive, but doesn't artificially boost it fast
    }

    flowScore = Math.min(100, Math.max(0, flowScore + change));

    const wasFlow = isFlowState;
    isFlowState = flowScore > 80;

    if (Math.abs(change) > 0) {
        console.log(`📊 Score Update: [${action}] ${oldScore} -> ${flowScore} (Flow: ${isFlowState})`);
    }

    if (!wasFlow && isFlowState) {
        enableFlowProtection();
    } else if (wasFlow && !isFlowState) {
        disableFlowProtection();
    }
    
    chrome.storage.local.set({ flowScore, isFlowState });
}

function enableFlowProtection() {
    console.log("🌊 ENTERING FLOW STATE - Broadcasting lockdown");
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: "ENTER_FLOW_MODE" }).catch(() => {});
        });
    });
}

function disableFlowProtection() {
    console.log("🍂 LEAVING FLOW STATE - releasing lockdown");
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: "EXIT_FLOW_MODE" }).catch(() => {});
        });
    });
}