// Encryption functions
const encryptMessage = (message, key) => {
    return CryptoJS.AES.encrypt(message, key).toString();
};

const decryptMessage = (encryptedMessage, key) => {
    const bytes = CryptoJS.AES.decrypt(encryptedMessage, key);
    return bytes.toString(CryptoJS.enc.Utf8);
};

// Generate a random room ID
const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// DOM Elements - Mobile
const welcomeScreen = document.getElementById('welcome-screen');
const roomScreen = document.getElementById('room-screen');
const usernameInput = document.getElementById('username');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const joinRoomSection = document.getElementById('join-room-section');
const joinRoomIdInput = document.getElementById('join-room-id');
const joinRoomConfirmBtn = document.getElementById('join-room-confirm');
const joinRoomBackBtn = document.getElementById('join-room-back');
const messageInput = document.getElementById('message-input');
const chatContainer = document.getElementById('chat-container');
const roomIdSpan = document.getElementById('room-id');
const participantsList = document.getElementById('participants-list');

// DOM Elements - Desktop
const welcomeScreenDesktop = document.getElementById('welcome-screen-desktop');
const roomScreenDesktop = document.getElementById('room-screen-desktop');
const usernameInputDesktop = document.getElementById('username-desktop');
const createRoomBtnDesktop = document.getElementById('create-room-desktop');
const joinRoomBtnDesktop = document.getElementById('join-room-desktop');
const joinRoomSectionDesktop = document.getElementById('join-room-section-desktop');
const joinRoomIdInputDesktop = document.getElementById('join-room-id-desktop');
const joinRoomConfirmBtnDesktop = document.getElementById('join-room-confirm-desktop');
const joinRoomBackBtnDesktop = document.getElementById('join-room-back-desktop');
const messageInputDesktop = document.getElementById('message-input-desktop');
const chatContainerDesktop = document.getElementById('chat-container-desktop');
const roomIdSpanDesktop = document.getElementById('room-id-desktop');
const participantsListDesktop = document.getElementById('participants-list-desktop');

// Modal Elements
const joinRoomModal = document.getElementById('join-room-modal');
const roomIdInput = document.getElementById('room-id-input');

// State
let currentRoom = null;
let currentUser = null;
let encryptionKey = null;
let messageCheckInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load CryptoJS library
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js';
    document.head.appendChild(script);

    // Add click handler for shield buttons (delete room)
    const deleteButtons = document.querySelectorAll('.action-button.delete');
    deleteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentRoom) {
                showConfirmDialog();
            }
        });
    });

    // Add click handler for send buttons
    const sendButtons = document.querySelectorAll('.send-button');
    sendButtons.forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            sendMessage(input);
        });
    });
});

// Show toast notification
const showToast = (message) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 2000); // Reduced duration to 2 seconds
};

// Copy room ID
window.copyRoomId = () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        showToast('Room ID copied to clipboard');
    });
};

// Modal functions
window.closeJoinModal = () => {
    joinRoomModal.classList.remove('visible');
    roomIdInput.value = '';
};

window.confirmJoinRoom = () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (!roomId) return;
    
    handleJoinRoom(currentUser || usernameInput.value || usernameInputDesktop.value, roomId);
    closeJoinModal();
};

// Helper function to handle room creation
const handleCreateRoom = (username) => {
    if (!username.trim()) {
        showToast('Please enter a username');
        return;
    }

    currentUser = username.trim();
    currentRoom = generateRoomId();
    encryptionKey = Math.random().toString(36).substring(2, 15);
    
    // Initialize room in localStorage
    localStorage.setItem(`room_${currentRoom}`, JSON.stringify({
        messages: [{
            type: 'system',
            content: `Room created by ${currentUser}`,
            timestamp: Date.now()
        }],
        created: Date.now(),
        createdBy: currentUser,
        lastUpdate: Date.now(),
        participants: [{ name: currentUser, joined: Date.now() }]
    }));

    showToast(`Room created: ${currentRoom}`);
    enterRoom();
    startMessageChecking();
};

// Update participants count
const updateParticipants = () => {
    if (!currentRoom) return;
    
    const roomData = JSON.parse(localStorage.getItem(`room_${currentRoom}`));
    if (!roomData) return;
    
    const participants = roomData.participants || [];
    
    // Update participant count
    const participantCountElements = document.querySelectorAll('.participants-count');
    participantCountElements.forEach(el => {
        el.textContent = participants.length;
    });
};

// Custom confirm dialog functions
window.showConfirmDialog = () => {
    const confirmDialog = document.getElementById('confirm-dialog');
    confirmDialog.classList.remove('hidden');
    confirmDialog.style.display = 'flex';
};

window.closeConfirmDialog = () => {
    const confirmDialog = document.getElementById('confirm-dialog');
    confirmDialog.classList.add('hidden');
    confirmDialog.style.display = 'none';
};

window.confirmDeleteRoom = () => {
    if (!currentRoom) return;
    
    // Add system message before deleting
    const roomData = JSON.parse(localStorage.getItem(`room_${currentRoom}`));
    if (roomData) {
        roomData.messages.push({
            type: 'system',
            content: 'Chat has been Deleted.',
            timestamp: Date.now()
        });
        roomData.lastUpdate = Date.now();
        localStorage.setItem(`room_${currentRoom}`, JSON.stringify(roomData));
    }
    
    // Small delay to ensure message is shown
    setTimeout(() => {
        localStorage.removeItem(`room_${currentRoom}`);
        
        if (messageCheckInterval) {
            clearInterval(messageCheckInterval);
            messageCheckInterval = null;
        }
        
        showToast('Room deleted');
        closeConfirmDialog();
        
        // Reset mobile view
        welcomeScreen.classList.remove('hidden');
        roomScreen.classList.add('hidden');
        
        // Reset desktop view
        welcomeScreenDesktop.classList.remove('hidden');
        roomScreenDesktop.classList.add('hidden');
        
        // Reset state
        currentRoom = null;
        currentUser = null;
        encryptionKey = null;
    }, 1000); // Increased delay to ensure message is visible
};

// Go back to welcome screen
window.goBack = (view) => {
    if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
        messageCheckInterval = null;
    }
    
    if (currentRoom) {
        const roomData = JSON.parse(localStorage.getItem(`room_${currentRoom}`));
        if (roomData) {
            roomData.participants = roomData.participants.filter(p => p.name !== currentUser);
            roomData.messages.push({
                type: 'system',
                content: `${currentUser} left the room`,
                timestamp: Date.now()
            });
            roomData.lastUpdate = Date.now();
            localStorage.setItem(`room_${currentRoom}`, JSON.stringify(roomData));
            
            // Small delay to ensure message is shown
            setTimeout(() => {
                if (view === 'desktop') {
                    welcomeScreenDesktop.classList.remove('hidden');
                    roomScreenDesktop.classList.add('hidden');
                } else {
                    welcomeScreen.classList.remove('hidden');
                    roomScreen.classList.add('hidden');
                }
                
                currentRoom = null;
                currentUser = null;
                encryptionKey = null;
            }, 500);
            return;
        }
    }
    
    if (view === 'desktop') {
        welcomeScreenDesktop.classList.remove('hidden');
        roomScreenDesktop.classList.add('hidden');
    } else {
        welcomeScreen.classList.remove('hidden');
        roomScreen.classList.add('hidden');
    }
    
    currentRoom = null;
    currentUser = null;
    encryptionKey = null;
};

// Start checking for new messages
const startMessageChecking = () => {
    if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
    }
    
    messageCheckInterval = setInterval(() => {
        if (currentRoom) {
            const roomData = JSON.parse(localStorage.getItem(`room_${currentRoom}`));
            if (roomData && roomData.lastUpdate > Date.now() - 1000) {
                loadMessages();
                updateParticipants();
            }
        }
    }, 500);
};

// Create Room Event Listeners
createRoomBtn.addEventListener('click', () => handleCreateRoom(usernameInput.value));
createRoomBtnDesktop.addEventListener('click', () => handleCreateRoom(usernameInputDesktop.value));

// Join Room Event Listeners
joinRoomBtn.addEventListener('click', () => {
    joinRoomSection.classList.remove('hidden');
    joinRoomBtn.classList.add('hidden');
    createRoomBtn.classList.add('hidden');
});

joinRoomBtnDesktop.addEventListener('click', () => {
    joinRoomSectionDesktop.classList.remove('hidden');
    joinRoomBtnDesktop.classList.add('hidden');
    createRoomBtnDesktop.classList.add('hidden');
});

// Back Button Event Listeners
joinRoomBackBtn.addEventListener('click', () => {
    joinRoomSection.classList.add('hidden');
    joinRoomBtn.classList.remove('hidden');
    createRoomBtn.classList.remove('hidden');
    joinRoomIdInput.value = '';
});

joinRoomBackBtnDesktop.addEventListener('click', () => {
    joinRoomSectionDesktop.classList.add('hidden');
    joinRoomBtnDesktop.classList.remove('hidden');
    createRoomBtnDesktop.classList.remove('hidden');
    joinRoomIdInputDesktop.value = '';
});

joinRoomConfirmBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim().toUpperCase();
    handleJoinRoom(usernameInput.value, roomId);
});

joinRoomConfirmBtnDesktop.addEventListener('click', () => {
    const roomId = joinRoomIdInputDesktop.value.trim().toUpperCase();
    handleJoinRoom(usernameInputDesktop.value, roomId);
});

// Enter Room
const enterRoom = () => {
    // Update mobile view
    welcomeScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    roomIdSpan.textContent = currentRoom;
    
    // Update desktop view
    welcomeScreenDesktop.classList.add('hidden');
    roomScreenDesktop.classList.remove('hidden');
    roomIdSpanDesktop.textContent = currentRoom;
    
    loadMessages();
    updateParticipants();
};

// Display Message
function displayMessage(username, message, timestamp, isSent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.dataset.timestamp = timestamp;
    messageDiv.dataset.username = username;
    
    const usernameSpan = document.createElement('div');
    usernameSpan.className = 'username';
    usernameSpan.textContent = username;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = message;
    
    const timeSpan = document.createElement('div');
    timeSpan.className = 'timestamp';
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.appendChild(usernameSpan);
    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(timeSpan);

    // Function to add message to container
    const addMessageToContainer = (container) => {
        const lastGroup = container.lastElementChild;
        const lastMessage = lastGroup?.lastElementChild;
        const lastUsername = lastMessage?.dataset.username;
        
        if (lastGroup && lastUsername === username) {
            // Add to existing group
            const newMessage = messageDiv.cloneNode(true);
            newMessage.querySelector('.username').style.display = 'none';
            lastGroup.appendChild(newMessage);
        } else {
            // Create new message group
            const groupDiv = document.createElement('div');
            groupDiv.className = 'message-group';
            const newMessage = messageDiv.cloneNode(true);
            groupDiv.appendChild(newMessage);
            container.appendChild(groupDiv);
        }
    };

    // Add to both containers
    addMessageToContainer(chatContainer);
    addMessageToContainer(chatContainerDesktop);

    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    chatContainerDesktop.scrollTop = chatContainerDesktop.scrollHeight;
}

// Load Messages
const loadMessages = () => {
    const roomData = JSON.parse(localStorage.getItem(`room_${currentRoom}`));
    if (!roomData || !roomData.messages) return;
    
    chatContainer.innerHTML = '';
    chatContainerDesktop.innerHTML = '';
    
    roomData.messages.forEach((msg) => {
        if (msg.type === 'system') {
            // Handle system messages (join/leave notifications)
            const systemMsg = document.createElement('div');
            systemMsg.className = 'system-message';
            systemMsg.textContent = msg.content;
            chatContainer.appendChild(systemMsg);
            chatContainerDesktop.appendChild(systemMsg.cloneNode(true));
            return;
        }

        try {
            const decryptedMsg = decryptMessage(msg.content, msg.encryptionKey || encryptionKey);
            if (!decryptedMsg) throw new Error('Failed to decrypt message');
            
            displayMessage(msg.username, decryptedMsg, msg.timestamp, msg.username === currentUser);
        } catch (error) {
            console.error('Failed to decrypt message:', error);
        }
    });
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
    chatContainerDesktop.scrollTop = chatContainerDesktop.scrollHeight;
};

// Handle message input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(messageInput);
    }
});

messageInputDesktop.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(messageInputDesktop);
    }
});

function sendMessage(inputElement) {
    const message = inputElement.value.trim();
    if (!message) return;

    const encryptedMessage = encryptMessage(message, encryptionKey);
    const messageData = {
        username: currentUser,
        content: encryptedMessage,
        timestamp: Date.now(),
        encryptionKey: encryptionKey // Include the encryption key with each message
    };

    // Save to localStorage
    const roomData = JSON.parse(localStorage.getItem(`room_${currentRoom}`));
    roomData.messages.push(messageData);
    roomData.lastUpdate = Date.now();
    localStorage.setItem(`room_${currentRoom}`, JSON.stringify(roomData));

    // Display message in both views
    displayMessage(currentUser, message, messageData.timestamp, true);
    
    // Clear input in both views
    messageInput.value = '';
    messageInputDesktop.value = '';
    
    // Scroll both chat containers
    chatContainer.scrollTop = chatContainer.scrollHeight;
    chatContainerDesktop.scrollTop = chatContainerDesktop.scrollHeight;
}

// Helper function to handle room joining
const handleJoinRoom = (username, roomId = null) => {
    if (!username.trim()) {
        showToast('Please enter a username');
        return;
    }

    if (!roomId) {
        showToast('Please enter a Room ID');
        return;
    }

    const roomData = JSON.parse(localStorage.getItem(`room_${roomId}`));
    if (!roomData) {
        showToast('Room not found');
        return;
    }

    currentUser = username.trim();
    currentRoom = roomId;
    // Use the room's encryption key from the first message
    if (roomData.messages && roomData.messages.length > 0) {
        try {
            // Find first non-system message
            const firstMessage = roomData.messages.find(msg => msg.type !== 'system');
            if (firstMessage) {
                const testKey = firstMessage.encryptionKey;
                const decryptTest = decryptMessage(firstMessage.content, testKey);
                if (decryptTest) {
                    encryptionKey = testKey;
                } else {
                    showToast('Failed to join room: Invalid encryption key');
                    return;
                }
            } else {
                // If no messages yet, this is effectively a new room
                encryptionKey = Math.random().toString(36).substring(2, 15);
            }
        } catch (error) {
            showToast('Failed to join room: Invalid encryption key');
            return;
        }
    } else {
        // If no messages yet, this is effectively a new room
        encryptionKey = Math.random().toString(36).substring(2, 15);
    }
    
    // Add participant to room
    roomData.participants = roomData.participants || [];
    if (!roomData.participants.find(p => p.name === currentUser)) {
        roomData.participants.push({ name: currentUser, joined: Date.now() });
        roomData.messages.push({
            type: 'system',
            content: `${currentUser} joined the room`,
            timestamp: Date.now()
        });
    }
    
    localStorage.setItem(`room_${currentRoom}`, JSON.stringify(roomData));
    showToast('Joined room successfully');
    enterRoom();
    startMessageChecking();
}; 
