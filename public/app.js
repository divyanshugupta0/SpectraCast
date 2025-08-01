const socket = io();
let localStream = null;
let currentSessionId = null;
let isSharing = false;
let isPaused = false;
let peerConnection = null;
let isHost = false;
let stats = { fps: 0, bitrate: 0, viewers: 0 };
let statsInterval = null;
let audioEnabled = true;
let connectionAttempts = 0;
let maxConnectionAttempts = 3;
let isSecureConnection = false;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// DOM elements
const startShareBtn = document.getElementById('startShare');
const stopShareBtn = document.getElementById('stopShare');
const pauseShareBtn = document.getElementById('pauseShare');
const joinSessionBtn = document.getElementById('joinSession');
const joinSessionInput = document.getElementById('joinSessionId');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const sessionInfo = document.getElementById('sessionInfo');
const sessionIdSpan = document.getElementById('sessionId');
const status = document.getElementById('status');
const qualitySelect = document.getElementById('qualitySelect');
const fpsSelect = document.getElementById('fpsSelect');
const copySessionBtn = document.getElementById('copySession');
const viewerCountSpan = document.getElementById('viewerCount');
const connectionStatus = document.getElementById('connectionStatus');
const statsDiv = document.getElementById('stats');
const fullscreenBtn = document.getElementById('fullscreen');
const screenshotBtn = document.getElementById('screenshot');
const toggleAudioBtn = document.getElementById('toggleAudio');
const pipToggleBtn = document.getElementById('pipToggle');
const chatPanel = document.getElementById('chatPanel');
const chatToggleBtn = document.getElementById('chatToggle');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessage');
const viewerControls = document.getElementById('viewerControls');
const notificationContainer = document.getElementById('notificationContainer');
const viewSection = document.querySelector('.view-section');
const shareSection = document.querySelector('.share-section');
const qrScanBtn = document.getElementById('qrScanBtn');
const qrPopup = document.getElementById('qrPopup');
const closeQrPopup = document.getElementById('closeQrPopup');
const qrVideo = document.getElementById('qrVideo');
const showQrBtn = document.getElementById('showQrBtn');
const qrDisplayPopup = document.getElementById('qrDisplayPopup');
const closeQrDisplay = document.getElementById('closeQrDisplay');
const qrCanvas = document.getElementById('qrCanvas');
const exitSessionBtn = document.getElementById('exitSession');
let qrStream = null;
let isViewing = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateConnectionStatus('connected');
    setupEventListeners();
});

function setupEventListeners() {
    // Sharing controls
    startShareBtn.addEventListener('click', startSharing);
    stopShareBtn.addEventListener('click', stopSharing);
    pauseShareBtn.addEventListener('click', togglePause);
    
    // Viewer controls
    joinSessionBtn.addEventListener('click', joinSession);
    exitSessionBtn.addEventListener('click', exitSession);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    screenshotBtn.addEventListener('click', takeScreenshot);
    toggleAudioBtn.addEventListener('click', toggleAudio);
    pipToggleBtn.addEventListener('click', togglePiP);
    
    // Session controls
    copySessionBtn.addEventListener('click', copySessionId);
    
    // Chat controls
    chatToggleBtn.addEventListener('click', toggleChat);
    sendMessageBtn.addEventListener('click', sendMessage);
    sendMessageBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        sendMessage();
    });
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // QR Scanner controls
    qrScanBtn.addEventListener('click', openQrScanner);
    closeQrPopup.addEventListener('click', closeQrScanner);
    
    // QR Display controls
    showQrBtn.addEventListener('click', showQrCode);
    closeQrDisplay.addEventListener('click', () => {
        qrDisplayPopup.classList.add('hidden');
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
}

// Enhanced screen sharing
async function startSharing() {
    try {
        const quality = qualitySelect.value;
        const fps = parseInt(fpsSelect.value);
        const constraints = getVideoConstraints(quality, fps);
        
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: constraints,
            audio: { 
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        localVideo.srcObject = localStream;
        localVideo.classList.remove('hidden');
        
        currentSessionId = generateSessionId();
        isHost = true;
        isSharing = true;
        
        socket.emit('start-sharing', { sessionId: currentSessionId });
        
        startShareBtn.disabled = true;
        stopShareBtn.disabled = false;
        pauseShareBtn.disabled = false;
        
        // Hide view section when sharing
        viewSection.classList.add('hidden');
        
        startStatsMonitoring();
        
        localStream.getVideoTracks()[0].onended = () => {
            stopSharing();
        };
        
        updateStatus('Screen sharing active', 'success');
        
    } catch (err) {
        console.error('Error starting screen share:', err);
        updateStatus('Error: ' + err.message, 'error');
    }
}

function stopSharing() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
    
    localVideo.classList.add('hidden');
    sessionInfo.classList.add('hidden');
    startShareBtn.disabled = false;
    stopShareBtn.disabled = true;
    pauseShareBtn.disabled = true;
    isSharing = false;
    isHost = false;
    isPaused = false;
    
    // Show view section when sharing stops
    viewSection.classList.remove('hidden');
    
    updateStatus('Screen sharing stopped', 'info');
}

function togglePause() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isPaused = !videoTrack.enabled;
        
        pauseShareBtn.innerHTML = isPaused ? 
            '<i class="fas fa-play"></i> Resume' : 
            '<i class="fas fa-pause"></i> Pause';
            
        updateStatus(isPaused ? 'Screen sharing paused' : 'Screen sharing resumed', 'info');
    }
}

function joinSession() {
    if (isViewing) {
        updateStatus('Already connected to a session. Exit first to join another.', 'error');
        return;
    }
    
    const sessionId = joinSessionInput.value.trim().toUpperCase();
    
    if (!sessionId) {
        updateStatus('Please enter a session ID', 'error');
        return;
    }
    
    if (!isValidSessionId(sessionId)) {
        updateStatus('Invalid session ID format', 'error');
        return;
    }
    
    currentSessionId = sessionId;
    isHost = false;
    connectionAttempts = 0;
    
    updateStatus('Joining session...', 'info');
    socket.emit('join-session', { sessionId });
}

function exitSession() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    remoteVideo.classList.add('hidden');
    remoteVideo.srcObject = null;
    viewerControls.classList.add('hidden');
    shareSection.classList.remove('hidden');
    
    // Hide exit button and show join controls
    exitSessionBtn.classList.add('hidden');
    joinSessionBtn.classList.remove('hidden');
    qrScanBtn.classList.remove('hidden');
    joinSessionInput.classList.remove('hidden');
    
    isViewing = false;
    currentSessionId = null;
    
    updateStatus('Exited session', 'info');
}

function getVideoConstraints(quality, fps) {
    const constraints = {
        frameRate: { ideal: fps, max: fps },
        cursor: 'always'
    };
    
    switch(quality) {
        case '720p':
            constraints.width = { ideal: 1280 };
            constraints.height = { ideal: 720 };
            break;
        case '1080p':
            constraints.width = { ideal: 1920 };
            constraints.height = { ideal: 1080 };
            break;
        case '4k':
            constraints.width = { ideal: 3840 };
            constraints.height = { ideal: 2160 };
            break;
    }
    
    return constraints;
}

function generateSessionId() {
    // Generate secure session ID with timestamp and random components
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    const secure = crypto.getRandomValues ? 
        Array.from(crypto.getRandomValues(new Uint8Array(4)))
            .map(b => b.toString(36)).join('') : 
        Math.random().toString(36).substr(2, 4);
    
    return (timestamp + random + secure).toUpperCase().substr(0, 12);
}

// Validate session ID format
function isValidSessionId(sessionId) {
    return /^[A-Z0-9]{8,12}$/.test(sessionId);
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                sessionId: currentSessionId,
                candidate: event.candidate
            });
        }
    };
    
    peerConnection.ontrack = (event) => {
        if (!isHost) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.classList.remove('hidden');
            updateStatus('Connected to screen share', 'success');
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        updateConnectionStatus(state);
        
        if (state === 'failed' && connectionAttempts < maxConnectionAttempts) {
            connectionAttempts++;
            updateStatus(`Connection failed, retrying... (${connectionAttempts}/${maxConnectionAttempts})`, 'error');
            setTimeout(() => {
                if (!isHost) {
                    joinSession();
                }
            }, 2000);
        } else if (state === 'connected') {
            isSecureConnection = true;
            connectionAttempts = 0;
            updateStatus('Secure connection established', 'success');
        }
    };
    
    peerConnection.onicegatheringstatechange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
            updateStatus('ICE gathering complete', 'info');
        }
    };
    
    if (isHost && localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    return peerConnection;
}

// Enhanced features
function copySessionId() {
    navigator.clipboard.writeText(currentSessionId).then(() => {
        updateStatus('Session ID copied to clipboard', 'success');
    });
}

function toggleFullscreen() {
    const video = isHost ? localVideo : remoteVideo;
    if (!document.fullscreenElement) {
        video.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function takeScreenshot() {
    const video = isHost ? localVideo : remoteVideo;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const link = document.createElement('a');
    link.download = `screenshot-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    updateStatus('Screenshot saved', 'success');
}

function toggleAudio() {
    audioEnabled = !audioEnabled;
    const video = isHost ? localVideo : remoteVideo;
    video.muted = !audioEnabled;
    
    toggleAudioBtn.innerHTML = audioEnabled ? 
        '<i class="fas fa-volume-up"></i> Audio' : 
        '<i class="fas fa-volume-mute"></i> Muted';
}

function togglePiP() {
    const video = isHost ? localVideo : remoteVideo;
    if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
    } else {
        video.requestPictureInPicture();
    }
}

function toggleChat() {
    chatPanel.classList.toggle('open');
    
    // Update toggle button icon
    const isOpen = chatPanel.classList.contains('open');
    chatToggleBtn.innerHTML = isOpen ? 
        '<i class="fas fa-times"></i>' : 
        '<i class="fas fa-comments"></i>';
}

// Close chat when clicking the X button
document.getElementById('toggleChat').addEventListener('click', () => {
    chatPanel.classList.remove('open');
    chatToggleBtn.innerHTML = '<i class="fas fa-comments"></i>';
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !currentSessionId) return;
    
    // Sanitize message to prevent XSS
    const sanitizedMessage = message.replace(/[<>"'&]/g, (match) => {
        const entities = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
        return entities[match];
    });
    
    if (sanitizedMessage.length > 500) {
        updateStatus('Message too long (max 500 characters)', 'error');
        return;
    }
    
    const messageData = {
        sessionId: currentSessionId,
        message: sanitizedMessage,
        timestamp: Date.now(),
        userId: socket.id
    };
    
    socket.emit('chat-message', messageData);
    addChatMessage(messageData, true);
    messageInput.value = '';
}

function addChatMessage(data, isOwn = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''}`;
    messageDiv.innerHTML = `
        <div class="message-content">${data.message}</div>
        <div class="message-time">${new Date(data.timestamp).toLocaleTimeString()}</div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function startStatsMonitoring() {
    statsInterval = setInterval(async () => {
        if (peerConnection) {
            const stats = await peerConnection.getStats();
            updateStatsDisplay(stats);
        }
    }, 1000);
}

function updateStatsDisplay(stats) {
    let bitrate = 0;
    let fps = 0;
    
    stats.forEach(report => {
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
            bitrate = Math.round(report.bytesSent * 8 / 1000);
            fps = report.framesPerSecond || 0;
        }
    });
    
    statsDiv.innerHTML = `
        FPS: ${fps} | Bitrate: ${bitrate} kbps | Viewers: ${stats.viewers || 0}
    `;
}

function updateStatus(message, type = 'info') {
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle'
    };
    
    status.innerHTML = `<i class="${icons[type]}"></i> ${message}`;
    status.className = `status-bar ${type}`;
}

function updateConnectionStatus(state) {
    const statusMap = {
        connected: { text: 'Connected', class: 'connected' },
        connecting: { text: 'Connecting...', class: 'connecting' },
        disconnected: { text: 'Disconnected', class: 'disconnected' }
    };
    
    const statusInfo = statusMap[state] || statusMap.disconnected;
    connectionStatus.innerHTML = `<i class="fas fa-circle"></i> <span>${statusInfo.text}</span>`;
    connectionStatus.className = `connection-status ${statusInfo.class}`;
}

function showNotification(title, message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notification-header">
            <span class="notification-title">${title}</span>
            <button class="notification-close">&times;</button>
        </div>
        <div class="notification-message">${message}</div>
    `;
    
    notificationContainer.appendChild(notification);
    
    // Auto remove after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, duration);
    
    // Manual close
    notification.querySelector('.notification-close').onclick = () => {
        notification.remove();
    };
    
    // Click to dismiss
    notification.onclick = () => {
        notification.remove();
    };
}

async function openQrScanner() {
    try {
        qrStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        qrVideo.srcObject = qrStream;
        qrPopup.classList.remove('hidden');
        
        // Start QR detection
        startQrDetection();
        
    } catch (err) {
        updateStatus('Camera access denied or not available', 'error');
    }
}

function closeQrScanner() {
    if (qrStream) {
        qrStream.getTracks().forEach(track => track.stop());
        qrStream = null;
    }
    qrPopup.classList.add('hidden');
}

function showQrCode() {
    if (currentSessionId) {
        generateQrCode(currentSessionId);
        qrDisplayPopup.classList.remove('hidden');
    }
}

function closeQrDisplayPopup() {
    qrDisplayPopup.classList.add('hidden');
}

function generateQrCode(sessionId) {
    const ctx = qrCanvas.getContext('2d');
    const size = 200;
    
    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    
    // Simple QR-like pattern (placeholder)
    ctx.fillStyle = 'black';
    const cellSize = size / 25;
    
    // Create a simple pattern representing the session ID
    for (let i = 0; i < sessionId.length; i++) {
        const char = sessionId.charCodeAt(i);
        const x = (i % 5) * cellSize * 5;
        const y = Math.floor(i / 5) * cellSize * 2;
        
        // Draw pattern based on character code
        for (let bit = 0; bit < 8; bit++) {
            if (char & (1 << bit)) {
                ctx.fillRect(x + (bit % 4) * cellSize, y + Math.floor(bit / 4) * cellSize, cellSize, cellSize);
            }
        }
    }
    
    // Add border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
}

function startQrDetection() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const detectQr = () => {
        if (qrVideo.videoWidth > 0 && qrVideo.videoHeight > 0) {
            canvas.width = qrVideo.videoWidth;
            canvas.height = qrVideo.videoHeight;
            ctx.drawImage(qrVideo, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrResult = detectQrCode(imageData);
            
            if (qrResult) {
                joinSessionInput.value = qrResult;
                closeQrScanner();
                joinSession();
                return;
            }
        }
        
        if (!qrPopup.classList.contains('hidden')) {
            requestAnimationFrame(detectQr);
        }
    };
    
    requestAnimationFrame(detectQr);
}

function detectQrCode(imageData) {
    // Use the QR scanner utility
    if (window.QRScanner) {
        return QRScanner.detectSessionId(imageData);
    }
    
    // Fallback: look for text patterns in the image
    // This is a simplified approach for demo purposes
    return null;
}

function handleKeyboard(e) {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 's':
                e.preventDefault();
                takeScreenshot();
                break;
            case 'Enter':
                if (chatPanel.classList.contains('open')) {
                    sendMessage();
                }
                break;
        }
    }
    
    if (e.key === 'Escape') {
        if (!qrPopup.classList.contains('hidden')) {
            closeQrScanner();
        }
        if (!qrDisplayPopup.classList.contains('hidden')) {
            closeQrDisplayPopup();
        }
    }
}

// Socket event handlers
socket.on('sharing-started', (data) => {
    sessionIdSpan.textContent = data.sessionId;
    sessionInfo.classList.remove('hidden');
    updateStatus('Screen sharing started successfully', 'success');
});

socket.on('joined-session', async (data) => {
    updateStatus(`Joined session: ${data.sessionId}`, 'success');
    viewerControls.classList.remove('hidden');
    shareSection.classList.add('hidden');
    
    // Hide join controls and show exit button
    joinSessionBtn.classList.add('hidden');
    qrScanBtn.classList.add('hidden');
    joinSessionInput.classList.add('hidden');
    exitSessionBtn.classList.remove('hidden');
    
    isViewing = true;
    createPeerConnection();
});

socket.on('viewer-joined', async (data) => {
    if (isHost && localStream) {
        createPeerConnection();
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            sessionId: currentSessionId,
            offer: offer
        });
        
        stats.viewers++;
        viewerCountSpan.textContent = stats.viewers;
        
        // Show notification to admin when new viewer joins
        showNotification(
            'New Viewer Joined',
            `A new user has joined your screen sharing session. Total viewers: ${stats.viewers}`,
            'success',
            4000
        );
    }
});

socket.on('offer', async (data) => {
    if (!isHost) {
        if (!peerConnection) createPeerConnection();
        
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            sessionId: currentSessionId,
            answer: answer
        });
    }
});

socket.on('answer', async (data) => {
    if (isHost && peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
    }
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(data.candidate);
    }
});

socket.on('session-not-found', () => {
    updateStatus('Session not found', 'error');
});

socket.on('session-ended', () => {
    updateStatus('Session ended by host', 'info');
    remoteVideo.classList.add('hidden');
    remoteVideo.srcObject = null;
    viewerControls.classList.add('hidden');
    shareSection.classList.remove('hidden');
    
    // Reset join controls
    exitSessionBtn.classList.add('hidden');
    joinSessionBtn.classList.remove('hidden');
    qrScanBtn.classList.remove('hidden');
    joinSessionInput.classList.remove('hidden');
    
    isViewing = false;
});

socket.on('chat-message', (data) => {
    addChatMessage(data);
});

socket.on('viewer-count', (count) => {
    const previousCount = stats.viewers;
    stats.viewers = count;
    viewerCountSpan.textContent = count;
    
    // Notify admin of viewer count changes
    if (isHost && count > previousCount) {
        showNotification(
            'Viewer Update',
            `Total viewers: ${count}`,
            'info',
            3000
        );
    }
});

socket.on('disconnect', () => {
    updateConnectionStatus('disconnected');
});

socket.on('connect', () => {
    updateConnectionStatus('connected');
});

socket.on('error', (error) => {
    updateStatus('Error: ' + error.message, 'error');
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (isSharing) {
        stopSharing();
    }
});