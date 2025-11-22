document.addEventListener('DOMContentLoaded', async () => {
    const data = await chrome.storage.local.get(['lastSessionReport']);
    const report = data.lastSessionReport;

    if (!report) {
        document.body.innerHTML = "<h1>No session data found.</h1>";
        return;
    }

    // 1. Populate Text Summary
    document.getElementById('r-goal').innerText = report.goal;
    
    const durationMs = report.endTime - report.startTime;
    const durationMin = Math.ceil(durationMs / 60000);
    document.getElementById('r-duration').innerText = `${durationMin} Minutes`;

    // 2. Populate Logs
    const logList = document.getElementById('r-log');
    report.history.forEach(entry => {
        // Only show events that aren't just passive background updates
        if (entry.event && !entry.event.includes("passive")) {
            const li = document.createElement('li');
            li.className = 'log-item';
            if (entry.event.toLowerCase().includes('distraction')) li.classList.add('distraction');
            
            const timeOffset = Math.round((entry.timestamp - report.startTime) / 1000); // seconds from start
            
            li.innerHTML = `
                <span>${entry.event} (Score: ${entry.score})</span>
                <span class="time">+${timeOffset}s</span>
            `;
            logList.appendChild(li);
        }
    });

    // 3. Draw Chart (Canvas API)
    drawChart(report.history);
});

function drawChart(history) {
    const canvas = document.getElementById('focusChart');
    const ctx = canvas.getContext('2d');
    
    // Fix resolution for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 40;

    if (history.length < 2) return;

    const startTime = history[0].timestamp;
    const endTime = history[history.length - 1].timestamp;
    const totalTime = endTime - startTime || 1; // Avoid divide by zero

    // Helper to map time/score to X/Y
    const getX = (t) => padding + ((t - startTime) / totalTime) * (width - 2 * padding);
    const getY = (s) => height - padding - (s / 100) * (height - 2 * padding);

    // Draw Axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    
    // Y Axis Line
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();

    // X Axis Line
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw Line Graph
    ctx.beginPath();
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    
    history.forEach((point, index) => {
        const x = getX(point.timestamp);
        const y = getY(point.score);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Distraction Dots
    history.forEach((point) => {
        if (point.event && point.event.includes('distraction')) {
            const x = getX(point.timestamp);
            const y = getY(point.score);
            
            ctx.beginPath();
            ctx.fillStyle = '#ff5252';
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}