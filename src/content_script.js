// src/content_script.js

// Minimal guard to avoid multiple injection
if (!window.__flow_facilitator_injected) {
  window.__flow_facilitator_injected = true;

  (function() {
    // state & metrics
    let metrics = {
      keys: 0,
      typingRatePerMin: 0,
      lastKeyTs: null,
      mouseMoves: 0,
      mouseSmoothness: 1.0,
      dwellTimeSec: 0,
      firstSeenTs: Date.now(),
      lastActivityTs: Date.now(),
      url: location.href,
      title: document.title,
      description: getMetaDescription()
    };

    const sendMetricsDebounced = debounce(sendMetrics, 3000);
    const TAB_ID = null; // not accessible here; service worker will deduce via sender

    // event listeners
    document.addEventListener("keydown", (e) => {
      metrics.keys += 1;
      metrics.lastActivityTs = Date.now();
      metrics.lastKeyTs = Date.now();
      sendMetricsDebounced();
    });

    let lastMouse = null;
    document.addEventListener("mousemove", (e) => {
      metrics.mouseMoves += 1;
      metrics.lastActivityTs = Date.now();
      // calculate mouse smoothness heuristic (very simple)
      if (lastMouse) {
        const dx = Math.abs(e.screenX - lastMouse.x);
        const dy = Math.abs(e.screenY - lastMouse.y);
        const dist = Math.sqrt(dx*dx + dy*dy);
        metrics.mouseSmoothness = Math.max(0, Math.min(1, 1 - Math.min(1, dist/200)));
      }
      lastMouse = { x: e.screenX, y: e.screenY, ts: Date.now() };
      sendMetricsDebounced();
    });

    // track visibility to update dwellTime
    setInterval(() => {
      const now = Date.now();
      metrics.dwellTimeSec = Math.floor((now - metrics.firstSeenTs) / 1000);
      // update typingRate/min
      const minutes = Math.max(1, (now - (metrics.firstSeenTs))/60000);
      metrics.typingRatePerMin = Math.round(metrics.keys / minutes);
      // send periodically
      sendMetricsDebounced();
    }, 4000);

    // message listener from background
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.command === "enterFlow") {
        enterFlowMode(msg.reason);
      } else if (msg.command === "exitFlow") {
        exitFlowMode(msg.reason);
      } else if (msg.command === "fatigueIntervention") {
        runFatigueIntervention(msg.reason);
      } else if (msg.command === "videoUnproductive") {
        showVideoOverlay(msg.verdict);
      }
    });

    // overlay element
    let overlay = null;
    function ensureOverlay() {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "flow-facilitator-overlay";
        overlay.innerHTML = `
          <div id="ff-banner">FLOW MODE: ACTIVE</div>
          <div id="ff-controls"><button id="ff-exit">Exit Flow Mode</button></div>
          <div id="ff-reason"></div>
        `;
        document.documentElement.appendChild(overlay);
        document.getElementById("ff-exit").addEventListener("click", () => {
          chrome.runtime.sendMessage({ type: "releaseFlowLock" });
          exitFlowMode("user_exit");
        });
      }
    }

    function enterFlowMode(reason) {
      ensureOverlay();
      overlay.style.display = "block";
      document.body.dataset.__flow_mode = "on";
      // block known distractions by hiding elements (simple)
      hideDistractions();
      // show subtle focus border
      document.documentElement.style.boxShadow = "inset 0 0 80px rgba(0,0,0,0.04)";
      document.getElementById("ff-reason").innerText = "Reason: " + (reason || "");
    }

    function exitFlowMode(reason) {
      if (overlay) overlay.style.display = "none";
      document.body.dataset.__flow_mode = "off";
      showDistractions();
      document.documentElement.style.boxShadow = "";
    }

    function hideDistractions() {
      // YouTube specific: hide sidebar and recommendations
      try {
        const ytSide = document.querySelector("#related, #secondary, ytd-watch-next-secondary-results-renderer, #comments");
        if (ytSide) ytSide.style.display = "none";
        const home = document.querySelector("ytd-browse, ytd-rich-grid-renderer, .ytp-related");
        if (home) home.style.filter = "blur(2px)";
      } catch(e){}
    }

    function showDistractions() {
      try {
        const ytSide = document.querySelector("#related, #secondary, ytd-watch-next-secondary-results-renderer, #comments");
        if (ytSide) ytSide.style.display = "";
        const home = document.querySelector("ytd-browse, ytd-rich-grid-renderer, .ytp-related");
        if (home) home.style.filter = "";
      } catch(e){}
    }

    // show overlay when video is unproductive
    function showVideoOverlay(verdict) {
      // small bottom-right toast
      const toast = document.createElement("div");
      toast.className = "ff-toast";
      toast.innerHTML = `
        <div><b>Unproductive Video Detected</b></div>
        <div>${(verdict.reasons||[]).slice(0,2).join(", ")}</div>
        <div style="margin-top:6px;">
          <button class="ff-btn-return">Return to Study</button>
          <button class="ff-btn-ignore">Ignore 5m</button>
        </div>`;
      document.body.appendChild(toast);
      toast.querySelector(".ff-btn-return").addEventListener("click", ()=> {
        window.scrollTo(0,0);
        toast.remove();
      });
      toast.querySelector(".ff-btn-ignore").addEventListener("click", ()=> {
        toast.remove();
      });
      setTimeout(()=>toast.remove(), 15000);
    }

    // fatigue interventions
    function runFatigueIntervention(reason) {
      // choose adaptive intervention: breathing or memory game
      const choice = Math.random() < 0.5 ? "breath" : "memory";
      if (choice === "breath") showBreathingTimer();
      else showMemoryGame();
    }

    function showBreathingTimer() {
      // small modal breathing for 20 seconds
      const modal = document.createElement("div");
      modal.className = "ff-modal";
      modal.innerHTML = `
        <div class="ff-modal-body">
          <div style="font-weight:700">Micro Break • Breathing (20s)</div>
          <div style="margin-top:10px" id="ff-breath-ring">Breathe in...</div>
          <button id="ff-close-breath">Skip</button>
        </div>`;
      document.body.appendChild(modal);
      let t = 20;
      const el = modal.querySelector("#ff-breath-ring");
      const iv = setInterval(()=>{
        t--;
        el.innerText = t%2===0 ? "Breathe in..." : "Breathe out...";
        if (t<=0) {
          clearInterval(iv);
          modal.remove();
        }
      }, 1000);
      modal.querySelector("#ff-close-breath").addEventListener("click", ()=> {
        clearInterval(iv); modal.remove();
      });
    }

    function showMemoryGame() {
      // very small 2-card flip memory demo: remember shown number for 6s
      const modal = document.createElement("div");
      modal.className = "ff-modal";
      const num = Math.floor(Math.random()*90)+10;
      modal.innerHTML = `
        <div class="ff-modal-body">
          <div style="font-weight:700">Memory Boost • Remember this number</div>
          <div style="font-size:36px;margin:12px" id="ff-num">${num}</div>
          <div><button id="ff-continue">Hide & Recall</button></div>
          <div id="ff-check" style="display:none;margin-top:8px;">
            <input id="ff-ans" placeholder="Type number" />
            <button id="ff-submit">Check</button>
            <div id="ff-result"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector("#ff-continue").addEventListener("click", ()=>{
        modal.querySelector("#ff-num").innerText = "—";
        modal.querySelector("#ff-continue").style.display = "none";
        modal.querySelector("#ff-check").style.display = "block";
      });
      modal.querySelector("#ff-submit").addEventListener("click", ()=>{
        const val = modal.querySelector("#ff-ans").value;
        const res = modal.querySelector("#ff-result");
        res.innerText = (val==num) ? "Great! You're focused." : `Oops — it was ${num}`;
        setTimeout(()=>modal.remove(), 2000);
      });
    }

    // send metrics to background
    function sendMetrics() {
      metrics.url = location.href;
      metrics.title = document.title;
      metrics.description = getMetaDescription();
      chrome.runtime.sendMessage({ type: "metrics", ...metrics }, (resp)=> {
        // optional handling
      });
    }

    // simple helpers
    function getMetaDescription() {
      const meta = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
      return meta ? meta.content : "";
    }

    function debounce(fn, ms) {
      let t = null;
      return function(...args) {
        if (t) clearTimeout(t);
        t = setTimeout(()=>fn.apply(this, args), ms);
      }
    }

  })();
}
