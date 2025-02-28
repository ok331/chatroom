class PrivateChatroom {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.localStream = null;
        this.screenStream = null;
        this.mediaCall = null;
        this.screenCall = null;
        this.isInCall = false;
        this.isScreenSharing = false;
        this.isRoomOwner = false;
        this.hasPartner = false;
        this.encryptionKey = null;

        this.initializeElements();
        this.addEventListeners();
        this.checkUrlForRoomId();
        lucide.createIcons();
    }

    initializeElements() {
        // Sections
        this.joinSection = document.getElementById('join-section');
        this.chatSection = document.getElementById('chat-section');

        // Buttons
        this.createRoomBtn = document.getElementById('create-room');
        this.joinRoomBtn = document.getElementById('join-room');
        this.leaveRoomBtn = document.getElementById('leave-room');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.shareScreenBtn = document.getElementById('share-screen');
        this.uploadFileBtn = document.getElementById('upload-file');
        this.fileInput = document.getElementById('file-input');
        this.fileProgress = document.querySelector('.file-progress');

        // Forms and inputs
        this.messageForm = document.getElementById('message-form');
        this.roomIdInput = document.getElementById('room-id');
        this.messageInput = document.getElementById('message-input');
        
        // Display elements
        this.currentRoomId = document.getElementById('current-room-id');
        this.messagesContainer = document.getElementById('messages');
        this.connectionStatus = document.querySelector('.connection-status');
        this.statusIndicator = document.querySelector('.status-indicator');
    }

    addEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleCall());
        this.shareScreenBtn.addEventListener('click', () => this.toggleScreenShare());
        
        this.messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        this.uploadFileBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.currentRoomId.addEventListener('click', () => {
            navigator.clipboard.writeText(this.currentRoomId.textContent)
                .catch(err => console.error('Failed to copy room ID:', err));
        });

        window.addEventListener('beforeunload', () => {
            if (this.isRoomOwner) {
                this.connection?.send(JSON.stringify({ type: 'owner-left' }));
            }
            this.cleanupConnections();
        });

        window.addEventListener('popstate', () => {
            const roomId = window.location.pathname.substring(1);
            if (!roomId) {
                this.leaveRoom();
            } else if (roomId.length === 24) {
                this.roomIdInput.value = roomId;
                this.joinRoom();
            }
        });

        // Auto-focus message input when chat is shown
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.classList.contains('hidden')) {
                    this.messageInput.blur();
                } else {
                    this.messageInput.focus();
                }
            });
        });
        observer.observe(this.chatSection, { attributes: true });
    }

    checkUrlForRoomId() {
        const roomId = window.location.pathname.substring(1);
        if (roomId && roomId.length === 24) {
            this.roomIdInput.value = roomId;
            this.joinRoom();
        }
    }

    generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 24; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    generateEncryptionKey() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async encryptMessage(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const keyBuffer = new Uint8Array(this.encryptionKey.match(/.{2}/g).map(byte => parseInt(byte, 16)));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            msgBuffer
        );
        
        return {
            iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
            data: Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
        };
    }

    async decryptMessage(encryptedMsg) {
        const keyBuffer = new Uint8Array(this.encryptionKey.match(/.{2}/g).map(byte => parseInt(byte, 16)));
        const iv = new Uint8Array(encryptedMsg.iv.match(/.{2}/g).map(byte => parseInt(byte, 16)));
        const data = new Uint8Array(encryptedMsg.data.match(/.{2}/g).map(byte => parseInt(byte, 16)));
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            data
        );
        
        return new TextDecoder().decode(decrypted);
    }

    updateConnectionStatus(status) {
        this.statusIndicator.className = 'status-indicator ' + status;
        this.connectionStatus.classList.remove('connecting');
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 15 * 1024 * 1024) {
            alert('File size must be less than 15MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = {
                type: 'file',
                name: file.name,
                size: file.size,
                data: e.target.result
            };

            try {
                this.uploadFileBtn.disabled = true;
                this.fileProgress.style.width = '0%';
                
                // Split file into chunks of 16KB
                const chunkSize = 16 * 1024;
                const chunks = Math.ceil(data.data.length / chunkSize);
                
                for (let i = 0; i < chunks; i++) {
                    const chunk = data.data.slice(i * chunkSize, (i + 1) * chunkSize);
                    await this.connection.send(JSON.stringify({
                        type: 'file-chunk',
                        name: file.name,
                        chunk,
                        index: i,
                        total: chunks
                    }));
                    this.fileProgress.style.width = `${((i + 1) / chunks) * 100}%`;
                }

                this.displayMessage(`Sent file: ${file.name}`, true);
            } catch (err) {
                console.error('Failed to send file:', err);
                alert('Failed to send file');
            } finally {
                this.uploadFileBtn.disabled = false;
                this.fileProgress.style.width = '0%';
                this.fileInput.value = '';
            }
        };
        reader.readAsDataURL(file);
    }

    async createRoom() {
        this.isRoomOwner = true;
        const roomId = this.generateRoomId();
        this.encryptionKey = this.generateEncryptionKey();
        window.history.pushState({}, '', `/${roomId}`);
        await this.initializePeer(roomId);
        this.currentRoomId.textContent = roomId;
        this.showChatSection();
        this.updateConnectionStatus('connecting');
    }

    async joinRoom() {
        if (this.hasPartner) {
            alert('This room is already full');
            return;
        }

        const roomId = this.roomIdInput.value.trim();
        
        if (roomId.length !== 24) {
            alert('Please enter a valid 24-character room ID');
            return;
        }

        window.history.pushState({}, '', `/${roomId}`);
        await this.initializePeer();
        this.connectToPeer(roomId);
        this.currentRoomId.textContent = roomId;
        this.showChatSection();
        this.updateConnectionStatus('connecting');
    }

    async initializePeer(peerId = null) {
        this.peer = new Peer(peerId, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        return new Promise((resolve) => {
            this.peer.on('open', (id) => {
                console.log('My peer ID is: ' + id);
                resolve();
            });

            this.peer.on('connection', (conn) => {
                this.connection = conn;
                this.setupConnectionHandlers(conn);
            });

            this.peer.on('call', (call) => {
                if (call.metadata && call.metadata.type === 'screen') {
                    this.handleIncomingScreenShare(call);
                } else {
                    this.handleIncomingCall(call);
                }
            });
        });
    }

    connectToPeer(peerId) {
        this.connection = this.peer.connect(peerId);
        this.setupConnectionHandlers(this.connection);
    }

    setupConnectionHandlers(conn) {
        conn.on('open', () => {
            this.hasPartner = true;
            if (this.isRoomOwner) {
                conn.send(JSON.stringify({
                    type: 'encryption-key',
                    key: this.encryptionKey
                }));
            }
            this.updateConnectionStatus('connected');
            this.messageInput.disabled = false;
            this.messageForm.querySelector('button').disabled = false;
            this.toggleAudioBtn.disabled = false;
            this.uploadFileBtn.disabled = false;
            this.fileInput.disabled = false;
        });

        let fileChunks = {};

        conn.on('data', async (data) => {
            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'encryption-key') {
                        this.encryptionKey = parsed.key;
                        return;
                    }
                    if (parsed.type === 'encrypted-message') {
                        const decrypted = await this.decryptMessage(parsed);
                        this.displayMessage(decrypted, false);
                        return;
                    }
                    if (parsed.type === 'owner-left') {
                        alert('Room owner has left. Disconnecting...');
                        this.leaveRoom();
                        return;
                    } else if (parsed.type === 'file-chunk') {
                        if (!fileChunks[parsed.name]) {
                            fileChunks[parsed.name] = new Array(parsed.total);
                        }
                        fileChunks[parsed.name][parsed.index] = parsed.chunk;
                        
                        if (!fileChunks[parsed.name].includes(undefined)) {
                            const fileData = fileChunks[parsed.name].join('');
                            this.displayMessage(`Received file: ${parsed.name}`, false);
                            
                            // Create download link
                            const link = document.createElement('a');
                            link.href = fileData;
                            link.download = parsed.name;
                            link.click();
                            
                            delete fileChunks[parsed.name];
                        }
                    }
                } catch (err) {
                    console.error('Error processing message:', err);
                }
            }
        });

        conn.on('close', () => {
            this.hasPartner = false;
            this.updateConnectionStatus('disconnected');
            this.messageInput.disabled = true;
            this.messageForm.querySelector('button').disabled = true;
            this.toggleAudioBtn.disabled = true;
            this.shareScreenBtn.disabled = true;
            this.uploadFileBtn.disabled = true;
            this.fileInput.disabled = true;
            
            if (!this.isRoomOwner) {
                alert('Connection lost. Returning to join screen...');
                this.leaveRoom();
            }
        });
    }

    async handleIncomingCall(call) {
        const shouldAccept = confirm('Incoming call. Accept?');
        if (shouldAccept) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.localStream = stream;
                call.answer(stream);
                
                call.on('stream', (remoteStream) => {
                    const audio = new Audio();
                    audio.srcObject = remoteStream;
                    audio.play();
                });

                this.mediaCall = call;
                this.isInCall = true;
                this.updateCallButton();
                this.shareScreenBtn.disabled = false;
            } catch (err) {
                console.error('Failed to get local stream', err);
                alert('Failed to access microphone');
            }
        } else {
            call.close();
        }
    }

    async handleIncomingScreenShare(call) {
        call.answer(null); // No need to send back a stream for screen sharing
        
        call.on('stream', (remoteStream) => {
            // Create or get video element for screen share
            let screenVideo = document.getElementById('screen-share-video');
            if (!screenVideo) {
                screenVideo = document.createElement('video');
                screenVideo.id = 'screen-share-video';
                screenVideo.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    max-width: 90vw;
                    max-height: 90vh;
                    background: var(--background);
                    border-radius: var(--radius);
                    z-index: 1000;
                    box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
                `;
                
                // Add close button
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '<i data-lucide="x" class="icon"></i>';
                closeBtn.className = 'destructive';
                closeBtn.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 30px;
                    height: 30px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                closeBtn.onclick = () => {
                    document.body.removeChild(screenVideo.parentElement);
                };

                // Create container for video and button
                const container = document.createElement('div');
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999;
                `;
                
                container.appendChild(screenVideo);
                container.appendChild(closeBtn);
                document.body.appendChild(container);
                lucide.createIcons();
            }

            screenVideo.srcObject = remoteStream;
            screenVideo.play();
        });

        this.screenCall = call;
    }

    async toggleCall() {
        if (!this.isInCall) {
            await this.startCall();
        } else {
            this.endCall();
        }
    }

    async startCall() {
        if (!this.connection) {
            alert('Must be connected to start a call');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.localStream = stream;
            
            const call = this.peer.call(this.connection.peer, stream);
            call.on('stream', (remoteStream) => {
                const audio = new Audio();
                audio.srcObject = remoteStream;
                audio.play();
            });

            this.mediaCall = call;
            this.isInCall = true;
            this.updateCallButton();
            this.shareScreenBtn.disabled = false;
        } catch (err) {
            console.error('Failed to start call', err);
            alert('Failed to start call');
        }
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.mediaCall) {
            this.mediaCall.close();
            this.mediaCall = null;
        }
        if (this.isScreenSharing) {
            this.stopScreenShare();
        }
        this.isInCall = false;
        this.updateCallButton();
        this.shareScreenBtn.disabled = true;
    }

    updateCallButton() {
        const icon = this.toggleAudioBtn.querySelector('i');
        if (this.isInCall) {
            this.toggleAudioBtn.innerHTML = '<i data-lucide="phone-off" class="icon"></i>End Call';
            this.toggleAudioBtn.classList.add('destructive');
        } else {
            this.toggleAudioBtn.innerHTML = '<i data-lucide="phone" class="icon"></i>Start Call';
            this.toggleAudioBtn.classList.remove('destructive');
        }
        lucide.createIcons();
    }

    async toggleScreenShare() {
        if (!this.isScreenSharing) {
            await this.startScreenShare();
        } else {
            this.stopScreenShare();
        }
    }

    async startScreenShare() {
        if (!this.isInCall) {
            alert('Must be in a call to share screen');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    displaySurface: "monitor",
                    logicalSurface: true,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 60 }
                }
            });
            this.screenStream = stream;
            
            const call = this.peer.call(this.connection.peer, stream, {
                metadata: { type: 'screen' }
            });

            stream.getVideoTracks()[0].onended = () => {
                this.stopScreenShare();
                const screenVideo = document.getElementById('screen-share-video');
                if (screenVideo && screenVideo.parentElement) {
                    document.body.removeChild(screenVideo.parentElement);
                }
            };

            this.screenCall = call;
            this.isScreenSharing = true;
            this.updateScreenShareButton();
        } catch (err) {
            console.error('Failed to share screen', err);
            alert('Failed to share screen');
        }
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        if (this.screenCall) {
            this.screenCall.close();
            this.screenCall = null;
        }
        const screenVideo = document.getElementById('screen-share-video');
        if (screenVideo && screenVideo.parentElement) {
            document.body.removeChild(screenVideo.parentElement);
        }
        this.isScreenSharing = false;
        this.updateScreenShareButton();
    }

    updateScreenShareButton() {
        if (this.isScreenSharing) {
            this.shareScreenBtn.innerHTML = '<i data-lucide="monitor-off" class="icon"></i>Stop Sharing';
            this.shareScreenBtn.classList.add('destructive');
        } else {
            this.shareScreenBtn.innerHTML = '<i data-lucide="monitor" class="icon"></i>Share Screen';
            this.shareScreenBtn.classList.remove('destructive');
        }
        lucide.createIcons();
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.connection || !this.encryptionKey) return;

        try {
            const encrypted = await this.encryptMessage(message);
            this.connection.send(JSON.stringify({
                type: 'encrypted-message',
                ...encrypted
            }));
            this.displayMessage(message, true);
            this.messageInput.value = '';
            this.messageInput.focus();
        } catch (err) {
            console.error('Error sending encrypted message:', err);
        }
    }

    displayMessage(message, isSent) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', isSent ? 'sent' : 'received');
        messageElement.setAttribute('data-sender', isSent ? 'You' : 'Partner');
        messageElement.textContent = message;
        
        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Remove message after 5 minutes for privacy
        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (messageElement.parentNode === this.messagesContainer) {
                    this.messagesContainer.removeChild(messageElement);
                }
            }, 200);
        }, 5 * 60 * 1000);

        // Clear input right away for better UX
        if (isSent) {
            this.messageInput.value = '';
            this.messageInput.focus();
        }
    }

    showChatSection() {
        this.joinSection.classList.add('hidden');
        this.chatSection.classList.remove('hidden');
    }

    leaveRoom() {
        if (this.isRoomOwner && this.connection) {
            this.connection.send(JSON.stringify({ type: 'owner-left' }));
        }
        this.cleanupConnections();
        window.history.pushState({}, '', '/');
        this.chatSection.classList.add('hidden');
        this.joinSection.classList.remove('hidden');
        this.messagesContainer.innerHTML = '';
        this.messageInput.value = '';
        this.isRoomOwner = false;
        this.hasPartner = false;
        this.updateConnectionStatus('disconnected');
    }

    cleanupConnections() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }
        if (this.connection) {
            this.connection.close();
        }
        if (this.peer) {
            this.peer.destroy();
        }
        
        this.peer = null;
        this.connection = null;
        this.localStream = null;
        this.screenStream = null;
        this.mediaCall = null;
        this.screenCall = null;
        this.isInCall = false;
        this.isScreenSharing = false;
    }
}

// Initialize the application
const chatroom = new PrivateChatroom(); 