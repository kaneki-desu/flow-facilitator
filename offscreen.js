// 1. Verify script is running immediately
console.log("✅ offscreen.js script loaded successfully");

let video;
let isModelLoaded = false;
let focusTime = 0;       // 'tau' (Cumulative Time)
let distractionStreak = 0; // NEW: Counter for the 5-second buffer

// 2. Listen for commands
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.command === 'INIT_CAMERA') {
        startCamera();
    }
});

// 3. AUTO-START
document.addEventListener('DOMContentLoaded', () => {
    startCamera(); 
});

async function startCamera() {
    const videoEl = document.getElementById('video');
    const statusEl = document.getElementById('status'); 

    const updateStatus = (text, color = "black") => {
        if (statusEl) {
            statusEl.innerText = text;
            statusEl.style.color = color;
        }
    };

    if (isModelLoaded) updateStatus("Models loaded. Restarting...");

    try {
        // A. Load Models
        if (!isModelLoaded) {
            updateStatus("Loading AI Models...");
            await faceapi.nets.tinyFaceDetector.loadFromUri('assets/models');
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri('assets/models');
            isModelLoaded = true;
            updateStatus("Models Loaded! Requesting Camera...");
        }

        // B. Get Webcam
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        videoEl.srcObject = stream;
        updateStatus("Camera Active!", "blue");

        // C. Start Detection Loop
        videoEl.addEventListener('play', () => {
            setInterval(async () => {
                // --- DETECTION SETTINGS ---
                const options = new faceapi.TinyFaceDetectorOptions({ 
                    inputSize: 512, 
                    scoreThreshold: 0.2 
                });

                const detections = await faceapi.detectSingleFace(videoEl, options).withFaceLandmarks(true);
                
                // 1. Get the "Raw" Status from the AI
                let rawStatus = "ABSENT";
                if (detections) rawStatus = calculateHeadPose(detections.landmarks);

                // --- NEW: 5-SECOND BUFFER LOGIC ---
                let finalStatus = rawStatus; // This is what we will actually use for score

                if (rawStatus === "DISTRACTED" || rawStatus === "ABSENT") {
                    distractionStreak++; // Increment bad streak
                    
                    if (distractionStreak < 5) {
                        // GRACE PERIOD: If less than 5 seconds, pretend they are still FOCUSED
                        console.log(`Buffer Active: Ignoring ${rawStatus} (${distractionStreak}/10)`);
                        finalStatus = rawStatus; 
                    } else {
                        // PENALTY ZONE: Buffer exceeded, apply the real status
                        finalStatus = rawStatus;
                    }
                } else {
                    // If they are Focused/Note Taking, reset the streak immediately
                    distractionStreak = 0;
                    finalStatus = rawStatus;
                }

                // --- SCORE CALCULATION (Uses finalStatus) ---
                if (distractionStreak < 10) {
                    focusTime = focusTime + 1; 
                } else {
                    focusTime = focusTime - 4; 
                    if (focusTime < 0) focusTime = 0;
                }

                // Calculate Score F(t)
                const currentScore = calculateScoreFromTime(focusTime);

                // --- VISUAL UPDATE ---
                let color = "grey";
                if (finalStatus === "FOCUSED") color = "green";
                if (finalStatus === "NOTE_TAKING") color = "orange";
                if (finalStatus === "DISTRACTED" || finalStatus === "ABSENT") color = "red";

                // Show buffer warning on screen if relevant
                let displayText = `${finalStatus} | Score: ${currentScore.toFixed(2)}`;
                if (distractionStreak > 0 && distractionStreak < 5) {
                    displayText += ` (Warning: ${distractionStreak}/10)`;
                    color = "#bfa100"; // Dark Yellow warning color
                }

                console.log(`State: ${finalStatus} (Raw: ${rawStatus}) | Time: ${focusTime} | Score: ${currentScore.toFixed(2)}`);
                updateStatus(displayText, color);
                
                chrome.runtime.sendMessage({ 
                    type: 'WEBCAM_FOCUS_UPDATE', 
                    status: finalStatus,
                    score: currentScore,
                    rawTime: focusTime
                });

            }, 1000); 
        });

    } catch (err) {
        console.error(err);
        updateStatus("Error: " + err.message, "red");
    }
}

// --- SCORE FORMULA ---
function calculateScoreFromTime(tau) {
    if (tau < 600) {
        return 0.05 * ( (tau * tau) / 600 );
    } else if (tau < 1800) {
        return 5 + 0.01667 * (tau - 600);
    } else {
        return 31.67 + 0.03889 * (tau - 1800);
    }
}

// --- HEAD POSE LOGIC ---
function calculateHeadPose(landmarks) {
    const nose = landmarks.getNose()[3];
    const leftEye = landmarks.getLeftEye()[0];
    const rightEye = landmarks.getRightEye()[3];
    const jaw = landmarks.getJawOutline()[8];

    const dLeft = Math.abs(nose.x - leftEye.x);
    const dRight = Math.abs(nose.y - rightEye.y);
    const yawRatio = dLeft / ((dLeft + dRight) || 1); 
    
    const noseToJaw = Math.abs(jaw.y - nose.y);
    const faceHeight = Math.abs(jaw.y - leftEye.y);
    const pitchRatio = noseToJaw / (faceHeight || 1);

    // Custom Sensitivity
    if (yawRatio < 0.46 || yawRatio > 0.61) return "DISTRACTED"; 
    if (pitchRatio < 0.6) return "NOTE_TAKING"; 
    
    return "FOCUSED"; 
}