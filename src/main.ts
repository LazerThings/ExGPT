import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

let mainWindow: BrowserWindow | null = null;
let anthropicClient: Anthropic | null = null;

// Data paths
const userDataPath = app.getPath('userData');
const chatsPath = path.join(userDataPath, 'chats.json');
const settingsPath = path.join(userDataPath, 'settings.json');

// Types
interface Chat {
  id: string;
  name: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  createdAt: number;
  updatedAt: number;
}

interface Settings {
  apiKey: string;
  selectedMode: string;
  enabledToggles: string[];
}

interface Mode {
  name: string;
  'display-name': string;
  icon: string;
  description: string;
  prompt: string;
  model: string;
  maxTokens: number;
  extendedThinking: boolean;
  thinkingBudget?: number;
}

interface Toggle {
  name: string;
  displayName: string;
  icon: string;
  prompt: string;
  dependsOn?: string;
}

// Hardcoded toggles - these affect app behavior, not just prompts
const TOGGLES: Toggle[] = [
  {
    name: 'streaming',
    displayName: 'Streaming',
    icon: 'ph-lightning',
    prompt: 'Responses are being streamed to the user in real-time.',
  },
  {
    name: 'markdown',
    displayName: 'Markdown Rendering',
    icon: 'ph-text-aa',
    prompt: 'Your responses will be rendered as GitHub Flavored Markdown (GFM). Use formatting like **bold**, *italic*, ~~strikethrough~~, `inline code`, fenced code blocks with language hints, tables, task lists, and other GFM features.',
  },
  {
    name: 'timestamps',
    displayName: 'Show Timestamps',
    icon: 'ph-clock',
    prompt: '',
  },
  {
    name: 'livehtml',
    displayName: 'Live HTML',
    icon: 'ph-eyeglasses',
    prompt: 'You can output live HTML previews using a special code block. Use ```live followed by a COMPLETE, properly formatted HTML document starting with <!DOCTYPE html> and including <html>, <head>, and <body> tags. The HTML will be rendered in a live preview frame. The document must be fully self-contained and valid.',
    dependsOn: 'markdown',
  },
  {
    name: 'syntaxhighlight',
    displayName: 'Syntax Highlighting',
    icon: 'ph-highlighter-circle',
    prompt: '',
    dependsOn: 'markdown',
  },
  {
    name: 'darkmode',
    displayName: 'Dark Mode',
    icon: 'ph-moon',
    prompt: '',
  },
];

// Load modes from JSON
function loadModes(): Mode[] {
  const modesPath = path.join(__dirname, '..', 'modes.json');
  try {
    return JSON.parse(fs.readFileSync(modesPath, 'utf-8'));
  } catch {
    return [];
  }
}

// Load/save chats
function loadChats(): Chat[] {
  try {
    if (fs.existsSync(chatsPath)) {
      return JSON.parse(fs.readFileSync(chatsPath, 'utf-8'));
    }
  } catch {
    console.error('Error loading chats');
  }
  return [];
}

function saveChats(chats: Chat[]): void {
  fs.writeFileSync(chatsPath, JSON.stringify(chats, null, 2));
}

// Load/save settings
function loadSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // Decrypt API key if it exists
      if (data.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
        data.apiKey = safeStorage.decryptString(Buffer.from(data.apiKeyEncrypted, 'base64'));
        delete data.apiKeyEncrypted;
      }
      return data;
    }
  } catch {
    console.error('Error loading settings');
  }
  return { apiKey: '', selectedMode: 'quick-chat', enabledToggles: ['markdown'] };
}

function saveSettings(settings: Settings): void {
  const toSave: Record<string, unknown> = { ...settings };
  // Encrypt API key if possible
  if (settings.apiKey && safeStorage.isEncryptionAvailable()) {
    toSave.apiKeyEncrypted = safeStorage.encryptString(settings.apiKey).toString('base64');
    delete toSave.apiKey;
  }
  fs.writeFileSync(settingsPath, JSON.stringify(toSave, null, 2));
}

// Resolve API key - if it starts with $, treat it as an environment variable
function resolveApiKey(apiKey: string): string {
  if (apiKey && apiKey.startsWith('$')) {
    const envVarName = apiKey.slice(1);
    return process.env[envVarName] || '';
  }
  return apiKey;
}

// Initialize Anthropic client
function initAnthropicClient(apiKey: string): void {
  const resolvedKey = resolveApiKey(apiKey);
  if (resolvedKey) {
    anthropicClient = new Anthropic({ apiKey: resolvedKey });
  }
}

// Create main window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  const settings = loadSettings();
  if (settings.apiKey) {
    initAnthropicClient(settings.apiKey);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers

// Chats
ipcMain.handle('get-chats', () => loadChats());

ipcMain.handle('create-chat', (_, name: string) => {
  const chats = loadChats();
  const newChat: Chat = {
    id: `chat-${Date.now()}`,
    name: name || 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  chats.unshift(newChat);
  saveChats(chats);
  return newChat;
});

ipcMain.handle('rename-chat', (_, id: string, newName: string) => {
  const chats = loadChats();
  const chat = chats.find(c => c.id === id);
  if (chat) {
    chat.name = newName.trim() || 'Untitled Chat';
    chat.updatedAt = Date.now();
    saveChats(chats);
  }
  return chat;
});

ipcMain.handle('delete-chat', (_, id: string) => {
  let chats = loadChats();
  chats = chats.filter(c => c.id !== id);
  saveChats(chats);
  return true;
});

ipcMain.handle('get-chat', (_, id: string) => {
  const chats = loadChats();
  return chats.find(c => c.id === id) || null;
});

ipcMain.handle('update-chat-messages', (_, id: string, messages: Chat['messages']) => {
  const chats = loadChats();
  const chat = chats.find(c => c.id === id);
  if (chat) {
    chat.messages = messages;
    chat.updatedAt = Date.now();
    saveChats(chats);
  }
  return chat;
});

// Settings
ipcMain.handle('get-settings', () => {
  const settings = loadSettings();
  // Show env var name if it's an env var, otherwise mask it
  const displayKey = settings.apiKey?.startsWith('$') ? settings.apiKey : (settings.apiKey ? '••••••••' : '');
  return { ...settings, apiKey: displayKey };
});

ipcMain.handle('save-api-key', (_, apiKey: string) => {
  const settings = loadSettings();
  settings.apiKey = apiKey;
  saveSettings(settings);
  initAnthropicClient(apiKey);
  return true;
});

ipcMain.handle('save-mode', (_, mode: string) => {
  const settings = loadSettings();
  settings.selectedMode = mode;
  saveSettings(settings);
  return true;
});

ipcMain.handle('save-toggles', (_, toggles: string[]) => {
  const settings = loadSettings();
  settings.enabledToggles = toggles;
  saveSettings(settings);
  return true;
});

ipcMain.handle('get-actual-settings', () => loadSettings());

// Modes and toggles
ipcMain.handle('get-modes', () => loadModes());
ipcMain.handle('get-toggles', () => TOGGLES);

// Send message to Claude
ipcMain.handle('send-message', async (_, chatId: string, userMessage: string) => {
  if (!anthropicClient) {
    throw new Error('API key not configured');
  }

  const chats = loadChats();
  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    throw new Error('Chat not found');
  }

  const settings = loadSettings();
  const modes = loadModes();

  const selectedMode = modes.find(m => m.name === settings.selectedMode) || modes[0];
  const enabledToggles = TOGGLES.filter(t => settings.enabledToggles.includes(t.name));

  // Build system prompt
  let systemPrompt = 'You are Claude by Anthropic. You are in the ExGPT app.\n\n';
  if (selectedMode?.prompt) {
    systemPrompt += selectedMode.prompt + '\n\n';
  }
  const togglePrompts = enabledToggles.map(t => t.prompt).filter(p => p);
  if (togglePrompts.length > 0) {
    systemPrompt += togglePrompts.join('\n\n');
  }

  // Add user message to chat
  chat.messages.push({ role: 'user', content: userMessage });

  // Check if streaming is enabled
  const isStreaming = settings.enabledToggles.includes('streaming');

  // Build request parameters
  const maxTokens = selectedMode?.maxTokens || 8192;
  const model = selectedMode?.model || 'claude-sonnet-4-20250514';

  try {
    if (isStreaming) {
      // Streaming response
      const streamParams: Anthropic.MessageStreamParams = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: chat.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };

      // Add extended thinking if enabled
      if (selectedMode?.extendedThinking && selectedMode?.thinkingBudget) {
        streamParams.thinking = {
          type: 'enabled',
          budget_tokens: selectedMode.thinkingBudget,
        };
      }

      const stream = anthropicClient.messages.stream(streamParams);

      let assistantMessage = '';
      let thinkingContent = '';

      stream.on('text', (text) => {
        assistantMessage += text;
        mainWindow?.webContents.send('stream-chunk', { chatId, text, fullMessage: assistantMessage });
      });

      // Handle thinking blocks for extended thinking
      stream.on('contentBlock', (block) => {
        if (block.type === 'thinking') {
          thinkingContent = block.thinking;
          mainWindow?.webContents.send('thinking-block', { chatId, thinking: thinkingContent });
        }
      });

      await stream.finalMessage();

      chat.messages.push({ role: 'assistant', content: assistantMessage });
      chat.updatedAt = Date.now();
      saveChats(chats);

      mainWindow?.webContents.send('stream-end', { chatId });
      return { message: assistantMessage, thinking: thinkingContent, chat, streamed: true };
    } else {
      // Non-streaming response
      const createParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: chat.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };

      // Add extended thinking if enabled
      if (selectedMode?.extendedThinking && selectedMode?.thinkingBudget) {
        createParams.thinking = {
          type: 'enabled',
          budget_tokens: selectedMode.thinkingBudget,
        };
      }

      const response = await anthropicClient.messages.create(createParams);

      let assistantMessage = '';
      let thinkingContent = '';

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantMessage += block.text;
        } else if (block.type === 'thinking') {
          thinkingContent = block.thinking;
        }
      }

      chat.messages.push({ role: 'assistant', content: assistantMessage });
      chat.updatedAt = Date.now();
      saveChats(chats);

      return { message: assistantMessage, thinking: thinkingContent, chat, streamed: false };
    }
  } catch (error) {
    // Remove the user message if API call failed
    chat.messages.pop();
    throw error;
  }
});

// Generate chat title from first message
ipcMain.handle('generate-title', async (_, chatId: string, userMessage: string) => {
  if (!anthropicClient) {
    return 'Untitled Chat';
  }

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: 'Generate a short, concise title (3-6 words) for a chat conversation based on the user\'s first message. Output ONLY the title text, nothing else. Do not use quotation marks. Do not use emojis.',
      messages: [{ role: 'user', content: userMessage }],
    });

    let title = 'Untitled Chat';
    if (response.content[0]?.type === 'text') {
      title = response.content[0].text.trim() || 'Untitled Chat';
    }

    // Update the chat with the new title
    const chats = loadChats();
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      chat.name = title;
      chat.updatedAt = Date.now();
      saveChats(chats);
    }

    return title;
  } catch (error) {
    console.error('Error generating title:', error);
    return 'Untitled Chat';
  }
});

// Regenerate assistant message
ipcMain.handle('regenerate-message', async (_, chatId: string, messageIndex: number) => {
  if (!anthropicClient) {
    throw new Error('API key not configured');
  }

  const chats = loadChats();
  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    throw new Error('Chat not found');
  }

  // Remove the assistant message and all messages after it
  chat.messages = chat.messages.slice(0, messageIndex);

  const settings = loadSettings();
  const modes = loadModes();

  const selectedMode = modes.find(m => m.name === settings.selectedMode) || modes[0];
  const enabledToggles = TOGGLES.filter(t => settings.enabledToggles.includes(t.name));

  // Build system prompt
  let systemPrompt = 'You are Claude by Anthropic. You are in the ExGPT app.\n\n';
  if (selectedMode?.prompt) {
    systemPrompt += selectedMode.prompt + '\n\n';
  }
  const togglePrompts = enabledToggles.map(t => t.prompt).filter(p => p);
  if (togglePrompts.length > 0) {
    systemPrompt += togglePrompts.join('\n\n');
  }

  const isStreaming = settings.enabledToggles.includes('streaming');
  const maxTokens = selectedMode?.maxTokens || 8192;
  const model = selectedMode?.model || 'claude-sonnet-4-20250514';

  try {
    if (isStreaming) {
      const streamParams: Anthropic.MessageStreamParams = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: chat.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };

      if (selectedMode?.extendedThinking && selectedMode?.thinkingBudget) {
        streamParams.thinking = {
          type: 'enabled',
          budget_tokens: selectedMode.thinkingBudget,
        };
      }

      const stream = anthropicClient.messages.stream(streamParams);

      let assistantMessage = '';
      let thinkingContent = '';

      stream.on('text', (text) => {
        assistantMessage += text;
        mainWindow?.webContents.send('stream-chunk', { chatId, text, fullMessage: assistantMessage });
      });

      stream.on('contentBlock', (block) => {
        if (block.type === 'thinking') {
          thinkingContent = block.thinking;
          mainWindow?.webContents.send('thinking-block', { chatId, thinking: thinkingContent });
        }
      });

      await stream.finalMessage();

      chat.messages.push({ role: 'assistant', content: assistantMessage });
      chat.updatedAt = Date.now();
      saveChats(chats);

      mainWindow?.webContents.send('stream-end', { chatId });
      return { message: assistantMessage, thinking: thinkingContent, chat, streamed: true };
    } else {
      const createParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: chat.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };

      if (selectedMode?.extendedThinking && selectedMode?.thinkingBudget) {
        createParams.thinking = {
          type: 'enabled',
          budget_tokens: selectedMode.thinkingBudget,
        };
      }

      const response = await anthropicClient.messages.create(createParams);

      let assistantMessage = '';
      let thinkingContent = '';

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantMessage += block.text;
        } else if (block.type === 'thinking') {
          thinkingContent = block.thinking;
        }
      }

      chat.messages.push({ role: 'assistant', content: assistantMessage });
      chat.updatedAt = Date.now();
      saveChats(chats);

      return { message: assistantMessage, thinking: thinkingContent, chat, streamed: false };
    }
  } catch (error) {
    throw error;
  }
});

// Edit user message and regenerate
ipcMain.handle('edit-message', async (_, chatId: string, messageIndex: number, newContent: string) => {
  const chats = loadChats();
  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    throw new Error('Chat not found');
  }

  // Update the message and remove all messages after it
  chat.messages = chat.messages.slice(0, messageIndex);
  chat.messages.push({ role: 'user', content: newContent });
  chat.updatedAt = Date.now();
  saveChats(chats);

  return chat;
});
