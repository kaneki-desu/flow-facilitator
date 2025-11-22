// ==========================================
// CONFIGURATION
// ==========================================
// TODO: PASTE  HERE
const GROQ_API_KEY = "YOUR GROQ API";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// State Management
let userGoal = "General Productivity: Career related learning videos, exam related learning videos ";
let flowScore = 78; // 0 to 100. > 80 is Flow State.
let isFlowState = false;
let currentVideoAnalysis = null;

console.log("[Background] 🚀 Service Worker Initialized");

// ==========================================
// LLM ANALYSIS (The Core Feature)
// ==========================================
async function analyzeContentRelevance(title, description) {
    console.log(`[Step 2] 🤖 AI Analysis Starting for: "${title}"`);
    
    if (!GROQ_API_KEY || GROQ_API_KEY.includes("YOUR_GROQ_API_KEY")) {
        console.warn("[Background] ❌ API Key missing");
        return { productive: true, reason: "API Key missing" };
    }

    // ULTRA-SAFEGUARD: Convert to string safely, handling null/undefined
    let safeDescription = "No description provided";
    if (description) {
        safeDescription = String(description);
    }
    
    // Extra check: Ensure it really is a string before substring
    const snippet = (typeof safeDescription === 'string') 
        ? safeDescription.substring(0, 200) 
        : "No description";

    const prompt = `
    User Study Goal: "${userGoal}"
    Content Title: "${title}"
    Content Description (snippet): "${snippet}"
    
    Task: detailedly analyze if this content helps the user achieve their study goal.
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

        // --- DEBUGGING LOGS ADDED HERE ---
        console.log("[Step 4] 📥 LLM RAW RESPONSE:", text);

        // Clean and parse JSON
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
    console.log("[Background] 📨 Message Received:", request.type);
    
    if (request.type === "UPDATE_GOAL") {
        userGoal = request.goal;
        chrome.storage.local.set({ userGoal: request.goal });
        console.log("🎯 New Goal Set:", userGoal);
        sendResponse({ success: true });
        return false;
    }

    if (request.type === "CHECK_YOUTUBE") {
        // Ensure data exists before processing
        if (request.data && request.data.title) {
            console.log("[Step 1] 📥 Received YouTube Data from Content Script");
            // Pass sendResponse to the async function to keep channel open
            handleYouTubeCheck(request.data, sender.tab.id, sendResponse);
        } else {
            sendResponse({ status: "error", message: "No data" });
        }
        return true; // KEEPS CHANNEL OPEN FOR ASYNC RESPONSE
    }

    if (request.type === "GET_STATUS") {
        sendResponse({ flowScore, isFlowState, userGoal, currentVideoAnalysis });
        return false;
    }

    if (request.type === "ACTIVITY_UPDATE") {
        updateFlowScore(request.action);
        sendResponse({ ack: true }); // Acknowledge to prevent errors
        return false;
    }
});

// ==========================================
// LOGIC HANDLERS
// ==========================================
async function handleYouTubeCheck(data, tabId, sendResponse) {
    const analysis = await analyzeContentRelevance(data.title, data.description);
    currentVideoAnalysis = analysis;

    if (analysis.score < 4) {
        console.log(`[Step 6] ⚠️ Distraction Detected (Score: ${analysis.score}). Sending Warning.`);
        updateFlowScore('distraction');
        
        // Guard against "tab closed" errors
        if (tabId) {
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: "SHOW_WARNING",
                    message: `Distraction Detected! This doesn't align with "${userGoal}".\nReason: ${analysis.reason}`
                });
            } catch (e) {
                console.log("[Background] Tab closed before warning could be sent.");
            }
        }
    } else {
        console.log(`[Step 6] ✅ Productive Content (Score: ${analysis.score}). Boosting Score.`);
        updateFlowScore('productive');
    }

    // CRITICAL FIX: Close the message channel
    sendResponse({ status: "completed", analysis: analysis });
}

function updateFlowScore(action) {
    const oldScore = flowScore;
    if (action === 'productive') flowScore = Math.min(100, flowScore + 5);
    if (action === 'distraction') flowScore = Math.max(0, flowScore - 15);
    if (action === 'tab_switch') flowScore = Math.max(0, flowScore - 2);
    if (action === 'typing') flowScore = Math.min(100, flowScore + 1);

    const wasFlow = isFlowState;
    isFlowState = flowScore > 80;

    console.log(`📊 Score Update: [${action}] ${oldScore} -> ${flowScore} (Flow: ${isFlowState})`);

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

// --- NEW ADDITION: Webcam & Focus Logic ---
let humanState = "ABSENT"; // ABSENT, FOCUSED, DISTRACTED, NOTE_TAKING
let lastActivityTime = Date.now();

// 1. Setup the Offscreen Document (Camera)
async function setupCamera() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: ['offscreen.html']
    });

    if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Focus tracking'
        });
    }
    
    // Give it a moment to load, then start camera
    setTimeout(() => {
        chrome.runtime.sendMessage({ command: 'INIT_CAMERA' });
    }, 1000);
}

// Start camera when extension loads
chrome.runtime.onStartup.addListener(setupCamera);
chrome.runtime.onInstalled.addListener(setupCamera);

// 2. Handle Messages from Camera & Content Script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    
    // Update Inputs
    if (msg.type === 'USER_ACTIVITY_DETECTED') {
        lastActivityTime = Date.now();
    }
    
    // Update Camera State
    if (msg.type === 'WEBCAM_FOCUS_UPDATE') {
        humanState = msg.status;
        calculateCombinedScore(); // Recalculate global score
    }
});

// 3. The "Master" Logic
function calculateCombinedScore() {
    const isActive = (Date.now() - lastActivityTime) < 5000; // Typed in last 5s
    let finalVerdict = "UNPRODUCTIVE";

    if (humanState === "FOCUSED") {
        finalVerdict = "PRODUCTIVE";
    } 
    else if (humanState === "NOTE_TAKING" || humanState === "DISTRACTED") {
        // If they are looking away BUT typing, they are working (taking notes)
        if (isActive) {
            finalVerdict = "PRODUCTIVE";
        } else {
            // If looking down and NOT typing, maybe reading? Be lenient.
            finalVerdict = (humanState === "NOTE_TAKING") ? "MAYBE_PRODUCTIVE" : "UNPRODUCTIVE";
        }
    }
    else if (humanState === "ABSENT") {
        finalVerdict = "ABSENT";
    }

    console.log(`User Status: ${finalVerdict} (Cam: ${humanState} | Input: ${isActive})`);

    // --- INTEGRATION POINT ---
    // HERE you can modify your existing variable.
    // Example: if (window.currentFocusScore) { ... }
    
    if (finalVerdict === "UNPRODUCTIVE") {
         // Decrement your existing score variable here
         // e.g., focusScore -= 5;
    }
}