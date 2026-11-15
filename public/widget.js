(function () {
  "use strict";

  // Prevent multiple initializations
  if (window.__CampusNoticeWidgetLoaded) return;
  window.__CampusNoticeWidgetLoaded = true;

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
  const knowledgeBaseId =
    currentScript?.getAttribute("data-kb") || "college-notices";
  const widgetTitle =
    currentScript?.getAttribute("data-title") || "College Notice Assistant";
  const primaryColor =
    currentScript?.getAttribute("data-color") || "#1e40af";
  const welcomeMessage =
    currentScript?.getAttribute("data-welcome") ||
    "Hello! I am your College Notice Assistant. Ask me anything about exam timetables, fee deadlines, academic circulars, or hostel guidelines.";

  // Inject Styles
  const style = document.createElement("style");
  style.id = "campus-notice-widget-styles";
  style.textContent = `
    .cnw-launcher {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${primaryColor};
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999999;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
      border: 2px solid rgba(255, 255, 255, 0.3);
    }
    .cnw-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.35);
    }
    .cnw-launcher svg {
      width: 28px;
      height: 28px;
      fill: #ffffff;
      transition: transform 0.2s ease;
    }
    .cnw-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 10px;
      border: 2px solid #fff;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .cnw-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 400px;
      max-width: calc(100vw - 32px);
      height: 600px;
      max-height: calc(100vh - 120px);
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0,0,0,0.06);
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
      background: ${primaryColor};
      color: #ffffff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .cnw-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cnw-avatar {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .cnw-title {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
    }
    .cnw-subtitle {
      font-size: 11px;
      opacity: 0.85;
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }
    .cnw-status-dot {
      width: 7px;
      height: 7px;
      background: #10b981;
      border-radius: 50%;
      display: inline-block;
    }
    .cnw-header-actions {
      display: flex;
      gap: 8px;
    }
    .cnw-btn-icon {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
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
      max-width: 85%;
      padding: 12px 14px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.5;
      word-break: break-word;
      animation: cnwFadeIn 0.2s ease-out;
    }
    @keyframes cnwFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .cnw-msg-user {
      align-self: flex-end;
      background: ${primaryColor};
      color: #ffffff;
      border-bottom-right-radius: 3px;
    }
    .cnw-msg-bot {
      align-self: flex-start;
      background: #ffffff;
      color: #1e293b;
      border: 1px solid #e2e8f0;
      border-bottom-left-radius: 3px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .cnw-sources-box {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
      font-size: 11px;
    }
    .cnw-sources-btn {
      background: #e2e8f0;
      border: none;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      color: #334155;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .cnw-sources-list {
      display: none;
      margin-top: 6px;
      padding-left: 0;
      list-style: none;
    }
    .cnw-sources-list.cnw-expanded {
      display: block;
    }
    .cnw-source-item {
      background: #f1f5f9;
      padding: 6px 8px;
      border-radius: 6px;
      margin-bottom: 4px;
      border-left: 3px solid ${primaryColor};
    }
    .cnw-source-title {
      font-weight: 600;
      color: #0f172a;
    }
    .cnw-source-path {
      color: #64748b;
      font-size: 10px;
    }
    .cnw-source-snippet {
      color: #475569;
      margin-top: 3px;
      font-size: 10.5px;
      white-space: pre-wrap;
      max-height: 80px;
      overflow-y: auto;
    }
    .cnw-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .cnw-chip {
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 4px 10px;
      font-size: 11.5px;
      color: #334155;
      cursor: pointer;
      transition: all 0.15s;
    }
    .cnw-chip:hover {
      background: #dbeafe;
      border-color: #93c5fd;
      color: #1d4ed8;
    }
    .cnw-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      width: fit-content;
    }
    .cnw-dot {
      width: 6px;
      height: 6px;
      background: #94a3b8;
      border-radius: 50%;
      animation: cnwPulse 1.2s infinite ease-in-out;
    }
    .cnw-dot:nth-child(2) { animation-delay: 0.2s; }
    .cnw-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cnwPulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
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
      border-color: ${primaryColor};
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
    }
    .cnw-btn-send {
      background: ${primaryColor};
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
    .cnw-btn-send:hover {
      opacity: 0.9;
    }
    .cnw-btn-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .cnw-btn-send svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    .cnw-powered {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      padding-bottom: 6px;
      background: #ffffff;
    }
  `;
  document.head.appendChild(style);

  // Create Container
  const container = document.createElement("div");
  container.id = "campus-notice-widget-root";
  container.innerHTML = `
    <div class="cnw-launcher" id="cnwLauncher" title="Ask College Notice Bot">
      <div class="cnw-badge" id="cnwBadge">Notices</div>
      <svg viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
      </svg>
    </div>

    <div class="cnw-window" id="cnwWindow">
      <div class="cnw-header">
        <div class="cnw-header-info">
          <div class="cnw-avatar">🎓</div>
          <div>
            <div class="cnw-title">${widgetTitle}</div>
            <div class="cnw-subtitle">
              <span class="cnw-status-dot"></span> Verified Notice Database
            </div>
          </div>
        </div>
        <div class="cnw-header-actions">
          <button class="cnw-btn-icon" id="cnwClearBtn" title="Clear chat">↻</button>
          <button class="cnw-btn-icon" id="cnwCloseBtn" title="Close">✕</button>
        </div>
      </div>

      <div class="cnw-body" id="cnwChatBody">
        <div class="cnw-msg cnw-msg-bot">
          ${welcomeMessage}
          <div class="cnw-suggestions" id="cnwSuggestions">
            <span class="cnw-chip" data-q="When are the end semester examinations?">📅 Exam Schedule</span>
            <span class="cnw-chip" data-q="What is the last date to pay semester fees?">💰 Fee Deadline</span>
            <span class="cnw-chip" data-q="What are the latest college notices?">📋 Latest Notices</span>
            <span class="cnw-chip" data-q="What are the hostel rules and attendance requirements?">🏢 Hostel Rules</span>
          </div>
        </div>
      </div>

      <div class="cnw-footer">
        <input 
          type="text" 
          class="cnw-input" 
          id="cnwInput" 
          placeholder="Ask a question about notices..." 
          autocomplete="off"
        />
        <button class="cnw-btn-send" id="cnwSendBtn" title="Send message">
          <svg viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
      <div class="cnw-powered">Powered by College Notice RAG Engine</div>
    </div>
  `;
  document.body.appendChild(container);

  // Widget Logic
  const launcher = document.getElementById("cnwLauncher");
  const win = document.getElementById("cnwWindow");
  const closeBtn = document.getElementById("cnwCloseBtn");
  const clearBtn = document.getElementById("cnwClearBtn");
  const input = document.getElementById("cnwInput");
  const sendBtn = document.getElementById("cnwSendBtn");
  const chatBody = document.getElementById("cnwChatBody");
  const badge = document.getElementById("cnwBadge");

  let isOpen = false;
  let isSending = false;

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
        ${welcomeMessage}
        <div class="cnw-suggestions" id="cnwSuggestions">
          <span class="cnw-chip" data-q="When are the end semester examinations?">📅 Exam Schedule</span>
          <span class="cnw-chip" data-q="What is the last date to pay semester fees?">💰 Fee Deadline</span>
          <span class="cnw-chip" data-q="What are the latest college notices?">📋 Latest Notices</span>
          <span class="cnw-chip" data-q="What are the hostel rules and attendance requirements?">🏢 Hostel Rules</span>
        </div>
      </div>
    `;
    setupChips();
  });

  function setupChips() {
    document.querySelectorAll(".cnw-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const q = chip.getAttribute("data-q");
        if (q && !isSending) {
          input.value = q;
          sendMessage();
        }
      });
    });
  }
  setupChips();

  function appendMessage(text, role, sources = []) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `cnw-msg ${role === "user" ? "cnw-msg-user" : "cnw-msg-bot"}`;

    // Basic markdown conversion for bold and line breaks
    let formattedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

    msgDiv.innerHTML = formattedText;

    // Attach Sources if present
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
          <div class="cnw-source-title">${s.source || "Notice"}</div>
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
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          knowledgeBaseId: knowledgeBaseId,
        }),
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
        `⚠️ Sorry, I couldn't reach the notice database. (${err.message}). Please check that the server is running.`,
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
