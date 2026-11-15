(function () {
  "use strict";

  // Prevent multiple initializations
  if (window.__RagEngineWidgetLoaded) return;
  window.__RagEngineWidgetLoaded = true;

  // Find the current script tag to read configuration attributes
  const currentScript =
    document.currentScript ||
    (function () {
      const scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  const apiBase =
    currentScript?.getAttribute("data-api") ||
    window.location.origin ||
    "http://localhost:3000";
  const projectId =
    currentScript?.getAttribute("data-project-id") ||
    currentScript?.getAttribute("data-project") ||
    "";
  const projectToken =
    currentScript?.getAttribute("data-token") ||
    currentScript?.getAttribute("data-public-token") ||
    "";
  const knowledgeBaseId =
    currentScript?.getAttribute("data-kb") || "default";

  let widgetTitle =
    currentScript?.getAttribute("data-title") || "AI Assistant";
  let primaryColor =
    currentScript?.getAttribute("data-color") || "#2563eb";
  let welcomeMessage =
    currentScript?.getAttribute("data-welcome") ||
    "Hello! How can I help you today?";
  let suggestedQuestions = [
    "What services or options do you offer?",
    "Where can I find pricing or fees?",
    "What are your working hours and guidelines?",
  ];

  // Inject Styles with dynamic CSS custom properties
  const style = document.createElement("style");
  style.id = "rag-engine-widget-styles";
  style.textContent = `
    :root {
      --rag-primary: ${primaryColor};
    }
    .cnw-launcher {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: var(--rag-primary);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999999;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
      border: 2px solid rgba(255, 255, 255, 0.35);
    }
    .cnw-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.35);
    }
    .cnw-launcher svg {
      width: 26px;
      height: 26px;
      fill: #ffffff;
      transition: transform 0.2s ease;
    }
    .cnw-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      border: 2px solid #fff;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .cnw-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 410px;
      max-width: calc(100vw - 32px);
      height: 610px;
      max-height: calc(100vh - 120px);
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0,0,0,0.06);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s;
      opacity: 0;
      visibility: hidden;
      transform: translateY(20px) scale(0.96);
    }
    .cnw-window.cnw-open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }
    .cnw-header {
      background: var(--rag-primary);
      color: #ffffff;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .cnw-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cnw-avatar {
      width: 38px;
      height: 38px;
      background: rgba(255, 255, 255, 0.22);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 1px solid rgba(255,255,255,0.4);
    }
    .cnw-title {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
    }
    .cnw-subtitle {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.85);
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }
    .cnw-status-dot {
      width: 7px;
      height: 7px;
      background: #4ade80;
      border-radius: 50%;
      display: inline-block;
      box-shadow: 0 0 6px #4ade80;
    }
    .cnw-header-actions {
      display: flex;
      gap: 6px;
    }
    .cnw-btn-icon {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: #ffffff;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s;
    }
    .cnw-btn-icon:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .cnw-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cnw-msg {
      max-width: 86%;
      padding: 11px 15px;
      border-radius: 16px;
      font-size: 13.5px;
      line-height: 1.45;
      word-break: break-word;
    }
    .cnw-msg-user {
      align-self: flex-end;
      background: var(--rag-primary);
      color: #ffffff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
    }
    .cnw-msg-bot {
      align-self: flex-start;
      background: #ffffff;
      color: #1e293b;
      border-bottom-left-radius: 4px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
    }
    .cnw-suggestions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
    }
    .cnw-chip {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 12px;
      color: #334155;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
      display: inline-block;
    }
    .cnw-chip:hover {
      background: #e2e8f0;
      border-color: #94a3b8;
      transform: translateX(2px);
    }
    .cnw-sources-box {
      margin-top: 8px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
    }
    .cnw-sources-btn {
      background: transparent;
      border: none;
      color: #64748b;
      font-size: 11px;
      cursor: pointer;
      padding: 2px 0;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cnw-sources-btn:hover {
      color: #334155;
    }
    .cnw-sources-list {
      display: none;
      list-style: none;
      padding: 0;
      margin: 6px 0 0 0;
      gap: 6px;
      flex-direction: column;
    }
    .cnw-sources-list.cnw-expanded {
      display: flex;
    }
    .cnw-source-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 7px 9px;
      font-size: 11px;
    }
    .cnw-source-title {
      font-weight: 700;
      color: #1e293b;
    }
    .cnw-source-path {
      color: #64748b;
      font-size: 10px;
      margin: 1px 0;
    }
    .cnw-source-snippet {
      color: #475569;
      line-height: 1.35;
    }
    .cnw-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      width: fit-content;
    }
    .cnw-dot {
      width: 6px;
      height: 6px;
      background: #94a3b8;
      border-radius: 50%;
      animation: cnwBounce 1.4s infinite ease-in-out both;
    }
    .cnw-dot:nth-child(1) { animation-delay: -0.32s; }
    .cnw-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes cnwBounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
    .cnw-footer {
      padding: 12px;
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 8px;
    }
    .cnw-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      font-size: 13.5px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    .cnw-input:focus {
      border-color: var(--rag-primary);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
    }
    .cnw-btn-send {
      background: var(--rag-primary);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      padding: 0 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s;
    }
    .cnw-btn-send:hover { opacity: 0.9; }
    .cnw-btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
    .cnw-btn-send svg { width: 18px; height: 18px; fill: currentColor; }
    .cnw-powered {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      padding-bottom: 6px;
      background: #ffffff;
    }
  `;
  document.head.appendChild(style);

  // Create Widget Root Container
  const container = document.createElement("div");
  container.id = "rag-engine-widget-root";
  container.innerHTML = `
    <div class="cnw-launcher" id="cnwLauncher" title="Ask Assistant">
      <div class="cnw-badge" id="cnwBadge">Chat</div>
      <svg viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
      </svg>
    </div>

    <div class="cnw-window" id="cnwWindow">
      <div class="cnw-header">
        <div class="cnw-header-info">
          <div class="cnw-avatar" id="cnwAvatar">🤖</div>
          <div>
            <div class="cnw-title" id="cnwTitle">${widgetTitle}</div>
            <div class="cnw-subtitle">
              <span class="cnw-status-dot"></span> Verified Knowledge Base
            </div>
          </div>
        </div>
        <div class="cnw-header-actions">
          <button class="cnw-btn-icon" id="cnwClearBtn" title="Clear chat">↻</button>
          <button class="cnw-btn-icon" id="cnwCloseBtn" title="Close">✕</button>
        </div>
      </div>

      <div class="cnw-body" id="cnwChatBody">
        <div class="cnw-msg cnw-msg-bot" id="cnwWelcomeMsgBox">
          <div id="cnwWelcomeText">${welcomeMessage}</div>
          <div class="cnw-suggestions" id="cnwSuggestions"></div>
        </div>
      </div>

      <div class="cnw-footer">
        <input 
          type="text" 
          class="cnw-input" 
          id="cnwInput" 
          placeholder="Ask a question..." 
          autocomplete="off"
        />
        <button class="cnw-btn-send" id="cnwSendBtn" title="Send message">
          <svg viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
      <div class="cnw-powered" id="cnwPowered">Powered by AI RAG SaaS Platform</div>
    </div>
  `;
  document.body.appendChild(container);

  // Widget Elements
  const launcher = document.getElementById("cnwLauncher");
  const win = document.getElementById("cnwWindow");
  const closeBtn = document.getElementById("cnwCloseBtn");
  const clearBtn = document.getElementById("cnwClearBtn");
  const input = document.getElementById("cnwInput");
  const sendBtn = document.getElementById("cnwSendBtn");
  const chatBody = document.getElementById("cnwChatBody");
  const badge = document.getElementById("cnwBadge");
  const titleEl = document.getElementById("cnwTitle");
  const welcomeTextEl = document.getElementById("cnwWelcomeText");
  const suggestionsEl = document.getElementById("cnwSuggestions");
  const avatarEl = document.getElementById("cnwAvatar");

  let isOpen = false;
  let isSending = false;

  function renderSuggestions(questions) {
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = "";
    if (!questions || questions.length === 0) return;
    questions.forEach((q) => {
      const chip = document.createElement("span");
      chip.className = "cnw-chip";
      chip.textContent = q;
      chip.addEventListener("click", () => {
        if (!isSending) {
          input.value = q;
          sendMessage();
        }
      });
      suggestionsEl.appendChild(chip);
    });
  }

  // Fetch live widget config if projectId or token is provided
  if (projectId || projectToken) {
    const queryParams = new URLSearchParams();
    if (projectId) queryParams.set("projectId", projectId);
    if (projectToken) queryParams.set("token", projectToken);

    fetch(`${apiBase}/api/v1/widget/config?${queryParams.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        if (cfg.category === "college") avatarEl.textContent = "🎓";
        else if (cfg.category === "restaurant") avatarEl.textContent = "🍕";
        else if (cfg.category === "corporate") avatarEl.textContent = "💼";

        if (cfg.widgetConfig?.title) {
          widgetTitle = cfg.widgetConfig.title;
          titleEl.textContent = widgetTitle;
        }
        if (cfg.widgetConfig?.primaryColor) {
          primaryColor = cfg.widgetConfig.primaryColor;
          document.documentElement.style.setProperty("--rag-primary", primaryColor);
        }
        if (cfg.widgetConfig?.welcomeMessage) {
          welcomeMessage = cfg.widgetConfig.welcomeMessage;
          welcomeTextEl.textContent = welcomeMessage;
        }
        if (Array.isArray(cfg.widgetConfig?.suggestedQuestions)) {
          suggestedQuestions = cfg.widgetConfig.suggestedQuestions;
          renderSuggestions(suggestedQuestions);
        }
      })
      .catch(() => {
        // Fallback to initial defaults
        renderSuggestions(suggestedQuestions);
      });
  } else {
    renderSuggestions(suggestedQuestions);
  }

  function toggleWidget() {
    isOpen = !isOpen;
    if (isOpen) {
      win.classList.add("cnw-open");
      badge.style.display = "none";
      setTimeout(() => input.focus(), 150);
    } else {
      win.classList.remove("cnw-open");
    }
  }

  launcher.addEventListener("click", toggleWidget);
  closeBtn.addEventListener("click", toggleWidget);

  clearBtn.addEventListener("click", () => {
    chatBody.innerHTML = `
      <div class="cnw-msg cnw-msg-bot">
        <div>${welcomeMessage}</div>
        <div class="cnw-suggestions" id="cnwSuggestions"></div>
      </div>
    `;
    const newSuggestionsEl = document.getElementById("cnwSuggestions");
    if (newSuggestionsEl && suggestedQuestions) {
      suggestedQuestions.forEach((q) => {
        const chip = document.createElement("span");
        chip.className = "cnw-chip";
        chip.textContent = q;
        chip.addEventListener("click", () => {
          if (!isSending) {
            input.value = q;
            sendMessage();
          }
        });
        newSuggestionsEl.appendChild(chip);
      });
    }
  });

  function appendMessage(text, role, sources = []) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `cnw-msg ${role === "user" ? "cnw-msg-user" : "cnw-msg-bot"}`;

    let formattedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

    msgDiv.innerHTML = formattedText;

    if (sources && sources.length > 0) {
      const srcBox = document.createElement("div");
      srcBox.className = "cnw-sources-box";

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "cnw-sources-btn";
      toggleBtn.innerHTML = `📄 Sources (${sources.length}) ▾`;

      const srcList = document.createElement("ul");
      srcList.className = "cnw-sources-list";

      sources.forEach((s) => {
        const item = document.createElement("li");
        item.className = "cnw-source-item";
        item.innerHTML = `
          <div class="cnw-source-title">${s.source || "Knowledge Document"}</div>
          <div class="cnw-source-path">${s.headingPath ? s.headingPath.join(" &gt; ") : ""}</div>
          <div class="cnw-source-snippet">${(s.content || "").slice(0, 150)}...</div>
        `;
        srcList.appendChild(item);
      });

      toggleBtn.addEventListener("click", () => {
        srcList.classList.toggle("cnw-expanded");
        toggleBtn.innerHTML = srcList.classList.contains("cnw-expanded")
          ? `📄 Hide Sources ▴`
          : `📄 Sources (${sources.length}) ▾`;
      });

      srcBox.appendChild(toggleBtn);
      srcBox.appendChild(srcList);
      msgDiv.appendChild(srcBox);
    }

    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function showTypingIndicator() {
    const typing = document.createElement("div");
    typing.id = "cnwTypingIndicator";
    typing.className = "cnw-typing";
    typing.innerHTML = `
      <div class="cnw-dot"></div>
      <div class="cnw-dot"></div>
      <div class="cnw-dot"></div>
    `;
    chatBody.appendChild(typing);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById("cnwTypingIndicator");
    if (indicator) indicator.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isSending) return;

    appendMessage(text, "user");
    input.value = "";
    isSending = true;
    sendBtn.disabled = true;
    showTypingIndicator();

    try {
      const useV1 = Boolean(projectId || projectToken);
      const url = useV1 ? `${apiBase}/api/v1/chat` : `${apiBase}/api/chat`;

      const headers = { "Content-Type": "application/json" };
      if (projectToken) headers["x-project-token"] = projectToken;
      if (projectId) headers["x-project-id"] = projectId;

      const payload = useV1
        ? { query: text, projectId, token: projectToken }
        : { query: text, knowledgeBaseId };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      removeTypingIndicator();

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      appendMessage(data.answer || "No response received.", "bot", data.sources || []);
    } catch (err) {
      removeTypingIndicator();
      appendMessage(
        `⚠️ Sorry, I couldn't reach the knowledge base. (${err.message}).`,
        "bot"
      );
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
