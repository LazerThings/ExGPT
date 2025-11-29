// DOM Elements
const leftSidebar = document.getElementById('left-sidebar');
const rightSidebar = document.getElementById('right-sidebar');
const toggleLeftSidebarBtn = document.getElementById('toggle-left-sidebar');
const toggleRightSidebarBtn = document.getElementById('toggle-right-sidebar');
const closeRightSidebarBtn = document.getElementById('close-right-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

const chatList = document.getElementById('chat-list');
const chatSearchInput = document.getElementById('chat-search-input');
const newChatBtn = document.getElementById('new-chat-btn');
const currentChatTitle = document.getElementById('current-chat-title');

const welcomeScreen = document.getElementById('welcome-screen');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key');

const modesList = document.getElementById('modes-list');
const togglesList = document.getElementById('toggles-list');
const darkModeBtn = document.getElementById('dark-mode-btn');

// State
let currentChatId = null;
let chats = [];
let modes = [];
let toggles = [];
let settings = {
  selectedMode: 'quick-chat',
  enabledToggles: ['markdown']
};
let isLoading = false;
let searchQuery = '';

// Initialize
async function init() {
  await loadData();
  setupEventListeners();
  setupStreamListeners();
  setupKeyboardShortcuts();
  applyTheme();
  renderChatList();
  renderModes();
  renderToggles();
  await updateApiKeyHint();
}

// Update API key hint based on whether app is packaged
async function updateApiKeyHint() {
  const hint = document.getElementById('api-key-hint');
  if (!hint) return;

  const isPackaged = await window.api.isPackaged();
  if (isPackaged) {
    hint.textContent = 'Your API key is stored securely in your system keychain.';
  } else {
    hint.textContent = 'Your API key is stored securely and encrypted locally. Use $ENV_VAR to reference an environment variable (e.g. $ANTHROPIC_API_KEY).';
  }
}

// Load data from main process
async function loadData() {
  try {
    [chats, modes, toggles, settings] = await Promise.all([
      window.api.getChats(),
      window.api.getModes(),
      window.api.getToggles(),
      window.api.getActualSettings()
    ]);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Sidebar toggles
  toggleLeftSidebarBtn.addEventListener('click', () => {
    leftSidebar.classList.toggle('open');
    updateOverlay();
  });

  toggleRightSidebarBtn.addEventListener('click', () => {
    rightSidebar.classList.toggle('open');
    updateOverlay();
  });

  closeRightSidebarBtn.addEventListener('click', () => {
    rightSidebar.classList.remove('open');
    updateOverlay();
  });

  sidebarOverlay.addEventListener('click', () => {
    leftSidebar.classList.remove('open');
    rightSidebar.classList.remove('open');
    updateOverlay();
  });

  // New chat
  newChatBtn.addEventListener('click', createNewChat);

  // Settings
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('open');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('open');
    }
  });

  saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      await window.api.saveApiKey(apiKey);
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '••••••••';
      settingsModal.classList.remove('open');
    }
  });

  // Message input - Enter for newline, Cmd/Ctrl+Enter to send
  messageInput.addEventListener('input', autoResizeTextarea);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
    // Regular Enter just adds newline (default behavior)
  });

  sendBtn.addEventListener('click', sendMessage);

  // Chat search input
  chatSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderChatList();
  });

  // Dark mode button
  darkModeBtn.addEventListener('click', async () => {
    const index = settings.enabledToggles.indexOf('darkmode');
    if (index > -1) {
      settings.enabledToggles.splice(index, 1);
    } else {
      settings.enabledToggles.push('darkmode');
    }
    await window.api.saveToggles(settings.enabledToggles);
    applyTheme();
    updateDarkModeButton();
  });

  // Collapsibles
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('open');
    });
  });
}

// Setup stream listeners
function setupStreamListeners() {
  window.api.onStreamChunk(({ chatId, text, fullMessage }) => {
    if (chatId === currentChatId) {
      updateStreamingMessage(fullMessage);
    }
  });

  window.api.onStreamEnd(({ chatId }) => {
    if (chatId === currentChatId) {
      finalizeStreamingMessage();
    }
  });

  window.api.onThinkingBlock(({ chatId, thinking }) => {
    if (chatId === currentChatId) {
      showThinkingBlock(thinking);
    }
  });

  window.api.onToolUse(({ chatId, tools }) => {
    if (chatId === currentChatId) {
      showToolUse(tools);
    }
  });
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Don't trigger shortcuts when typing in inputs (except for specific ones)
    const isTyping = document.activeElement.tagName === 'INPUT' ||
                     document.activeElement.tagName === 'TEXTAREA';

    // Cmd/Ctrl+N - New chat
    if (modKey && e.key === 'n') {
      e.preventDefault();
      createNewChat();
      return;
    }

    // Cmd/Ctrl+/ - Toggle config sidebar
    if (modKey && e.key === '/') {
      e.preventDefault();
      rightSidebar.classList.toggle('open');
      updateOverlay();
      return;
    }

    // Cmd/Ctrl+, - Open settings
    if (modKey && e.key === ',') {
      e.preventDefault();
      settingsModal.classList.add('open');
      return;
    }

    // Cmd/Ctrl+Space - Focus chat search
    if (modKey && e.key === ' ') {
      e.preventDefault();
      leftSidebar.classList.add('open');
      updateOverlay();
      chatSearchInput.focus();
      chatSearchInput.select();
      return;
    }

    // Escape - Close modals/sidebars
    if (e.key === 'Escape') {
      if (settingsModal.classList.contains('open')) {
        settingsModal.classList.remove('open');
      } else if (rightSidebar.classList.contains('open')) {
        rightSidebar.classList.remove('open');
        updateOverlay();
      } else if (leftSidebar.classList.contains('open')) {
        leftSidebar.classList.remove('open');
        updateOverlay();
      }
      return;
    }
  });
}

// Apply theme based on darkmode toggle
function applyTheme() {
  const isDarkMode = settings.enabledToggles.includes('darkmode');
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  updateDarkModeButton();
}

// Update the dark mode button icon
function updateDarkModeButton() {
  const isDarkMode = settings.enabledToggles.includes('darkmode');
  const icon = darkModeBtn.querySelector('i');
  if (icon) {
    icon.className = `ph ${isDarkMode ? 'ph-sun' : 'ph-moon'}`;
  }
}

// Update overlay visibility
function updateOverlay() {
  const isOpen = leftSidebar.classList.contains('open') || rightSidebar.classList.contains('open');
  sidebarOverlay.classList.toggle('visible', isOpen);
}

// Auto-resize textarea
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
}

// Render chat list
function renderChatList() {
  chatList.innerHTML = '';

  // Filter chats based on search query
  const filteredChats = searchQuery
    ? chats.filter(chat => chat.name.toLowerCase().includes(searchQuery))
    : chats;

  filteredChats.forEach(chat => {
    const item = document.createElement('div');
    item.className = `chat-item${chat.id === currentChatId ? ' active' : ''}`;
    item.dataset.id = chat.id;

    item.innerHTML = `
      <span class="chat-item-name">${escapeHtml(chat.name)}</span>
      <div class="chat-item-actions">
        <button class="icon-btn rename-btn" title="Rename">
          <i class="ph ph-pencil-simple"></i>
        </button>
        <button class="icon-btn delete-btn" title="Delete">
          <i class="ph ph-trash"></i>
        </button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (!e.target.closest('.chat-item-actions')) {
        selectChat(chat.id);
      }
    });

    item.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startRenameChat(chat.id, item);
    });

    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });

    chatList.appendChild(item);
  });
}

// Create new chat
async function createNewChat() {
  const chat = await window.api.createChat('New Chat');
  chats.unshift(chat);
  selectChat(chat.id);
  renderChatList();
  leftSidebar.classList.remove('open');
  updateOverlay();
}

// Select chat
async function selectChat(id) {
  currentChatId = id;
  const chat = chats.find(c => c.id === id);

  if (chat) {
    currentChatTitle.textContent = chat.name;
    welcomeScreen.classList.add('hidden');
    messagesDiv.classList.remove('hidden');
    renderMessages(chat.messages);
  }

  renderChatList();
}

// Start rename chat
function startRenameChat(id, item) {
  const nameSpan = item.querySelector('.chat-item-name');
  const currentName = nameSpan.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-item-rename';
  input.value = currentName;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = async () => {
    const newName = input.value.trim() || 'Untitled Chat';
    const result = await window.api.renameChat(id, newName);
    const chat = chats.find(c => c.id === id);
    if (chat && result) {
      chat.name = result.name;
      if (id === currentChatId) {
        currentChatTitle.textContent = result.name;
      }
    }
    renderChatList();
  };

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}

// Delete chat
async function deleteChat(id) {
  await window.api.deleteChat(id);
  chats = chats.filter(c => c.id !== id);

  if (id === currentChatId) {
    currentChatId = null;
    currentChatTitle.textContent = 'ExGPT';
    welcomeScreen.classList.remove('hidden');
    messagesDiv.classList.add('hidden');
    messagesDiv.innerHTML = '';
  }

  renderChatList();
}

// Render messages
function renderMessages(messages) {
  messagesDiv.innerHTML = '';
  const showTimestamps = settings.enabledToggles.includes('timestamps');
  const renderMarkdown = settings.enabledToggles.includes('markdown');

  messages.forEach((msg, index) => {
    const messageEl = createMessageElement(msg.role, msg.content, {
      showTimestamp: showTimestamps,
      renderMarkdown: renderMarkdown,
      messageIndex: index
    });
    messagesDiv.appendChild(messageEl);
  });

  scrollToBottom();
}

// Create message element
function createMessageElement(role, content, options = {}) {
  const { showTimestamp = false, renderMarkdown = false, isStreaming = false, messageIndex = -1 } = options;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}${isStreaming ? ' streaming' : ''}`;
  messageEl.dataset.index = messageIndex;

  // Add role label
  const roleEl = document.createElement('div');
  roleEl.className = 'message-role';
  roleEl.textContent = role === 'user' ? 'You' : 'Claude';
  messageEl.appendChild(roleEl);

  const contentEl = document.createElement('div');
  contentEl.className = `message-content${renderMarkdown ? ' markdown' : ''}`;

  if (isStreaming && !content) {
    contentEl.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  } else if (renderMarkdown) {
    contentEl.innerHTML = renderMarkdownContent(content);
  } else {
    contentEl.textContent = content;
  }

  messageEl.appendChild(contentEl);

  // Add message actions (not for streaming messages)
  if (!isStreaming && messageIndex >= 0) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'message-actions';

    if (role === 'user') {
      actionsEl.innerHTML = `
        <button class="message-action-btn copy-btn" title="Copy">
          <i class="ph ph-copy"></i>
        </button>
        <button class="message-action-btn edit-btn" title="Edit">
          <i class="ph ph-pencil-simple"></i>
        </button>
      `;

      actionsEl.querySelector('.copy-btn').addEventListener('click', () => copyMessage(content));
      actionsEl.querySelector('.edit-btn').addEventListener('click', () => editMessage(messageIndex, content));
    } else {
      actionsEl.innerHTML = `
        <button class="message-action-btn copy-btn" title="Copy">
          <i class="ph ph-copy"></i>
        </button>
        <button class="message-action-btn regenerate-btn" title="Regenerate">
          <i class="ph ph-arrow-clockwise"></i>
        </button>
      `;

      actionsEl.querySelector('.copy-btn').addEventListener('click', () => copyMessage(content));
      actionsEl.querySelector('.regenerate-btn').addEventListener('click', () => regenerateMessage(messageIndex));
    }

    messageEl.appendChild(actionsEl);
  }

  if (showTimestamp) {
    const timestampEl = document.createElement('div');
    timestampEl.className = 'message-timestamp';
    timestampEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageEl.appendChild(timestampEl);
  }

  return messageEl;
}

// Copy message to clipboard
async function copyMessage(content) {
  try {
    await navigator.clipboard.writeText(content);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

// Edit user message
function editMessage(messageIndex, currentContent) {
  if (isLoading) return;

  const messageEl = messagesDiv.querySelector(`[data-index="${messageIndex}"]`);
  if (!messageEl) return;

  const contentEl = messageEl.querySelector('.message-content');
  const actionsEl = messageEl.querySelector('.message-actions');

  // Hide actions while editing
  if (actionsEl) actionsEl.style.display = 'none';

  // Create edit textarea
  const editContainer = document.createElement('div');
  editContainer.className = 'edit-container';
  editContainer.innerHTML = `
    <textarea class="edit-textarea">${escapeHtml(currentContent)}</textarea>
    <div class="edit-actions">
      <button class="btn btn-secondary cancel-edit-btn">Cancel</button>
      <button class="btn btn-primary save-edit-btn">Save & Send</button>
    </div>
  `;

  contentEl.style.display = 'none';
  messageEl.insertBefore(editContainer, contentEl);

  const textarea = editContainer.querySelector('.edit-textarea');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  // Auto-resize
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });

  // Cancel edit
  editContainer.querySelector('.cancel-edit-btn').addEventListener('click', () => {
    editContainer.remove();
    contentEl.style.display = '';
    if (actionsEl) actionsEl.style.display = '';
  });

  // Save and regenerate
  editContainer.querySelector('.save-edit-btn').addEventListener('click', async () => {
    const newContent = textarea.value.trim();
    if (!newContent) return;

    editContainer.remove();
    contentEl.style.display = '';
    if (actionsEl) actionsEl.style.display = '';

    await submitEditedMessage(messageIndex, newContent);
  });
}

// Submit edited message and regenerate response
async function submitEditedMessage(messageIndex, newContent) {
  if (isLoading) return;

  isLoading = true;
  sendBtn.disabled = true;

  try {
    // Edit the message on the backend
    const updatedChat = await window.api.editMessage(currentChatId, messageIndex, newContent);

    // Update local state
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      chat.messages = updatedChat.messages;
    }

    // Re-render messages
    renderMessages(updatedChat.messages);

    // Add loading message for the response
    const loadingEl = createMessageElement('assistant', '', { isStreaming: true });
    loadingEl.id = 'streaming-message';
    messagesDiv.appendChild(loadingEl);
    scrollToBottom();

    // Send the message to get a response
    const result = await window.api.sendMessage(currentChatId, newContent);

    // Update local chat data
    if (chat) {
      chat.messages = result.chat.messages;
    }

    // If not streaming, update the message directly
    if (!result.streamed) {
      const streamingEl = document.getElementById('streaming-message');
      if (streamingEl) {
        const renderMarkdown = settings.enabledToggles.includes('markdown');
        const contentEl = streamingEl.querySelector('.message-content');
        contentEl.className = `message-content${renderMarkdown ? ' markdown' : ''}`;

        if (renderMarkdown) {
          contentEl.innerHTML = renderMarkdownContent(result.message);
        } else {
          contentEl.textContent = result.message;
        }

        streamingEl.removeAttribute('id');
        streamingEl.classList.remove('streaming');
      }

      // Re-render to add actions
      renderMessages(result.chat.messages);
    }
  } catch (error) {
    console.error('Error editing message:', error);
    const errorEl = createMessageElement('assistant', `Error: ${error.message || 'Failed to send message'}`);
    errorEl.querySelector('.message-content').style.color = '#ef4444';
    messagesDiv.appendChild(errorEl);
  }

  isLoading = false;
  sendBtn.disabled = false;
  scrollToBottom();
}

// Regenerate assistant message
async function regenerateMessage(messageIndex) {
  if (isLoading) return;

  isLoading = true;
  sendBtn.disabled = true;

  // Remove the message and all after it from UI
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  // Re-render messages up to (but not including) the regenerated message
  const messagesBeforeRegen = chat.messages.slice(0, messageIndex);
  renderMessages(messagesBeforeRegen);

  // Add loading message
  const loadingEl = createMessageElement('assistant', '', { isStreaming: true });
  loadingEl.id = 'streaming-message';
  messagesDiv.appendChild(loadingEl);
  scrollToBottom();

  try {
    const result = await window.api.regenerateMessage(currentChatId, messageIndex);

    // Update local chat data
    chat.messages = result.chat.messages;

    // If not streaming, update the message directly
    if (!result.streamed) {
      const streamingEl = document.getElementById('streaming-message');
      if (streamingEl) {
        const renderMarkdown = settings.enabledToggles.includes('markdown');
        const contentEl = streamingEl.querySelector('.message-content');
        contentEl.className = `message-content${renderMarkdown ? ' markdown' : ''}`;

        if (renderMarkdown) {
          contentEl.innerHTML = renderMarkdownContent(result.message);
        } else {
          contentEl.textContent = result.message;
        }

        streamingEl.removeAttribute('id');
        streamingEl.classList.remove('streaming');
      }

      // Re-render to add actions
      renderMessages(result.chat.messages);
    }
  } catch (error) {
    console.error('Error regenerating message:', error);

    // Remove loading message
    const streamingEl = document.getElementById('streaming-message');
    if (streamingEl) {
      streamingEl.remove();
    }

    // Show error message
    const errorEl = createMessageElement('assistant', `Error: ${error.message || 'Failed to regenerate'}`);
    errorEl.querySelector('.message-content').style.color = '#ef4444';
    messagesDiv.appendChild(errorEl);
  }

  isLoading = false;
  sendBtn.disabled = false;
  scrollToBottom();
}

// Check if HTML is a valid complete document
function isValidHtmlDocument(html) {
  const trimmed = html.trim();
  return trimmed.startsWith('<!DOCTYPE html>') &&
         trimmed.includes('<html') &&
         trimmed.includes('<head') &&
         trimmed.includes('<body') &&
         trimmed.includes('</html>');
}

// Create live HTML frame
function createLiveHtmlFrame(htmlContent, frameId) {
  const isValid = isValidHtmlDocument(htmlContent);

  if (!isValid) {
    return `<div class="live-html-error">
      <i class="ph ph-file-x"></i>
      <span>Live HTML was not a properly formatted HTML document.</span>
    </div>`;
  }

  return `<div class="live-html-container" data-frame-id="${frameId}">
    <div class="live-html-header">
      <span><i class="ph ph-code"></i> Live HTML Preview</span>
      <button class="live-html-reload-btn" onclick="reloadLiveFrame('${frameId}')">
        <i class="ph ph-arrow-clockwise"></i> Reload
      </button>
    </div>
    <iframe id="${frameId}" class="live-html-frame" sandbox="allow-scripts allow-same-origin" srcdoc="${escapeHtmlAttribute(htmlContent)}"></iframe>
  </div>`;
}

// Create loading placeholder for live HTML during streaming
function createLiveHtmlLoading() {
  return `<div class="live-html-loading">
    <i class="ph ph-spinner-gap spinning"></i>
    <span>Claude is working on live code</span>
  </div>`;
}

// Escape HTML for use in attributes
function escapeHtmlAttribute(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Reload live frame
window.reloadLiveFrame = function(frameId) {
  const frame = document.getElementById(frameId);
  if (frame) {
    const srcdoc = frame.getAttribute('srcdoc');
    frame.removeAttribute('srcdoc');
    setTimeout(() => frame.setAttribute('srcdoc', srcdoc), 0);
  }
};

// GFM Markdown renderer
function renderMarkdownContent(text, isStreaming = false) {
  if (!text) return '';

  const liveHtmlEnabled = settings.enabledToggles.includes('livehtml');
  let html = escapeHtml(text);

  // Handle live code blocks first (before other code block processing)
  if (liveHtmlEnabled) {
    let frameCounter = 0;

    // Check for incomplete live blocks during streaming
    if (isStreaming && html.includes('```live')) {
      // Check if there's an unclosed live block
      const liveBlockRegex = /```live\n([\s\S]*?)```/g;
      const incompleteRegex = /```live\n([\s\S]*)$/;

      // Replace complete live blocks
      html = html.replace(liveBlockRegex, (_, code) => {
        const frameId = `live-frame-${Date.now()}-${frameCounter++}`;
        // Unescape the HTML content for the iframe
        const unescaped = code.trim()
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        return createLiveHtmlFrame(unescaped, frameId);
      });

      // Replace incomplete live block with loading indicator
      html = html.replace(incompleteRegex, () => {
        return createLiveHtmlLoading();
      });
    } else {
      // Not streaming - process all live blocks normally
      html = html.replace(/```live\n([\s\S]*?)```/g, (_, code) => {
        const frameId = `live-frame-${Date.now()}-${frameCounter++}`;
        // Unescape the HTML content for the iframe
        const unescaped = code.trim()
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        return createLiveHtmlFrame(unescaped, frameId);
      });
    }
  }

  // Fenced code blocks with language
  const syntaxHighlightEnabled = settings.enabledToggles.includes('syntaxhighlight');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const codeContent = code.trim();
    if (syntaxHighlightEnabled && typeof hljs !== 'undefined' && lang) {
      try {
        // Try to highlight with the specified language
        const highlighted = hljs.highlight(codeContent, { language: lang, ignoreIllegals: true });
        return `<pre><code class="hljs language-${lang}">${highlighted.value}</code></pre>`;
      } catch (e) {
        // Fall back to auto-detection or plain text
        try {
          const highlighted = hljs.highlightAuto(codeContent);
          return `<pre><code class="hljs">${highlighted.value}</code></pre>`;
        } catch (e2) {
          return `<pre><code class="language-${lang}">${codeContent}</code></pre>`;
        }
      }
    } else if (syntaxHighlightEnabled && typeof hljs !== 'undefined') {
      // No language specified, try auto-detection
      try {
        const highlighted = hljs.highlightAuto(codeContent);
        return `<pre><code class="hljs">${highlighted.value}</code></pre>`;
      } catch (e) {
        return `<pre><code>${codeContent}</code></pre>`;
      }
    }
    return `<pre><code class="language-${lang}">${codeContent}</code></pre>`;
  });

  // Inline code (must come after code blocks)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Tables (GFM)
  html = html.replace(/^\|(.+)\|\s*\n\|([\s\-:|]+)\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (match, header, separator, body) => {
    const headers = header.split('|').map(h => h.trim()).filter(h => h);
    const alignments = separator.split('|').map(s => {
      s = s.trim();
      if (s.startsWith(':') && s.endsWith(':')) return 'center';
      if (s.endsWith(':')) return 'right';
      return 'left';
    }).filter((_, i) => i < headers.length);

    let tableHtml = '<table><thead><tr>';
    headers.forEach((h, i) => {
      tableHtml += `<th style="text-align:${alignments[i] || 'left'}">${h}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    const rows = body.trim().split('\n');
    rows.forEach(row => {
      const cells = row.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1 || c);
      if (cells.length > 0) {
        tableHtml += '<tr>';
        cells.forEach((cell, i) => {
          tableHtml += `<td style="text-align:${alignments[i] || 'left'}">${cell}</td>`;
        });
        tableHtml += '</tr>';
      }
    });
    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  // Strikethrough (GFM)
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Task lists (GFM)
  html = html.replace(/^- \[x\] (.+)$/gm, '<li class="task-item checked"><input type="checkbox" checked disabled> $1</li>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="task-item"><input type="checkbox" disabled> $1</li>');

  // Unordered lists
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive list items
  html = html.replace(/(<li class="task-item[^"]*">.*<\/li>\n?)+/g, '<ul class="task-list">$&</ul>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    if (!match.includes('task-list')) {
      return '<ul>' + match + '</ul>';
    }
    return match;
  });

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Horizontal rules
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Auto-link URLs (GFM)
  html = html.replace(/(?<!href="|">)(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  // Line breaks and paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs and fix structure
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-4]>)/g, '$1');
  html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<table>)/g, '$1');
  html = html.replace(/(<\/table>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)<\/p>/g, '$1');
  html = html.replace(/<p><br>/g, '<p>');
  html = html.replace(/<br><\/p>/g, '</p>');

  return html;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Send message
async function sendMessage() {
  if (isLoading || !messageInput.value.trim()) return;

  // Create chat if none selected
  if (!currentChatId) {
    await createNewChat();
  }

  const userMessage = messageInput.value.trim();
  messageInput.value = '';
  autoResizeTextarea();

  const chat = chats.find(c => c.id === currentChatId);
  const isFirstMessage = chat && chat.messages.length === 0;

  // Add user message to UI
  const showTimestamps = settings.enabledToggles.includes('timestamps');
  const renderMarkdown = settings.enabledToggles.includes('markdown');
  const userMessageEl = createMessageElement('user', userMessage, {
    showTimestamp: showTimestamps,
    renderMarkdown: renderMarkdown,
    messageIndex: chat ? chat.messages.length : 0
  });
  messagesDiv.appendChild(userMessageEl);

  // Add loading message
  const loadingEl = createMessageElement('assistant', '', { isStreaming: true });
  loadingEl.id = 'streaming-message';
  messagesDiv.appendChild(loadingEl);

  scrollToBottom();

  isLoading = true;
  sendBtn.disabled = true;

  // Generate title in background for first message
  if (isFirstMessage) {
    window.api.generateTitle(currentChatId, userMessage).then(title => {
      if (chat) {
        chat.name = title;
        currentChatTitle.textContent = title;
        renderChatList();
      }
    }).catch(err => console.error('Error generating title:', err));
  }

  try {
    const result = await window.api.sendMessage(currentChatId, userMessage);

    // Update local chat data
    if (chat) {
      chat.messages = result.chat.messages;
    }

    // If not streaming, update the message directly
    if (!result.streamed) {
      const streamingEl = document.getElementById('streaming-message');
      if (streamingEl) {
        const contentEl = streamingEl.querySelector('.message-content');
        contentEl.className = `message-content${renderMarkdown ? ' markdown' : ''}`;

        if (renderMarkdown) {
          contentEl.innerHTML = renderMarkdownContent(result.message);
        } else {
          contentEl.textContent = result.message;
        }

        streamingEl.removeAttribute('id');
        streamingEl.classList.remove('streaming');
      }

      // Re-render to add actions
      renderMessages(result.chat.messages);
    }
  } catch (error) {
    console.error('Error sending message:', error);

    // Remove loading message
    const streamingEl = document.getElementById('streaming-message');
    if (streamingEl) {
      streamingEl.remove();
    }

    // Show error message
    const errorEl = createMessageElement('assistant', `Error: ${error.message || 'Failed to send message'}`);
    errorEl.querySelector('.message-content').style.color = '#ef4444';
    messagesDiv.appendChild(errorEl);
  }

  isLoading = false;
  sendBtn.disabled = false;
  scrollToBottom();
}

// Update streaming message
function updateStreamingMessage(fullMessage) {
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) {
    const renderMarkdown = settings.enabledToggles.includes('markdown');
    const contentEl = streamingEl.querySelector('.message-content');
    contentEl.className = `message-content${renderMarkdown ? ' markdown' : ''}`;

    if (renderMarkdown) {
      contentEl.innerHTML = renderMarkdownContent(fullMessage, true); // isStreaming = true
    } else {
      contentEl.textContent = fullMessage;
    }

    scrollToBottom();
  }
}

// Finalize streaming message
function finalizeStreamingMessage() {
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) {
    streamingEl.removeAttribute('id');
    streamingEl.classList.remove('streaming');

    // Re-render to add actions
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      renderMessages(chat.messages);
    }
  }

  isLoading = false;
  sendBtn.disabled = false;
}

// Show thinking block
function showThinkingBlock(thinking) {
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) {
    let thinkingEl = streamingEl.querySelector('.thinking-block');
    if (!thinkingEl) {
      thinkingEl = document.createElement('div');
      thinkingEl.className = 'thinking-block';
      thinkingEl.innerHTML = `
        <div class="thinking-block-header">
          <i class="ph ph-brain"></i>
          <span>Thinking...</span>
        </div>
        <div class="thinking-block-content"></div>
      `;
      streamingEl.insertBefore(thinkingEl, streamingEl.firstChild);
    }
    thinkingEl.querySelector('.thinking-block-content').textContent = thinking;
    scrollToBottom();
  }
}

// Show tool use indicator
function showToolUse(tools) {
  const streamingEl = document.getElementById('streaming-message');
  if (streamingEl) {
    let toolEl = streamingEl.querySelector('.tool-use-block');
    if (!toolEl) {
      toolEl = document.createElement('div');
      toolEl.className = 'tool-use-block';
      streamingEl.insertBefore(toolEl, streamingEl.firstChild);
    }

    const toolNames = tools.map(t => {
      const icon = t.name === 'web_search' ? 'ph-magnifying-glass' : 'ph-globe-simple';
      const displayName = t.name === 'web_search' ? 'Searching' : 'Fetching';
      const query = t.name === 'web_search' ? t.input.query : t.input.url;
      return `<div class="tool-use-item"><i class="ph ${icon}"></i> ${displayName}: ${query}</div>`;
    }).join('');

    toolEl.innerHTML = `
      <div class="tool-use-header">
        <i class="ph ph-wrench"></i>
        <span>Using tools...</span>
      </div>
      <div class="tool-use-content">${toolNames}</div>
    `;
    scrollToBottom();
  }
}

// Scroll to bottom
function scrollToBottom() {
  messagesDiv.parentElement.scrollTop = messagesDiv.parentElement.scrollHeight;
}

// Render modes
function renderModes() {
  modesList.innerHTML = '';

  modes.forEach(mode => {
    const card = document.createElement('div');
    card.className = `radio-card${settings.selectedMode === mode.name ? ' selected' : ''}`;
    card.dataset.mode = mode.name;

    card.innerHTML = `
      <div class="radio-card-icon">
        <i class="ph ${mode.icon}"></i>
      </div>
      <div class="radio-card-content">
        <div class="radio-card-title">${escapeHtml(mode['display-name'])}</div>
        <div class="radio-card-description">${escapeHtml(mode.description).replace(/\n/g, '<br>')}</div>
      </div>
    `;

    card.addEventListener('click', async () => {
      settings.selectedMode = mode.name;
      await window.api.saveMode(mode.name);
      renderModes();
    });

    modesList.appendChild(card);
  });
}

// Check if a toggle's dependency is satisfied
function isToggleDependencySatisfied(toggle) {
  if (!toggle.dependsOn) return true;
  return settings.enabledToggles.includes(toggle.dependsOn);
}

// Get the display name of a toggle by name
function getToggleDisplayName(name) {
  const toggle = toggles.find(t => t.name === name);
  return toggle ? toggle.displayName : name;
}

// Render toggles
function renderToggles() {
  togglesList.innerHTML = '';

  // Filter out darkmode - it's now in the sidebar
  const visibleToggles = toggles.filter(t => t.name !== 'darkmode');

  visibleToggles.forEach(toggle => {
    const item = document.createElement('div');
    const isActive = settings.enabledToggles.includes(toggle.name);
    const dependencySatisfied = isToggleDependencySatisfied(toggle);
    const isDisabled = !dependencySatisfied;

    item.className = `toggle-item${isActive && !isDisabled ? ' active' : ''}${isDisabled ? ' disabled' : ''}`;
    item.dataset.toggle = toggle.name;

    if (isDisabled && toggle.dependsOn) {
      item.title = `Disabled. Dependent on: ${getToggleDisplayName(toggle.dependsOn)}`;
    }

    item.innerHTML = `
      <i class="toggle-icon ph ${toggle.icon}"></i>
      <span class="toggle-name">${escapeHtml(toggle.displayName)}</span>
      <div class="toggle-switch"></div>
    `;

    if (!isDisabled) {
      item.addEventListener('click', async () => {
        const index = settings.enabledToggles.indexOf(toggle.name);
        if (index > -1) {
          settings.enabledToggles.splice(index, 1);
          // Also disable any toggles that depend on this one
          toggles.forEach(t => {
            if (t.dependsOn === toggle.name) {
              const depIndex = settings.enabledToggles.indexOf(t.name);
              if (depIndex > -1) {
                settings.enabledToggles.splice(depIndex, 1);
              }
            }
          });
        } else {
          settings.enabledToggles.push(toggle.name);
        }
        await window.api.saveToggles(settings.enabledToggles);
        renderToggles();

        // Re-render messages if timestamps, markdown, livehtml, or syntaxhighlight toggle changed
        if (toggle.name === 'timestamps' || toggle.name === 'markdown' || toggle.name === 'livehtml' || toggle.name === 'syntaxhighlight') {
          const chat = chats.find(c => c.id === currentChatId);
          if (chat) {
            renderMessages(chat.messages);
          }
        }
      });
    }

    togglesList.appendChild(item);
  });
}

// Initialize the app
init();
