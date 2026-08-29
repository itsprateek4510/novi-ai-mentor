// NOVI Chat Application

// State
let currentUser = null;
let currentConversation = null;
let conversations = [];
let currentView = 'chat';

// API Configuration
const API_BASE = window.location.origin;

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const conversationsList = document.getElementById('conversationsList');
const authModal = document.getElementById('authModal');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const storedUser = localStorage.getItem('novi_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        hideAuthModal();
        loadConversations();
    } else {
        showAuthModal();
    }
    
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
});

// Auth Functions
function showAuthModal() {
    authModal.classList.remove('hidden');
}

function hideAuthModal() {
    authModal.classList.add('hidden');
    updateUserUI();
}

function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    const forms = document.querySelectorAll('.auth-form');
    forms.forEach(f => f.style.display = 'none');
    
    if (tab === 'login') {
        tabs[0].classList.add('active');
        document.getElementById('loginForm').style.display = 'flex';
    } else {
        tabs[1].classList.add('active');
        document.getElementById('signupForm').style.display = 'flex';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (response.ok) {
            currentUser = await response.json();
            localStorage.setItem('novi_user', JSON.stringify(currentUser));
            hideAuthModal();
            loadConversations();
        } else {
            const error = await response.json();
            alert(error.detail || 'Login failed');
        }
    } catch (error) {
        alert('Connection error. Please try again.');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const data = {
        email: document.getElementById('signupEmail').value,
        password: document.getElementById('signupPassword').value,
        first_name: document.getElementById('signupFirstName').value,
        last_name: document.getElementById('signupLastName').value,
        grade: parseInt(document.getElementById('signupGrade').value),
        school: document.getElementById('signupSchool').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            currentUser = await response.json();
            localStorage.setItem('novi_user', JSON.stringify(currentUser));
            hideAuthModal();
            
            setTimeout(() => {
                sendQuickMessage(`Hi Novi! I'm ${currentUser.first_name}, a Grade ${currentUser.grade} student. I'm excited to start this journey!`);
            }, 500);
        } else {
            const error = await response.json();
            alert(error.detail || 'Signup failed');
        }
    } catch (error) {
        alert('Connection error. Please try again.');
    }
}

function updateUserUI() {
    if (currentUser) {
        const userName = currentUser.first_name || 'Student';
        document.querySelector('.user-name').textContent = userName;
        document.querySelector('.user-avatar').textContent = userName.charAt(0).toUpperCase();
    }
}

// View Switching
function switchView(view) {
    currentView = view;
    
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    event.target.closest('.nav-tab').classList.add('active');
    
    const chatView = document.getElementById('chatView');
    const dashboardView = document.getElementById('dashboardView');
    const sidebarChatContent = document.getElementById('sidebarChatContent');
    
    if (view === 'chat') {
        chatView.style.display = 'flex';
        dashboardView.style.display = 'none';
        sidebarChatContent.style.display = 'block';
    } else {
        chatView.style.display = 'none';
        dashboardView.style.display = 'block';
        sidebarChatContent.style.display = 'none';
        loadDashboard();
    }
}

// Conversation Functions
async function loadConversations() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/conversations/${currentUser.id}`);
        if (response.ok) {
            conversations = await response.json();
            renderConversations();
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

function renderConversations() {
    conversationsList.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}" 
             onclick="loadConversation(${conv.id})">
            <div class="conversation-title">${conv.title || 'New Chat'}</div>
            <div class="conversation-time">${formatTime(conv.updated_at)}</div>
        </div>
    `).join('');
}

async function loadConversation(conversationId) {
    try {
        const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`);
        if (response.ok) {
            const messages = await response.json();
            currentConversation = conversations.find(c => c.id === conversationId);
            
            welcomeScreen.style.display = 'none';
            chatMessages.style.display = 'flex';
            chatMessages.innerHTML = '';
            
            messages.forEach(msg => {
                addMessageToUI(msg.role, msg.content, new Date(msg.created_at));
            });
            
            renderConversations();
        }
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

function startNewConversation() {
    currentConversation = null;
    welcomeScreen.style.display = 'flex';
    chatMessages.style.display = 'none';
    chatMessages.innerHTML = '';
    renderConversations();
}

// Message Functions
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !currentUser) return;
    
    welcomeScreen.style.display = 'none';
    chatMessages.style.display = 'flex';
    
    addMessageToUI('user', message);
    messageInput.value = '';
    
    const typingDiv = showTypingIndicator();
    
    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                user_id: currentUser.id,
                conversation_id: currentConversation?.id
            })
        });
        
        typingDiv.remove();
        
        if (response.ok) {
            const data = await response.json();
            addMessageToUI('assistant', data.message);
            
            if (!currentConversation) {
                currentConversation = { id: data.conversation_id };
                loadConversations();
            }
        } else {
            addMessageToUI('assistant', 'Sorry, I encountered an error. Please try again.');
        }
    } catch (error) {
        typingDiv.remove();
        addMessageToUI('assistant', 'Connection error. Please check if the server is running.');
    }
}

function sendQuickMessage(message) {
    messageInput.value = message;
    sendMessage();
}

function addMessageToUI(role, content, timestamp = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = role === 'user' ? 
        (currentUser?.first_name?.charAt(0) || 'S') : 'N';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-text">${formatMessage(content)}</div>
            <div class="message-time">${formatTime(timestamp || new Date())}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.innerHTML = `
        <div class="message-avatar">N</div>
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return typingDiv;
}

// Dashboard Functions
async function loadDashboard() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/user/${currentUser.id}/dashboard`);
        if (response.ok) {
            const data = await response.json();
            renderDashboard(data);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function renderDashboard(data) {
    // Stats
    document.getElementById('statMessages').textContent = data.stats?.total_messages || 0;
    document.getElementById('statConversations').textContent = data.stats?.total_conversations || 0;
    document.getElementById('statGoals').textContent = data.goals?.length || 0;
    document.getElementById('statInterests').textContent = data.career_dna?.interests?.length || 0;
    
    // Career DNA - Interests
    const dnaGrid = document.getElementById('careerDnaGrid');
    const interests = data.career_dna?.interests || [];
    const strengths = data.career_dna?.strengths || [];
    const careerZones = data.career_dna?.career_zones || [];
    
    if (interests.length || strengths.length || careerZones.length) {
        const icons = ['💡', '⚡', '🌟', '🎨', '🔬', '📐', '🎵', '💪', '🎯', '🚀'];
        let html = '';
        
        interests.forEach((item, i) => {
            html += `<div class="dna-tag"><span class="tag-icon">${icons[i % icons.length]}</span>${item}</div>`;
        });
        strengths.forEach((item, i) => {
            html += `<div class="dna-tag"><span class="tag-icon">💪</span>${item}</div>`;
        });
        careerZones.forEach((item, i) => {
            html += `<div class="dna-tag"><span class="tag-icon">🏢</span>${item}</div>`;
        });
        
        dnaGrid.innerHTML = html;
    } else {
        dnaGrid.innerHTML = '<div class="dna-empty">Start chatting with Novi to build your Career DNA!</div>';
    }
    
    // Traits
    const traitsContainer = document.getElementById('traitsContainer');
    const traits = data.career_dna?.traits || {};
    
    if (Object.keys(traits).length) {
        let html = '';
        for (const [trait, value] of Object.entries(traits)) {
            const pct = Math.round(value * 100);
            html += `
                <div class="trait-row">
                    <div class="trait-name">${trait.replace(/_/g, ' ')}</div>
                    <div class="trait-bar-bg"><div class="trait-bar" style="width: ${pct}%"></div></div>
                    <div class="trait-value">${pct}%</div>
                </div>`;
        }
        traitsContainer.innerHTML = html;
    } else {
        traitsContainer.innerHTML = '<div class="dna-empty">Traits will appear as you chat more</div>';
    }
    
    // Goals
    const goalsList = document.getElementById('goalsList');
    const goals = data.goals || [];
    
    if (goals.length) {
        const catColors = { academic: '#22c55e', career: '#6366f1', personal: '#f59e0b', extracurricular: '#ec4899' };
        goalsList.innerHTML = goals.map(g => `
            <div class="goal-item">
                <div class="goal-dot" style="background: ${catColors[g.category] || '#6366f1'}"></div>
                <div class="goal-title">${g.title}</div>
                <div class="goal-category">${g.category}</div>
            </div>
        `).join('');
    } else {
        goalsList.innerHTML = '<div class="dna-empty">Goals will be created as you discuss them with Novi</div>';
    }
    
    // Letta Memory
    const memoryDisplay = document.getElementById('lettaMemoryDisplay');
    const memory = data.letta_memory || {};
    
    if (Object.keys(memory).length) {
        memoryDisplay.innerHTML = Object.entries(memory).map(([label, value]) => `
            <div class="memory-block">
                <div class="memory-label">${label}</div>
                <div class="memory-value">${value}</div>
            </div>
        `).join('');
    } else {
        memoryDisplay.innerHTML = '<div class="dna-empty">Memory builds as you chat</div>';
    }
}

// Utility Functions
function formatMessage(content) {
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return d.toLocaleDateString();
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
});
