console.log("[Content] 👁️ Flow Facilitator Content Script Loaded");

let analysisInterval = null;
let currentUrl = location.href;

// ==========================================
// 1. NAVIGATION OBSERVER (Universal)
// ==========================================
// This observer detects URL changes on SPAs (like YouTube) and normal page loads
const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        console.log("[Content] 🔄 URL Changed:", currentUrl);
        
        // Cleanup previous analysis to prevent "stale video" bug
        cleanupAnalysis();
        
        // Start new analysis with a slight delay to allow DOM to settle
        setTimeout(initContentAnalysis, 1500);
    }
    
    // Continuous cleanup if in Flow Mode (YouTube Specific mostly)
    if (document.body.classList.contains('flow-active')) {
        hideDistractions();
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check on script load
setTimeout(initContentAnalysis, 1000);

// ==========================================
// 2. CONTENT ANALYSIS ENGINE
// ==========================================
function cleanupAnalysis() {
    if (analysisInterval) {
        clearInterval(analysisInterval);
        analysisInterval = null;
    }
}

function initContentAnalysis() {
    // Prevent multiple intervals running simultaneously
    cleanupAnalysis();

    console.log("[Content] 🕵️ Starting content analysis...");

    const isYouTube = window.location.hostname.includes("youtube.com");
    let attempts = 0;
    const maxAttempts = 10;

    analysisInterval = setInterval(() => {
        attempts++;
        let data = null;

        if (isYouTube && window.location.pathname === "/watch") {
            // --- YOUTUBE SPECIFIC EXTRACTION ---
            const titleEl = document.querySelector('h1.ytd-watch-metadata');
            const descEl = document.querySelector('#description-inline-expander') || document.querySelector('#description');
            
            if (titleEl && titleEl.innerText.trim().length > 0) {
                data = {
                    title: titleEl.innerText,
                    description: descEl ? descEl.innerText : "No description available"
                };
            }
        } else if (!isYouTube) {
            // --- GENERIC SITE EXTRACTION ---
            const title = document.title;
            const metaDesc = document.querySelector("meta[name='description']");
            const description = metaDesc ? metaDesc.getAttribute("content") : document.body.innerText.substring(0, 300);
            
            if (title) {
                data = {
                    title: title,
                    description: description
                };
            }
        }

        if (data) {
            console.log(`[Content] 📤 Data Found (Attempt ${attempts}). Sending to AI.`);
            console.log(`[Content] Title: ${data.title.substring(0, 50)}...`);
            
            safelySendMessage({ type: "CHECK_CONTENT", data: data });
            
            // Stop checking once data is found and sent
            cleanupAnalysis();
        } else if (attempts >= maxAttempts) {
            console.log("[Content] ❌ Timed out waiting for content metadata.");
            cleanupAnalysis();
        }
    }, 1000);
}

// ==========================================
// 3. DISTRACTION BLOCKING (YouTube Focused)
// ==========================================
function hideDistractions() {
    if (!window.location.hostname.includes("youtube.com")) return;

    const distractions = [
        '#secondary', // Sidebar recommendations
        '#comments',  // Comments section
        'ytd-rich-grid-renderer', // Homepage grid
        'ytd-reel-shelf-renderer' // Shorts shelf
    ];

    distractions.forEach(selector => {
        const els = document.querySelectorAll(selector);
        els.forEach(el => el.style.display = 'none');
    });
}

function showDistractions() {
    const distractions = ['#secondary', '#comments', 'ytd-rich-grid-renderer', 'ytd-reel-shelf-renderer'];
    distractions.forEach(selector => {
        const els = document.querySelectorAll(selector);
        els.forEach(el => el.style.display = '');
    });
}

// ==========================================
// 4. ACTIVITY TRACKING
// ==========================================
document.addEventListener('click', () => updateActivity('active'));
document.addEventListener('keydown', () => updateActivity('typing'));

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        safelySendMessage({ type: "ACTIVITY_UPDATE", action: "tab_switch" });
    }
});

function updateActivity(type) {
    if (Math.random() > 0.9) { 
        safelySendMessage({ type: "ACTIVITY_UPDATE", action: type });
    }
}

// ==========================================
// 5. MESSAGING & UI
// ==========================================
function safelySendMessage(message) {
    try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(message).catch(err => {
                // Ignore standard connection errors
            });
        }
    } catch (e) {
        // Context invalidated
    }
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "ENTER_FLOW_MODE") {
        document.body.classList.add('flow-active');
        hideDistractions();
        createNotification("🌊 Flow State Activated. Distractions blocked.");
    }

    if (request.type === "EXIT_FLOW_MODE") {
        document.body.classList.remove('flow-active');
        showDistractions();
        createNotification("🍂 Flow State Paused.");
    }

    if (request.type === "SHOW_WARNING") {
        showOverlay(request.message);
    }
});

function createNotification(text) {
    const div = document.createElement('div');
    div.className = 'flow-toast';
    div.innerText = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function showOverlay(text) {
    if(document.getElementById('flow-warning-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'flow-warning-overlay';
    overlay.innerHTML = `
        <div class="flow-modal">
            <h2>⚠️ Focus Alert</h2>
            <p>${text}</p>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                <button id="flow-close-btn">I have a reason (Ignore)</button>
                <button id="flow-retreat-btn" style="background:#ff5252;">Close Page</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('flow-close-btn').onclick = () => overlay.remove();
    document.getElementById('flow-retreat-btn').onclick = () => window.close();
}