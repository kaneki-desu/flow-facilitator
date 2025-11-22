console.log("[Content] 👁️ Flow Facilitator Content Script Loaded");

// ==========================================
// 1. YOUTUBE SPECIFIC LOGIC
// ==========================================
if (window.location.hostname.includes("youtube.com")) {
    let currentUrl = location.href;
    
    // Use MutationObserver to detect page navigation (SPA) and element loading
    const observer = new MutationObserver(() => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            console.log("[Content] 🔄 URL Changed:", currentUrl);
            if (currentUrl.includes("/watch")) {
                initVideoAnalysis();
            }
        }
        
        // Continuous cleanup if in Flow Mode
        if (document.body.classList.contains('flow-active')) {
            hideDistractions();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial check
    if (location.href.includes("/watch")) initVideoAnalysis();
}

function initVideoAnalysis() {
    console.log("[Content] ⏳ Waiting for video metadata...");
    // Wait for title to appear in DOM using a retry interval (Better than setTimeout)
    const checkTitle = setInterval(() => {
        const titleEl = document.querySelector('h1.ytd-watch-metadata');
        // Description is often inside a structured container, might need expanding
        const descEl = document.querySelector('#description-inline-expander') || document.querySelector('#description');
        
        if (titleEl && titleEl.innerText.length > 0) {
            clearInterval(checkTitle);
            
            const videoData = {
                title: titleEl.innerText,
                description: descEl ? descEl.innerText : "No description"
            };

            console.log("[Content] 📤 Sending to Background for Analysis:", videoData.title);
            safelySendMessage({ type: "CHECK_YOUTUBE", data: videoData });
        }
    }, 1000);
}

function hideDistractions() {
    // List of selectors for Sidebar, Comments, Shorts shelf, Home feed
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
// 2. GENERAL ACTIVITY TRACKING
// ==========================================
let lastActivity = Date.now();

document.addEventListener('click', () => { lastActivity = Date.now(); updateActivity('active'); });
document.addEventListener('keydown', () => { lastActivity = Date.now(); updateActivity('typing'); });

// Check for visibility change (Tab switching)
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        console.log("[Content] 🙈 Tab Hidden (Switch detected)");
        safelySendMessage({ type: "ACTIVITY_UPDATE", action: "tab_switch" });
    }
});

function updateActivity(type) {
    // Throttle updates to avoid spamming background
    if (Math.random() > 0.9) { 
        safelySendMessage({ type: "ACTIVITY_UPDATE", action: type });
    }
}

// ==========================================
// 3. SAFE MESSAGE HANDLING
// ==========================================
function safelySendMessage(message) {
    try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(message).then((response) => {
                if (response) console.log("[Content] ✅ Ack from background:", response);
            }).catch(err => {
                // Suppress context invalidated errors during development
                if (!err.message.includes("Extension context invalidated")) {
                    console.error("[Content] ⚠️ Message Error:", err);
                }
            });
        }
    } catch (e) {
        console.log("Extension context invalid - please refresh the page.");
    }
}

// ==========================================
// 4. INCOMING MESSAGES
// ==========================================
chrome.runtime.onMessage.addListener((request) => {
    console.log("[Content] 📥 Message from Background:", request.type);
    
    if (request.type === "ENTER_FLOW_MODE") {
        document.body.classList.add('flow-active');
        if (window.location.hostname.includes("youtube.com")) hideDistractions();
        createNotification("🌊 Flow State Activated. Distractions blocked.");
    }

    if (request.type === "EXIT_FLOW_MODE") {
        document.body.classList.remove('flow-active');
        if (window.location.hostname.includes("youtube.com")) showDistractions();
        createNotification("🍂 Flow State Paused.");
    }

    if (request.type === "SHOW_WARNING") {
        showOverlay(request.message);
    }
});

// ==========================================
// 5. UI HELPERS (Overlays)
// ==========================================
function createNotification(text) {
    const div = document.createElement('div');
    div.className = 'flow-toast';
    div.innerText = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function showOverlay(text) {
    // Don't stack overlays
    if(document.getElementById('flow-warning-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'flow-warning-overlay';
    overlay.innerHTML = `
        <div class="flow-modal">
            <h2>⚠️ Distraction Alert</h2>
            <p>${text}</p>
            <button id="flow-close-btn">I understand, get back to work.</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('flow-close-btn').onclick = () => {
        overlay.remove();
    };
}

// --- NEW ADDITION: Activity Tracker ---
let lastUserActivity = Date.now();

function notifyAlive() {
    // Throttle: Notify only once every 2 seconds
    if (Date.now() - lastUserActivity > 2000) {
        lastUserActivity = Date.now();
        chrome.runtime.sendMessage({ type: 'USER_ACTIVITY_DETECTED' });
    }
}

document.addEventListener('keydown', notifyAlive);
document.addEventListener('mousemove', notifyAlive);
document.addEventListener('scroll', notifyAlive);