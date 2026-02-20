// ===== CONFIGURAÇÃO DO WEBHOOK =====
const WEBHOOK_URL = "https://warm-polls-treasury-gay.trycloudflare.com/webhook/corvus";

// ===== SUPABASE =====
const SUPABASE_URL = "https://bjqarrswkxkgfdbxjuuj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqcWFycnN3a3hrZ2ZkYnhqdXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2OTc4OTQsImV4cCI6MjA4NDI3Mzg5NH0.3nv-46Q-NrxSXLblCmako_4APF5qeKS4L_IjRN2nOjk";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ESTADO DO USUÁRIO =====
let USER_ID = "web-user";
let USUARIO_PERFIL = null;
let IS_CONVIDADO = false;

// ===== CHATS =====
const STORAGE_KEY = "corvus_conversations_v1";
const ACTIVE_CHAT_KEY = "corvus_active_conversation_id";
let conversations = [];
let activeConversationId = null;

// ===== AUTENTICAÇÃO =====
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await loginComSucesso(session.user); return true; }
  if (sessionStorage.getItem("corvus_convidado")) { entrarComoConvidado(); return true; }
  mostrarTelaLogin();
  return false;
}

function mostrarTelaLogin() {
  document.getElementById("loginScreen").style.display = "flex";
}
function esconderTelaLogin() {
  document.getElementById("loginScreen").style.display = "none";
}

async function loginComSucesso(user) {
  USER_ID = user.id;
  IS_CONVIDADO = false;
  const { data: perfil } = await sb.from("msy_usuarios").select("*").eq("id", user.id).single();
  USUARIO_PERFIL = perfil;
  const nome = perfil?.nome_interno || perfil?.nome || user.email;
  const cargo = perfil?.sigla_cargo || perfil?.cargo || "Membro";
  document.getElementById("suiName").textContent = nome;
  document.getElementById("suiCargo").textContent = cargo;
  document.getElementById("suiAvatar").textContent = nome.charAt(0).toUpperCase();
  document.getElementById("sidebarUserInfo").style.display = "flex";
  esconderTelaLogin();
}

function entrarComoConvidado() {
  IS_CONVIDADO = true;
  USER_ID = "convidado_" + Date.now();
  USUARIO_PERFIL = { nome: "Convidado", tipo: "convidado" };
  sessionStorage.setItem("corvus_convidado", "true");
  document.getElementById("suiName").textContent = "Convidado";
  document.getElementById("suiCargo").textContent = "Acesso limitado";
  document.getElementById("suiAvatar").textContent = "C";
  document.getElementById("sidebarUserInfo").style.display = "flex";
  document.getElementById("guestBanner").innerHTML = '<div class="guest-banner">Você está como <span>convidado</span>. Algumas informações são restritas.</div>';
  esconderTelaLogin();
}

async function fazerLogout() {
  if (!IS_CONVIDADO) await sb.auth.signOut();
  sessionStorage.removeItem("corvus_convidado");
  location.reload();
}

// ===== SUPABASE: OPERAÇÕES DE CONVERSA =====
async function sbCarregarConversas() {
  const { data } = await sb
    .from("msy_conversas")
    .select("id, titulo, session_id, updated_at")
    .eq("usuario_id", USER_ID)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data || []).map(c => ({
    id: c.id,
    title: c.titulo,
    sessionId: c.session_id,
    updatedAt: new Date(c.updated_at).getTime(),
    createdAt: new Date(c.updated_at).getTime(),
    messages: []
  }));
}

async function sbCriarConversa(conv) {
  await sb.from("msy_conversas").insert({
    id: conv.id,
    usuario_id: USER_ID,
    titulo: conv.title,
    session_id: conv.sessionId,
    updated_at: new Date(conv.updatedAt).toISOString()
  });
}

async function sbAtualizarConversa(chatId, titulo, updatedAt) {
  await sb.from("msy_conversas").update({
    titulo,
    updated_at: new Date(updatedAt).toISOString()
  }).eq("id", chatId);
}

async function sbDeletarConversa(chatId) {
  await sb.from("msy_conversas").delete().eq("id", chatId);
}

async function sbCarregarMensagens(chatId) {
  const { data } = await sb
    .from("msy_mensagens")
    .select("role, texto, created_at")
    .eq("conversa_id", chatId)
    .order("created_at", { ascending: true });
  return (data || []).map(m => ({
    role: m.role,
    text: m.texto,
    timestamp: new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    createdAt: new Date(m.created_at).getTime()
  }));
}

async function sbSalvarMensagem(chatId, role, texto) {
  await sb.from("msy_mensagens").insert({ conversa_id: chatId, role, texto });
}

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
  // Ocultar tela de login até verificar sessão
  document.getElementById("loginScreen").style.display = "none";

  // Botões de login
  document.getElementById("loginBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginPassword").value;
    const btn = document.getElementById("loginBtn");
    const erro = document.getElementById("loginError");
    erro.style.display = "none";
    if (!email || !senha) { erro.textContent = "Preencha email e senha."; erro.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = "Aguarde...";
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) { erro.textContent = "Credenciais inválidas."; erro.style.display = "block"; btn.disabled = false; btn.textContent = "Acessar"; return; }
    await loginComSucesso(data.user);
    await inicializarApp();
  });

  document.getElementById("guestBtn")?.addEventListener("click", () => {
    entrarComoConvidado();
    inicializarApp();
  });

  document.getElementById("logoutBtn")?.addEventListener("click", fazerLogout);

  document.getElementById("loginPassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginBtn")?.click();
  });

  // Verificar sessão existente
  initAuth().then(async (autenticado) => {
    if (autenticado) await inicializarApp();
  });
});

async function inicializarApp() {
  initializeApp();
  initializeMobileMenu();
  ensureHistoryContainer();
  await loadConversationsFromStorage();
  ensureActiveConversation();
  renderChatList();
  if (!IS_CONVIDADO) {
    const conv = getActiveConversation();
    if (conv) {
      const msgs = await sbCarregarMensagens(conv.id);
      conv.messages = msgs;
    }
  }
  loadActiveConversationMessages();
  showWelcomeMessage();
}

function initializeApp() {
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const newChatBtn = document.getElementById("newChatBtn");
  const clearAllBtn = document.getElementById("clearAllChatsBtn");

  // Event Listeners
  sendBtn?.addEventListener("click", () => sendMessage());
  messageInput?.addEventListener("keydown", handleKeyDown);

  // "Novo Chat" agora cria nova conversa (não apaga tudo)
  newChatBtn?.addEventListener("click", async () => createNewConversation(true));

  // Botão "Limpar" (apaga TODAS as conversas e reseta)
  clearAllBtn?.addEventListener("click", () => {
    const ok = confirm("Deseja apagar TODAS as conversas? Isso não pode ser desfeito.");
    if (!ok) return;

    // Limpa storage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_CHAT_KEY);

    // Reseta estado em memória
    conversations = [];
    activeConversationId = null;

    // Recria uma conversa limpa
    ensureActiveConversation();

    // Limpa UI
    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) chatMessages.innerHTML = "";

    renderChatList();
    showWelcomeMessage();
    closeMobileMenu();
  });

  // Auto-resize textarea
  messageInput?.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + "px";
  });

  // Delegação de eventos na lista de chats (abrir/renomear/excluir)
  const chatList = document.getElementById("chatList");
  chatList?.addEventListener("click", (e) => {
    const target = e.target;

    const item = target.closest?.(".chat-item");
    if (!item) return;

    const chatId = item.getAttribute("data-chat-id");
    if (!chatId) return;

    // Clique em botões de ação
    if (target.closest(".chat-action-btn.rename")) {
      e.preventDefault();
      e.stopPropagation();
      renameConversation(chatId);
      return;
    }
    if (target.closest(".chat-action-btn.delete")) {
      e.preventDefault();
      e.stopPropagation();
      deleteConversation(chatId);
      return;
    }

    // Clique no item: abrir conversa
    setActiveConversation(chatId, true);
  });

  // (Opcional) busca, se existir input
  const searchInput = document.getElementById("searchInput");
  searchInput?.addEventListener("input", () => {
    renderChatList(searchInput.value.trim());
  });

  // Sugestões (se existir bloco de sugestões fora do welcome)
  const suggestionCards = document.querySelectorAll(".suggestion-card");
  suggestionCards.forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.getAttribute("data-prompt");
      if (prompt && messageInput) {
        messageInput.value = prompt;
        messageInput.focus();
        closeMobileMenu();
      }
    });
  });
}


// ===== MOBILE MENU =====
function initializeMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  menuToggle?.addEventListener("click", toggleMobileMenu);
  sidebarOverlay?.addEventListener("click", closeMobileMenu);

  document.addEventListener("keydown", (e) => {
    const sidebar = document.getElementById("sidebar");
    if (e.key === "Escape" && sidebar?.classList.contains("active")) {
      closeMobileMenu();
    }
  });
}

function toggleMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  menuToggle?.classList.toggle("active");
  sidebar?.classList.toggle("active");
  sidebarOverlay?.classList.toggle("active");

  document.body.style.overflow = sidebar?.classList.contains("active") ? "hidden" : "";
}

function closeMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  menuToggle?.classList.remove("active");
  sidebar?.classList.remove("active");
  sidebarOverlay?.classList.remove("active");
  document.body.style.overflow = "";
}

// ===== MENSAGENS / UI =====
function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function showWelcomeMessage() {
  const conv = getActiveConversation();
  if (!conv) return;

  if ((conv.messages || []).length === 0) {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;

    const welcomeHTML = `
      <div class="welcome-section" id="welcomeSection">
        <h2 class="welcome-title">Olá! Sou Corvus</h2>
        <p class="welcome-subtitle">
          Agente oficial da MSY. Posso te ajudar com informações sobre
          a Ordem Masayoshi, estrutura, valores e muito mais.
        </p>
        <div class="suggestions-grid">
          <div class="suggestion-card welcome-card" data-prompt="Quais são os valores da Ordem Masayoshi?">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <p>Quais são os valores da MSY?</p>
          </div>
          <div class="suggestion-card welcome-card" data-prompt="Explique a estrutura e cargos da Ordem Masayoshi.">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p>Estrutura e cargos da MSY</p>
          </div>
          <div class="suggestion-card welcome-card" data-prompt="O que é o Corvus 1.0 e quais são suas limitações?">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p>O que é o Corvus 1.0?</p>
          </div>
        </div>
      </div>
    `;

    chatMessages.innerHTML = welcomeHTML;

    // Eventos dos cards
    const welcomeCards = document.querySelectorAll(".welcome-card");
    welcomeCards.forEach((card) => {
      card.addEventListener("click", () => {
        const prompt = card.getAttribute("data-prompt");
        const input = document.getElementById("messageInput");
        if (!prompt || !input) return;
        input.value = prompt;
        input.focus();
        sendMessage();
      });
    });
  }
}

async function sendMessage() {
  const messageInput = document.getElementById("messageInput");
  const message = (messageInput?.value || "").trim();

  if (!message) return;
  if (!WEBHOOK_URL || WEBHOOK_URL === "COLOQUE_AQUI_A_URL_DO_WEBHOOK_DO_N8N") {
    appendMessage("corvus", "Erro: URL do webhook não configurada. Configure a variável WEBHOOK_URL no arquivo app.js.", false);
    return;
  }

  // Garantir conversa ativa
  ensureActiveConversation();
  const conv = getActiveConversation();
  if (!conv) return;

  // Limpar input e desabilitar botão
  messageInput.value = "";
  messageInput.style.height = "auto";
  setLoading(true);

  // Remover welcome ao começar conversa
  removeWelcomeIfPresent();

  // Mostrar mensagem do usuário
  await appendMessage("user", message);

  // Atualizar título automático (apenas se for a 1ª mensagem do usuário)
  autoTitleConversationIfNeeded(conv.id);

  // Mostrar indicador de digitação
  showTypingIndicator();

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        userId: USER_ID,
        sessionId: conv.sessionId,           // sessão por conversa
        conversationId: conv.id              // opcional (não exige mudança no n8n)
      }),
    });

    if (!response.ok) throw new Error("Falha na comunicação com o servidor");

    const rawData = await response.text();

    let data;
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      throw new Error("Resposta inválida do servidor");
    }

    removeTypingIndicator();

    if (Array.isArray(data)) data = data[0] || {};

    const reply =
      data.reply ||
      data.output ||
      data.response ||
      data.text ||
      data.message ||
      (data.choices && data.choices[0]?.message?.content) ||
      "Resposta não disponível";

    await appendMessage("corvus", reply);
  } catch (error) {
    removeTypingIndicator();
    await appendMessage("corvus", "Corvus está indisponível no momento. Erro: " + error.message);
  } finally {
    setLoading(false);
  }
}

async function appendMessage(role, text, saveToHistory = true) {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  const rawText = normalizeForStorage(text);        // salva texto puro
  const displayText = sanitizeForDisplay(rawText);  // render seguro com <br>

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;

  const timestamp = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Avatar: Corvus = imagem, User = letra U
  const avatarHTML =
    role === "corvus"
      ? `<img src="corvuslogo.png" alt="Corvus" class="avatar-image" />`
      : `<span>U</span>`;

  messageDiv.innerHTML = `
    <div class="message-avatar">${avatarHTML}</div>
    <div class="message-content">
      <div class="message-bubble">${displayText}</div>
      <div class="message-actions">
        <span class="message-timestamp">${timestamp}</span>
        ${
          role === "corvus"
            ? `
          <button class="btn-copy" onclick="copyMessage(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copiar
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;

  chatMessages.appendChild(messageDiv);
  scrollToBottom();

  if (saveToHistory) {
    await saveMessageToActiveConversation({
      role,
      text: rawText,
      timestamp,
      createdAt: Date.now(),
    });
  }
}


function showTypingIndicator() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  // Evita duplicar caso chame duas vezes
  const existing = document.getElementById("typingIndicator");
  if (existing) existing.remove();

  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-indicator";
  typingDiv.id = "typingIndicator";

  const avatarHTML = `<img src="corvuslogo.png" alt="Corvus" class="avatar-image" />`;

  typingDiv.innerHTML = `
    <div class="message-avatar">${avatarHTML}</div>
    <div class="message-content">
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div class="typing-text">
        Corvus pensando<span class="typing-ellipsis"></span>
      </div>
    </div>
  `;

  chatMessages.appendChild(typingDiv);
  scrollToBottom();
}


function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typingIndicator");
  if (typingIndicator) typingIndicator.remove();
}

function removeWelcomeIfPresent() {
  const welcome = document.getElementById("welcomeSection");
  if (welcome) welcome.remove();
}

function copyMessage(button) {
  const messageText = button.closest(".message-content").querySelector(".message-bubble").innerText;
  navigator.clipboard.writeText(messageText).then(() => {
    const originalText = button.innerHTML;
    button.innerHTML = '<span style="color: var(--color-primary);">✓ Copiado</span>';
    setTimeout(() => {
      button.innerHTML = originalText;
    }, 2000);
  });
}

// ===== UTILIDADES =====
// Para exibir no HTML (converte quebra de linha em <br> e evita XSS)
function sanitizeForDisplay(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML.replace(/\n/g, "<br>");
}

// Para salvar no storage (texto puro, sem <br>)
function normalizeForStorage(text) {
  return (text ?? "").toString();
}


function setLoading(isLoading) {
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  if (sendBtn) sendBtn.disabled = isLoading;
  if (messageInput) messageInput.disabled = isLoading;
}

function scrollToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;
  setTimeout(() => {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
  }, 100);
}

function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// ===== HISTÓRICO / CONVERSAS (LOCALSTORAGE) =====
function ensureHistoryContainer() {
  // Se seu HTML já tem <div id="chatList">, ok.
  let chatList = document.getElementById("chatList");
  if (chatList) return;

  // Caso não tenha, cria abaixo do botão Novo Chat
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = sidebar?.querySelector(".sidebar-content");
  const newChatBtn = document.getElementById("newChatBtn");

  if (!sidebarContent || !newChatBtn) return;

  chatList = document.createElement("div");
  chatList.id = "chatList";
  // Classe opcional: se seu CSS já estiliza, ok; caso contrário, não quebra.
  chatList.className = "chat-list";

  // Inserir logo após o botão
  newChatBtn.insertAdjacentElement("afterend", chatList);
}

async function loadConversationsFromStorage() {
  if (!IS_CONVIDADO) {
    // Membro: carregar do Supabase
    conversations = await sbCarregarConversas();
    const active = localStorage.getItem(ACTIVE_CHAT_KEY + "_" + USER_ID);
    activeConversationId = active || null;
  } else {
    // Convidado: localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    conversations = raw ? safeJsonParse(raw, []) : [];
    const active = localStorage.getItem(ACTIVE_CHAT_KEY);
    activeConversationId = active || null;
  }
}

function persistConversationsToStorage() {
  if (IS_CONVIDADO) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    if (activeConversationId) localStorage.setItem(ACTIVE_CHAT_KEY, activeConversationId);
  } else {
    // Membro: salvar ID ativo localmente, dados vão pro Supabase via funções específicas
    if (activeConversationId) localStorage.setItem(ACTIVE_CHAT_KEY + "_" + USER_ID, activeConversationId);
  }
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureActiveConversation() {
  // Se não tem conversas, cria a primeira
  if (!Array.isArray(conversations) || conversations.length === 0) {
    const first = makeConversation("Nova conversa");
    conversations = [first];
    activeConversationId = first.id;
    persistConversationsToStorage();
    return;
  }

  // Se id ativo não existe mais, seta a mais recente
  const exists = conversations.some((c) => c.id === activeConversationId);
  if (!activeConversationId || !exists) {
    const mostRecent = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    activeConversationId = mostRecent?.id || conversations[0].id;
    persistConversationsToStorage();
  }
}

function makeConversation(title) {
  const now = Date.now();
  return {
    id: "chat_" + now + "_" + Math.random().toString(36).slice(2, 10),
    title: title || "Nova conversa",
    createdAt: now,
    updatedAt: now,
    sessionId: generateSessionId(),
    messages: [],
  };
}

function getActiveConversation() {
  return conversations.find((c) => c.id === activeConversationId) || null;
}

async function setActiveConversation(chatId, closeMenuOnMobile = false) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  activeConversationId = chatId;
  persistConversationsToStorage();

  // Para membros, carregar mensagens do Supabase
  if (!IS_CONVIDADO) {
    const msgs = await sbCarregarMensagens(chatId);
    conv.messages = msgs;
  }

  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
  loadActiveConversationMessages();
  showWelcomeMessage();

  if (closeMenuOnMobile) closeMobileMenu();
}

async function createNewConversation(closeMenuOnMobile = false) {
  const conv = makeConversation("Nova conversa");
  conversations.unshift(conv);
  activeConversationId = conv.id;
  persistConversationsToStorage();

  if (!IS_CONVIDADO) {
    await sbCriarConversa(conv);
  }

  const chatMessages = document.getElementById("chatMessages");
  if (chatMessages) chatMessages.innerHTML = "";

  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
  showWelcomeMessage();

  if (closeMenuOnMobile) closeMobileMenu();
}

async function deleteConversation(chatId) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  const ok = confirm(`Excluir a conversa "${conv.title}"? Isso não pode ser desfeito.`);
  if (!ok) return;

  conversations = conversations.filter((c) => c.id !== chatId);

  // Se apagar a ativa, escolher outra; se não sobrar nenhuma, criar nova
  if (activeConversationId === chatId) {
    if (conversations.length === 0) {
      const fresh = makeConversation("Nova conversa");
      conversations = [fresh];
      activeConversationId = fresh.id;
    } else {
      activeConversationId = conversations[0].id;
    }

    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) chatMessages.innerHTML = "";
    loadActiveConversationMessages();
    showWelcomeMessage();
  }

  persistConversationsToStorage();
  if (!IS_CONVIDADO) await sbDeletarConversa(chatId);
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function renameConversation(chatId) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  const next = prompt("Novo nome da conversa:", conv.title);
  if (next === null) return; // cancelou

  const trimmed = next.trim();
  if (!trimmed) return;

  conv.title = trimmed;
  conv.updatedAt = Date.now();
  persistConversationsToStorage();
  if (!IS_CONVIDADO) await sbAtualizarConversa(conv.id, trimmed, conv.updatedAt);
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function autoTitleConversationIfNeeded(chatId) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  // Se já foi renomeada / já tem título diferente, não mexe
  if (conv.title && conv.title !== "Nova conversa") return;

  // Pega a primeira msg do usuário na conversa
  const firstUser = (conv.messages || []).find((m) => m.role === "user");
  if (!firstUser) return;

  const plain = stripHtml(firstUser.text || "").replace(/\s+/g, " ").trim();
  if (!plain) return;

  conv.title = plain.length > 32 ? plain.slice(0, 32).trim() + "…" : plain;
  conv.updatedAt = Date.now();
  persistConversationsToStorage();
  if (!IS_CONVIDADO) sbAtualizarConversa(conv.id, conv.title, conv.updatedAt);
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

async function saveMessageToActiveConversation(message) {
  const conv = getActiveConversation();
  if (!conv) return;

  conv.messages = conv.messages || [];
  conv.messages.push(message);
  conv.updatedAt = Date.now();

  persistConversationsToStorage();

  if (!IS_CONVIDADO) {
    await sbSalvarMensagem(conv.id, message.role, message.text);
    await sbAtualizarConversa(conv.id, conv.title, conv.updatedAt);
  }

  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function loadActiveConversationMessages() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  const conv = getActiveConversation();
  if (!conv) return;

  chatMessages.innerHTML = "";

  // Render das mensagens sem re-salvar
  (conv.messages || []).forEach((m) => {
    const text =
      typeof m.text === "string" && m.text.includes("<br")
        ? m.text.replace(/<br\s*\/?>/gi, "\n")
        : m.text;

    appendMessage(m.role, text, false);
  });
}


function renderChatList(filterText = "") {
  const chatList = document.getElementById("chatList");
  if (!chatList) return;

  const q = (filterText || "").toLowerCase();

  const list = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const filtered = q
    ? list.filter((c) => (c.title || "").toLowerCase().includes(q))
    : list;

  if (filtered.length === 0) {
    chatList.innerHTML = `<div class="chat-list-empty">Nenhuma conversa encontrada.</div>`;
    return;
  }

  chatList.innerHTML = filtered
    .map((c) => {
      const isActive = c.id === activeConversationId;
      const title = escapeHtml(c.title || "Nova conversa");
      const time = formatUpdatedAt(c.updatedAt);

      return `
        <div class="chat-item ${isActive ? "active" : ""}" data-chat-id="${c.id}" title="${title}">
          <div class="chat-item-main">
            <div class="chat-item-title">${title}</div>
            <div class="chat-item-meta">${time}</div>
          </div>
          <div class="chat-item-actions">
            <button class="chat-action-btn rename" aria-label="Renomear">✎</button>
            <button class="chat-action-btn delete" aria-label="Excluir">🗑</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function formatUpdatedAt(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " +
         d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
