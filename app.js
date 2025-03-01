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
        this.displayName = null;
        this.participants = new Map(); // Store participants with their display names

        // Create notification container first
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.className = 'notification-container';
        document.body.appendChild(this.notificationContainer);

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
        this.generateKeyBtn = document.getElementById('generate-key');
        this.leaveRoomBtn = document.getElementById('leave-room');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.shareScreenBtn = document.getElementById('share-screen');
        this.uploadFileBtn = document.getElementById('upload-file');
        this.fileInput = document.getElementById('file-input');
        this.fileProgress = document.querySelector('.file-progress');

        // Forms and inputs
        this.messageForm = document.getElementById('message-form');
        this.messageInput = document.getElementById('message-input');
        this.sendMessageBtn = this.messageForm.querySelector('button');
        this.roomIdInput = document.getElementById('room-id');
        this.displayNameInput = document.getElementById('display-name');
        
        // Display elements
        this.currentRoomId = document.getElementById('current-room-id');
        this.messagesContainer = document.getElementById('messages');
        this.connectionStatus = document.querySelector('.connection-status');
        this.statusIndicator = document.querySelector('.status-indicator');

        // Add participants list
        this.participantsList = document.getElementById('participants-list');

        // Initialize message form state
        this.messageInput.disabled = true;
        this.sendMessageBtn.disabled = true;
    }

    addEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.validateAndCreateRoom());
        this.joinRoomBtn.addEventListener('click', () => this.validateAndJoinRoom());
        this.generateKeyBtn.addEventListener('click', () => this.generateAndSetRoomId());
        this.leaveRoomBtn.addEventListener('click', () => {
            this.leaveRoom();
            return false;
        });
        this.toggleAudioBtn.addEventListener('click', () => this.toggleCall());
        this.shareScreenBtn.addEventListener('click', () => this.toggleScreenShare());
        
        this.messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.messageInput.value.trim()) {
                this.sendMessage();
            }
        });

        this.sendMessageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.messageInput.value.trim()) {
                this.sendMessage();
            }
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
                this.validateAndJoinRoom();
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
            this.showNotification({
                title: 'File Too Large',
                message: 'File size must be less than 15MB.',
                type: 'error'
            });
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

                this.showNotification({
                    title: 'File Sent',
                    message: `Successfully sent: ${file.name}`,
                    type: 'success'
                });
            } catch (err) {
                console.error('Failed to send file:', err);
                this.showNotification({
                    title: 'Failed to Send File',
                    message: 'An error occurred while sending the file.',
                    type: 'error'
                });
            } finally {
                this.uploadFileBtn.disabled = false;
                this.fileProgress.style.width = '0%';
                this.fileInput.value = '';
            }
        };
        reader.readAsDataURL(file);
    }

    validateDisplayName() {
        const displayName = this.displayNameInput.value.trim();
        if (!displayName) {
            this.showNotification({
                title: 'Display Name Required',
                message: 'Please enter your display name to continue.',
                type: 'error'
            });
            this.displayNameInput.focus();
            return false;
        }
        if (displayName.length > 20) {
            this.showNotification({
                title: 'Display Name Too Long',
                message: 'Display name must be 20 characters or less.',
                type: 'error'
            });
            this.displayNameInput.focus();
            return false;
        }
        this.displayName = displayName;
        return true;
    }

    validateAndCreateRoom() {
        if (this.validateDisplayName()) {
            this.createRoom();
        }
    }

    validateAndJoinRoom() {
        if (this.validateDisplayName()) {
            this.joinRoom();
        }
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
        this.displaySystemMessage(`Room created by ${this.displayName}`);
    }

    async joinRoom() {
        if (this.hasPartner) {
            this.showNotification({
                title: 'Room Full',
                message: 'This room is already full.',
                type: 'error'
            });
            return;
        }

        const roomId = this.roomIdInput.value.trim();
        
        if (roomId.length !== 24) {
            this.showNotification({
                title: 'Invalid Room ID',
                message: 'Please enter a valid 24-character room ID.',
                type: 'error'
            });
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
        this.connection = conn;
        
        // Set connection metadata with display name and room owner status
        this.connection.metadata = { 
            displayName: this.displayName,
            isRoomOwner: this.isRoomOwner
        };
        
        conn.on('open', () => {
            this.hasPartner = true;
            if (this.isRoomOwner) {
                conn.send(JSON.stringify({
                    type: 'encryption-key',
                    key: this.encryptionKey,
                    creatorName: this.displayName
                }));
                // Send your display name
                conn.send(JSON.stringify({
                    type: 'participant-joined',
                    displayName: this.displayName,
                    peerId: this.peer.id,
                    isRoomOwner: true
                }));
            }
            this.updateConnectionStatus('connected');
            this.messageInput.disabled = false;
            this.sendMessageBtn.disabled = false;
            this.toggleAudioBtn.disabled = false;
            this.uploadFileBtn.disabled = false;
            this.fileInput.disabled = false;
        });

        let fileChunks = {};

        conn.on('data', async (data) => {
            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    switch (parsed.type) {
                        case 'encryption-key':
                            this.encryptionKey = parsed.key;
                            if (parsed.creatorName) {
                                this.displaySystemMessage(`Room created by ${parsed.creatorName}`);
                            }
                            // After getting the key, send your display name
                            conn.send(JSON.stringify({
                                type: 'participant-joined',
                                displayName: this.displayName,
                                peerId: this.peer.id,
                                isRoomOwner: false
                            }));
                            break;
                        case 'participant-joined':
                            this.participants.set(parsed.peerId, parsed.displayName);
                            this.updateParticipantsList();
                            this.displaySystemMessage(`${parsed.displayName} joined the room`);
                            break;
                        case 'message':
                            const decryptedMsg = await this.decryptMessage(parsed.message);
                            this.displayMessage(decryptedMsg, false);
                            break;
                        case 'owner-left':
                            alert('Room owner has left. Disconnecting...');
                            this.leaveRoom();
                            break;
                        case 'file-chunk':
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
                            break;
                    }
                } catch (err) {
                    console.error('Error processing message:', err);
                }
            }
        });

        conn.on('close', () => {
            const partnerName = this.participants.get(conn.peer);
            if (partnerName) {
                this.displaySystemMessage(`${partnerName} left the room`);
                this.participants.delete(conn.peer);
                this.updateParticipantsList();
            }

            this.hasPartner = false;
            this.updateConnectionStatus('disconnected');
            this.messageInput.disabled = true;
            this.sendMessageBtn.disabled = true;
            this.toggleAudioBtn.disabled = true;
            this.shareScreenBtn.disabled = true;
            this.uploadFileBtn.disabled = true;
            this.fileInput.disabled = true;
            
            if (!this.isRoomOwner) {
                this.showNotification({
                    title: 'Connection Lost',
                    message: 'Connection to the room was lost.',
                    type: 'error'
                });
                this.leaveRoom();
            }
        });
    }

    async handleIncomingCall(call) {
        const notification = this.showNotification({
            title: 'Incoming Call',
            message: 'Would you like to accept the call?',
            type: 'info',
            duration: false
        });

        // Add accept/reject buttons
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 0.5rem;';
        
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'secondary';
        acceptBtn.innerHTML = '<i data-lucide="phone" class="icon"></i>Accept';
        acceptBtn.style.padding = '0.5rem';
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'destructive';
        rejectBtn.innerHTML = '<i data-lucide="phone-off" class="icon"></i>Reject';
        rejectBtn.style.padding = '0.5rem';
        
        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
        notification.querySelector('.notification-content').appendChild(actions);
        lucide.createIcons();

        acceptBtn.onclick = async () => {
            notification.remove();
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
                
                this.showNotification({
                    title: 'Call Connected',
                    message: 'You are now in a call.',
                    type: 'success'
                });
            } catch (err) {
                console.error('Failed to get local stream', err);
                this.showNotification({
                    title: 'Microphone Access Failed',
                    message: 'Failed to access your microphone.',
                    type: 'error'
                });
            }
        };

        rejectBtn.onclick = () => {
            notification.remove();
            call.close();
            this.showNotification({
                title: 'Call Rejected',
                message: 'You rejected the call.',
                type: 'info'
            });
        };
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
            this.showNotification({
                title: 'Cannot Start Call',
                message: 'You must be connected to start a call.',
                type: 'error'
            });
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
            
            this.showNotification({
                title: 'Call Started',
                message: 'Call connection established.',
                type: 'success'
            });
        } catch (err) {
            console.error('Failed to start call', err);
            this.showNotification({
                title: 'Call Failed',
                message: 'Failed to start the call. Please check your microphone.',
                type: 'error'
            });
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
            this.showNotification({
                title: 'Cannot Share Screen',
                message: 'You must be in a call to share your screen.',
                type: 'error'
            });
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
            
            this.showNotification({
                title: 'Screen Sharing Started',
                message: 'You are now sharing your screen.',
                type: 'success'
            });
        } catch (err) {
            console.error('Failed to share screen', err);
            this.showNotification({
                title: 'Screen Share Failed',
                message: 'Failed to start screen sharing.',
                type: 'error'
            });
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
        if (!message) return;

        try {
            const encryptedMsg = await this.encryptMessage(message);
            this.connection.send(JSON.stringify({
                type: 'message',
                message: encryptedMsg,
                displayName: this.displayName
            }));
            this.displayMessage(message, true);
            this.messageInput.value = '';
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    }

    displayMessage(message, isSent) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        messageElement.textContent = message;
        
        // Add display name as data attribute
        const displayName = isSent ? this.displayName : this.connection.metadata.displayName;
        messageElement.setAttribute('data-sender', displayName);
        
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
        this.updateParticipantsList();
        // Hide the join section completely
        this.joinSection.style.display = 'none';
    }

    leaveRoom() {
        // Show confirmation dialog using our notification system
        const notification = this.showNotification({
            title: 'Delete Room',
            message: 'Are you sure you want to permanently delete this room? This action cannot be undone.',
            type: 'error',
            duration: false
        });

        // Add confirm/cancel buttons
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 0.5rem;';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'destructive';
        confirmBtn.innerHTML = '<i data-lucide="shield-off" class="icon"></i>Delete Room';
        confirmBtn.style.padding = '0.5rem';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'secondary';
        cancelBtn.innerHTML = 'Cancel';
        cancelBtn.style.padding = '0.5rem';
        
        actions.appendChild(confirmBtn);
        actions.appendChild(cancelBtn);
        notification.querySelector('.notification-content').appendChild(actions);
        lucide.createIcons();

        cancelBtn.onclick = () => {
            notification.remove();
        };

        confirmBtn.onclick = () => {
            notification.remove();

            // End any active calls first
            if (this.isInCall) {
                this.endCall();
            }

            // Try to notify other participants if connected
            if (this.connection && this.isRoomOwner) {
                try {
                    this.connection.send(JSON.stringify({ type: 'owner-left' }));
                } catch (e) {
                    // Ignore connection errors during cleanup
                }
            }

            // Clear all data
            this.participants.clear();
            this.cleanupConnections();

            // Reset URL and state
            window.history.pushState({}, '', '/');
            this.isRoomOwner = false;
            this.hasPartner = false;
            this.encryptionKey = null;

            // Reset UI
            this.chatSection.classList.add('hidden');
            this.joinSection.classList.remove('hidden');
            this.joinSection.style.display = 'flex';
            this.messagesContainer.innerHTML = '';
            this.messageInput.value = '';
            this.roomIdInput.value = '';
            this.displayNameInput.value = '';
            this.updateConnectionStatus('disconnected');

            // Show success notification
            this.showNotification({
                title: 'Room Deleted',
                message: 'The room has been permanently deleted.',
                type: 'success'
            });

            // Reinitialize elements and icons
            this.initializeElements();
            lucide.createIcons();
        };
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

    updateParticipantsList() {
        const participantsList = document.getElementById('participants-list');
        const participantsContainer = document.querySelector('.participants-container');
        participantsList.innerHTML = '';
        
        // Add yourself first
        const selfParticipant = document.createElement('div');
        selfParticipant.className = 'participant';
        selfParticipant.innerHTML = `
            <span class="status"></span>
            <span>${this.displayName} (You)</span>
        `;
        participantsList.appendChild(selfParticipant);

        // Add toggle button if it doesn't exist
        let toggleButton = participantsContainer.querySelector('.toggle-participants');
        if (!toggleButton) {
            toggleButton = document.createElement('button');
            toggleButton.className = 'toggle-participants';
            toggleButton.innerHTML = 'Show All';
            participantsContainer.appendChild(toggleButton);
            
            toggleButton.addEventListener('click', () => {
                const isExpanded = participantsList.classList.toggle('expanded');
                toggleButton.innerHTML = isExpanded ? 'Hide' : 'Show All';
            });
        }

        // Add other participants
        this.participants.forEach(name => {
            const participantElement = document.createElement('div');
            participantElement.className = 'participant';
            participantElement.innerHTML = `
                <span class="status"></span>
                <span>${name}</span>
            `;
            participantsList.appendChild(participantElement);
        });

        // Check if we need the toggle button
        const participantsListRect = participantsList.getBoundingClientRect();
        const lastParticipant = participantsList.lastElementChild;
        const showToggle = lastParticipant && 
            (lastParticipant.offsetLeft + lastParticipant.offsetWidth) > 
            (participantsListRect.left + participantsListRect.width);

        toggleButton.classList.toggle('visible', showToggle);
        
        // If we hide the toggle, ensure the list is not expanded
        if (!showToggle && participantsList.classList.contains('expanded')) {
            participantsList.classList.remove('expanded');
            toggleButton.innerHTML = 'Show All';
        }
    }

    displaySystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.textContent = message;
        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Remove system message after 5 minutes
        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (messageElement.parentNode === this.messagesContainer) {
                    this.messagesContainer.removeChild(messageElement);
                }
            }, 200);
        }, 5 * 60 * 1000);
    }

    showNotification({ title, message, type = 'info', duration = 5000 }) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            <i data-lucide="${type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info'}" class="notification-icon"></i>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">
                <i data-lucide="x" class="icon"></i>
            </button>
        `;
        
        this.notificationContainer.appendChild(notification);
        lucide.createIcons();
        
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.onclick = () => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        };
        
        if (duration) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideOut 0.3s ease forwards';
                    setTimeout(() => notification.remove(), 300);
                }
            }, duration);
        }
        
        return notification;
    }

    generateAndSetRoomId() {
        const roomId = this.generateRoomId();
        this.roomIdInput.value = roomId;
        this.showNotification({
            title: 'Room ID Generated',
            message: 'A new room ID has been generated. Click Join to connect.',
            type: 'info'
        });
    }
}

// Initialize the application
const chatroom = new PrivateChatroom(); 
