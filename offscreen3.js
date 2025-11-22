// 1. Verify script is running immediately
console.log("✅ offscreen.js script loaded successfully");

let video;
let isModelLoaded = false;

// 2. Listen for the command (for when the extension runs normally)
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.command === 'INIT_CAMERA') {
        console.log("Received INIT_CAMERA command");
        startCamera();
    }
});

// 3. AUTO-START (Crucial for your manual testing)
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Ready. Attempting to start camera...");
    startCamera(); 
});

async function startCamera() {
    const videoEl = document.getElementById('video');
    const statusEl = document.getElementById('status'); 

    // Helper to update text on screen
    const updateStatus = (text, color = "black") => {
        console.log(`[STATUS] ${text}`);
        if (statusEl) {
            statusEl.innerText = text;
            statusEl.style.color = color;
        }
    };

    if (isModelLoaded) {
        updateStatus("Models already loaded. Restarting stream...");
    }

    try {
        // A. Load Models
        if (!isModelLoaded) {
            updateStatus("Loading AI Models... (This may take a moment)");
            // Note: Ensure assets/models path is correct
            await faceapi.nets.tinyFaceDetector.loadFromUri('assets/models');
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri('assets/models');
            isModelLoaded = true;
            updateStatus("Models Loaded! Requesting Camera...");
        }

        // B. Get Webcam
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        videoEl.srcObject = stream;
        updateStatus("Camera Active! Starting detection loop...", "blue");

        // C. Start Detection Loop
        videoEl.addEventListener('play', () => {
            console.log("Video is playing. Loop starting.");
            
            setInterval(async () => {
                
                // --- IMPROVED DETECTION SETTINGS ---
                // inputSize: 512 (Detects smaller faces/further away)
                // scoreThreshold: 0.2 (Detects faces even in bad lighting)
                const options = new faceapi.TinyFaceDetectorOptions({ 
                    inputSize: 512, 
                    scoreThreshold: 0.2 
                });

                // Detect face using the new options
                const detections = await faceapi.detectSingleFace(videoEl, options).withFaceLandmarks(true);
                
                let status = "ABSENT";
                
                if (detections) {
                    // Calculate pose
                    status = calculateHeadPose(detections.landmarks);
                    
                    // Update screen text for visual feedback
                    if (status === "FOCUSED") updateStatus("FOCUSED (Productive)", "green");
                    else if (status === "NOTE_TAKING") updateStatus("NOTE TAKING (Productive)", "orange");
                    else if (status === "DISTRACTED") updateStatus("DISTRACTED (Unproductive)", "red");
                } else {
                    updateStatus("ABSENT (No Face)", "grey");
                }
                
                // Send status to background script
                chrome.runtime.sendMessage({ type: 'WEBCAM_FOCUS_UPDATE', status: status });
            }, 1000); // Run every 1 second
        });

    } catch (err) {
        console.error("CRITICAL ERROR:", err);
        updateStatus("Error: " + err.message, "red");
    }
}

function calculateHeadPose(landmarks) {
    const nose = landmarks.getNose()[3];
    const leftEye = landmarks.getLeftEye()[0];
    const rightEye = landmarks.getRightEye()[3];
    const jaw = landmarks.getJawOutline()[8];

    // 1. Calculate Yaw (Left/Right Turn)
    // 0.5 = Center. 
    // < 0.5 = Turning Right. > 0.5 = Turning Left.
    const dLeft = Math.abs(nose.x - leftEye.x);
    const dRight = Math.abs(nose.y - rightEye.y);
    const yawRatio = dLeft / ((dLeft + dRight) || 1); 
    
    // 2. Calculate Pitch (Up/Down Tilt)
    // Lower number = Looking Down more
    const noseToJaw = Math.abs(jaw.y - nose.y);
    const faceHeight = Math.abs(jaw.y - leftEye.y);
    const pitchRatio = noseToJaw / (faceHeight || 1);

    // --- DEBUGGING: See your numbers in the console! ---
    // Open Console to see this. Adjust the IF numbers below based on what you see here.
    console.log(`Yaw: ${yawRatio.toFixed(2)} | Pitch: ${pitchRatio.toFixed(2)}`);

    // --- SENSITIVITY SETTINGS (Edit these!) ---
    
    // A. DISTRACTED (Left/Right)
    // Old: < 0.2 or > 0.8 (Required extreme turn)
    // New: < 0.3 or > 0.7 (Triggers with slight turn)
    if (yawRatio < 0.46 || yawRatio > 0.61) return "DISTRACTED"; 

    // B. NOTE TAKING (Looking Down)
    // Old: < 0.35 (Required looking at chest)
    // New: < 0.45 (Triggers when looking at keyboard)
    // IF YOU WANT IT EVEN EASIER: Change 0.45 to 0.50
    if (pitchRatio < 0.6) return "NOTE_TAKING"; 
    
    return "FOCUSED"; 
}