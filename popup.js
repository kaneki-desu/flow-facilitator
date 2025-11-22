document.addEventListener('DOMContentLoaded', async () => {
    // Load saved data
    const data = await chrome.storage.local.get(['userGoal', 'flowScore', 'isFlowState']);
    if(data.userGoal) document.getElementById('goal-input').value = data.userGoal;
    updateUI(data.flowScore || 50, data.isFlowState || false);

    // Save Button
    document.getElementById('save-btn').addEventListener('click', () => {
        const goal = document.getElementById('goal-input').value;
        chrome.runtime.sendMessage({ type: "UPDATE_GOAL", goal: goal }, () => {
            const btn = document.getElementById('save-btn');
            btn.innerText = "Saved!";
            setTimeout(() => btn.innerText = "Set Focus Goal", 1000);
        });
    });

    // Poll for updates every second (for the demo)
    setInterval(() => {
        chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
            if(response) {
                updateUI(response.flowScore, response.isFlowState);
                if(response.currentVideoAnalysis) {
                    const v = response.currentVideoAnalysis;
                    document.getElementById('video-status').innerText = 
                        `Last Video: ${v.productive ? '✅ Productive' : '❌ Distracting'} (${v.score}/10)`;
                }
            }
        });
    }, 1000);
});

function updateUI(score, isFlow) {
    document.getElementById('score-val').innerText = Math.round(score) + "/100";
    document.getElementById('score-bar').style.width = score + "%";
    document.getElementById('flow-badge').style.display = isFlow ? "block" : "none";
}