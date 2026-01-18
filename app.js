// app.js

// ===== CONFIGURAÇÃO DO WEBHOOK =====
// Cole aqui a URL do seu webhook do n8n
const WEBHOOK_URL = "https://warm-polls-treasury-gay.trycloudflare.com/webhook/corvus";
// Exemplo: "https://seu-n8n.com/webhook/corvus"

// ===== CONFIGURAÇÃO DE USUÁRIO =====
const USER_ID = "web-user";
let sessionId = generateSessionId();

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadChatHistory();
    showWelcomeMessage();
});

function initializeApp() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const newChatBtn = document.getElementById('newChatBtn');
    const suggestionCards = document.querySelectorAll('.suggestion-card');

    // Event Listeners
    sendBtn.addEventListener('click', () => sendMessage());
    messageInput.addEventListener('keydown', handleKeyDown);
    newChatBtn.addEventListener('click', clearChat);
    
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            messageInput.value = prompt;
            messageInput.focus();
        });
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// ===== MENSAGENS =====
function showWelcomeMessage() {
    if (getChatHistory().length === 0) {
        appendMessage('corvus', 'Sou Corvus, agente oficial da MSY. Faça sua pergunta.', false);
    }
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message) return;
    if (!WEBHOOK_URL || WEBHOOK_URL === "COLOQUE_AQUI_A_URL_DO_WEBHOOK_DO_N8N") {
        appendMessage('corvus', 'Erro: URL do webhook não configurada. Configure a variável WEBHOOK_URL no arquivo app.js.', false);
        return;
    }

    // Limpar input e desabilitar botão
    messageInput.value = '';
    messageInput.style.height = 'auto';
    setLoading(true);

    // Mostrar mensagem do usuário
    appendMessage('user', message);

    // Mostrar indicador de digitação
    showTypingIndicator();

    try {
    console.log('Enviando mensagem:', message); // DEBUG
    
    const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: message,
            userId: USER_ID,
            sessionId: sessionId
        })
    });

    console.log('Status da resposta:', response.status); // DEBUG

    if (!response.ok) {
        throw new Error('Falha na comunicação com o servidor');
    }

    const rawData = await response.text(); // Pegar como texto primeiro
    console.log('Resposta bruta:', rawData); // DEBUG
    
    let data;
    try {
        data = JSON.parse(rawData); // Tentar parsear
    } catch (e) {
        console.error('Erro ao parsear JSON:', e);
        throw new Error('Resposta inválida do servidor');
    }

    console.log('Dados parseados:', data); // DEBUG
    
    // Remover indicador de digitação
    removeTypingIndicator();

    // Processar resposta com TODAS as possibilidades
    let reply;
    
    // Se vier array, pega primeiro item
    if (Array.isArray(data)) {
        data = data[0] || {};
    }
    
    // Tentar todas as variações possíveis
    reply = data.reply || 
            data.output || 
            data.response || 
            data.text ||
            data.message ||
            (data.choices && data.choices[0]?.message?.content) ||
            'Resposta não disponível';

    console.log('Reply final:', reply); // DEBUG
    
    appendMessage('corvus', reply);

} catch (error) {
    console.error('Erro completo:', error); // DEBUG
    removeTypingIndicator();
    appendMessage('corvus', 'Corvus está indisponível no momento. Erro: ' + error.message);
} finally {
    setLoading(false);
}

}

function appendMessage(role, text, saveToHistory = true) {
    const chatMessages = document.getElementById('chatMessages');
    
    // Sanitizar texto
    const sanitizedText = sanitize(text);
    
    // Criar elemento de mensagem
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${role === 'user' ? 'U' : 'C'}</div>
        <div class="message-content">
            <div class="message-bubble">${sanitizedText}</div>
            <div class="message-actions">
                <span class="message-timestamp">${timestamp}</span>
                ${role === 'corvus' ? `
                    <button class="btn-copy" onclick="copyMessage(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copiar
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    
    // Salvar no histórico
    if (saveToHistory) {
        saveChatHistory({ role, text: sanitizedText, timestamp });
    }
}

function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="message-avatar">C</div>
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function copyMessage(button) {
    const messageText = button.closest('.message-content').querySelector('.message-bubble').innerText;
    navigator.clipboard.writeText(messageText).then(() => {
        const originalText = button.innerHTML;
        button.innerHTML = '<span style="color: var(--color-primary);">✓ Copiado</span>';
        setTimeout(() => {
            button.innerHTML = originalText;
        }, 2000);
    });
}

function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    localStorage.removeItem('chatHistory');
    sessionId = generateSessionId();
    showWelcomeMessage();
}

// ===== UTILIDADES =====
function sanitize(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

function setLoading(isLoading) {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    sendBtn.disabled = isLoading;
    messageInput.disabled = isLoading;
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    setTimeout(() => {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ===== PERSISTÊNCIA =====
function saveChatHistory(message) {
    let history = getChatHistory();
    history.push(message);
    localStorage.setItem('chatHistory', JSON.stringify(history));
}

function getChatHistory() {
    const history = localStorage.getItem('chatHistory');
    return history ? JSON.parse(history) : [];
}

function loadChatHistory() {
    const history = getChatHistory();
    history.forEach(msg => {
        appendMessage(msg.role, msg.text, false);
    });
}

