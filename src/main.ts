import { app, BrowserWindow, ipcMain, safeStorage, net } from 'electron';
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
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string[];  // Array of thinking blocks for assistant messages
  toolUses?: Array<{ name: string; input: Record<string, unknown> }>;  // Array of tool uses for assistant messages
}

interface Chat {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface Settings {
  apiKey: string;
  selectedMode: string;
  enabledToggles: string[];
  debugFeatures?: boolean;
  showThinkingByDefault?: boolean;
  wolframAppId?: string;
  theme?: string;
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
    name: 'markdown',
    displayName: 'Markdown Rendering',
    icon: 'ph-text-aa',
    prompt: 'Your responses will be rendered as GitHub Flavored Markdown (GFM). Use formatting like **bold**, *italic*, ~~strikethrough~~, `inline code`, fenced code blocks with language hints, tables, task lists, and other GFM features. Note: HTML is not supported, only pure GFM syntax. IMPORTANT: Always specify a file extension (not full language name) for code blocks so syntax highlighting and downloads work properly. Use: ```js (not javascript), ```ts (not typescript), ```py (not python), ```rb (not ruby), ```sh (not bash/shell), ```html, ```css, ```json, ```md, ```yml, ```sql, ```c, ```cpp, ```go, ```rs (not rust), ```swift, ```kt (not kotlin), etc.',
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
    prompt: 'You can output live HTML previews using a special code block. Use ```live followed by a COMPLETE, properly formatted HTML document starting with <!DOCTYPE html> and including <html>, <head>, and <body> tags. The HTML will be rendered in a live preview frame. The document must be fully self-contained and valid. EXTREMELY IMPORTANT: DO NOT USE LIVE HTML UNLESS NECCESARY. Only use Live HTML if the user uses phrases like "Visualize ..." or "Create an interactive diagram..." - the user saying messages like "Create cool concepts" or "Make awesome book ideas" does not count and you should not use Live HTML in those cases unless the user tells you to.',
    dependsOn: 'markdown',
  },
  {
    name: 'nativehtmlstyle',
    displayName: 'Native HTML Styling',
    icon: 'ph-paint-roller',
    prompt: `When creating live HTML previews, style them to match the ExGPT app's native look and feel. Use these design specifications:

FONTS (include these @import statements in your <head>):
@import url('https://fonts.googleapis.com/css2?family=Jura:wght@300..700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Ubuntu+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');

- Primary font (body text, headings): 'Jura', sans-serif
- Monospace font (code, technical): 'Ubuntu Mono', monospace
- Base font size: 15px
- Line height: 1.6

LIGHT THEME COLORS:
- Primary (accent/brand): #22c55e (green)
- Primary light: #4ade80
- Primary dark: #16a34a
- Primary subtle (backgrounds): #dcfce7
- Primary bg: #f0fdf4
- Background: #ffffff
- Background secondary: #f9fafb
- Background tertiary: #f3f4f6
- Text: #111827
- Text secondary: #6b7280
- Text muted: #9ca3af
- Border: #e5e7eb
- Border light: #f3f4f6
- Code block bg: #1f2937
- Code block text: #f9fafb

DARK THEME COLORS (use @media (prefers-color-scheme: dark) or provide both):
- Primary (accent/brand): #22c55e (same green)
- Primary subtle: rgba(34, 197, 94, 0.15)
- Primary bg: rgba(34, 197, 94, 0.1)
- Background: #0f0f0f
- Background secondary: #1a1a1a
- Background tertiary: #262626
- Text: #f5f5f5
- Text secondary: #a3a3a3
- Text muted: #737373
- Border: #333333
- Border light: #262626
- Code block bg: #0a0a0a
- Code block text: #e5e5e5

BORDER RADIUS:
- Small: 6px
- Default: 10px
- Large: 16px

SHADOWS (light theme):
- Small: 0 1px 2px rgba(0, 0, 0, 0.05)
- Default: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
- Large: 0 10px 15px -3px rgba(0, 0, 0, 0.1)

SHADOWS (dark theme):
- Small: 0 1px 2px rgba(0, 0, 0, 0.3)
- Default: 0 4px 6px -1px rgba(0, 0, 0, 0.4)
- Large: 0 10px 15px -3px rgba(0, 0, 0, 0.5)

TRANSITIONS: Use 0.2s ease for smooth animations.

Apply these styles consistently to make live HTML previews feel integrated with the app.`,
    dependsOn: 'livehtml',
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
  {
    name: 'webfetch',
    displayName: 'Web Fetch',
    icon: 'ph-globe-simple',
    prompt: 'You have access to a web_fetch tool that lets you fetch and read the content of web pages. Use it when you need to read a specific URL the user provides or when you need more details from a search result.',
  },
  {
    name: 'wolfram',
    displayName: 'Wolfram Alpha',
    icon: 'ph-cpu',
    prompt: 'You have access to a wolfram_alpha tool that lets you query Wolfram Alpha for computational knowledge, math calculations, unit conversions, scientific data, statistics, and factual information. Use it for precise calculations, data lookups, or when you need authoritative answers to computational or factual questions.',
  },
  {
    name: 'debuginfo',
    displayName: 'Debug Info',
    icon: 'ph-bug',
    prompt: '', // Built dynamically
    dependsOn: 'debugfeatures', // Special dependency - checked against settings.debugFeatures
  },
];

// Tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_fetch',
    description: 'Fetch and read the content of a web page. Returns the text content of the page. Use this to read specific URLs or get more details from search results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'wolfram_alpha',
    description: 'Query Wolfram Alpha for computational knowledge, math calculations, unit conversions, scientific data, statistics, and factual information. Returns a text response with the computed results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The query to send to Wolfram Alpha (e.g., "integrate x^2", "population of France", "convert 100 miles to km")',
        },
      },
      required: ['query'],
    },
  },
];

// Execute web fetch tool
async function executeWebFetch(url: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const request = net.request(url);
      let data = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          data += chunk.toString();
        });

        response.on('end', () => {
          // Strip HTML tags and clean up for readability
          let text = data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();

          // Limit response size
          if (text.length > 15000) {
            text = text.substring(0, 15000) + '\n\n[Content truncated...]';
          }

          resolve(`Content from ${url}:\n\n${text}`);
        });
      });

      request.on('error', (error) => {
        resolve(`Failed to fetch ${url}: ${error.message}`);
      });

      request.end();
    } catch (error) {
      resolve(`Failed to fetch ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
}

// Execute Wolfram Alpha query
async function executeWolframAlpha(query: string): Promise<string> {
  const settings = loadSettings();
  const appId = settings.wolframAppId;

  if (!appId) {
    return 'Wolfram Alpha App ID not configured. Please set your App ID in Settings.';
  }

  return new Promise((resolve) => {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://www.wolframalpha.com/api/v1/llm-api?input=${encodedQuery}&appid=${appId}`;

      const request = net.request(url);
      let data = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          data += chunk.toString();
        });

        response.on('end', () => {
          if (response.statusCode === 200) {
            // Limit response size
            let result = data.trim();
            if (result.length > 15000) {
              result = result.substring(0, 15000) + '\n\n[Content truncated...]';
            }
            resolve(`Wolfram Alpha result for "${query}":\n\n${result}`);
          } else if (response.statusCode === 501) {
            resolve(`Wolfram Alpha could not understand the query: "${query}". Try rephrasing.`);
          } else if (response.statusCode === 403) {
            resolve('Wolfram Alpha API access denied. Please check your App ID is valid.');
          } else {
            resolve(`Wolfram Alpha error (${response.statusCode}): ${data}`);
          }
        });
      });

      request.on('error', (error) => {
        resolve(`Failed to query Wolfram Alpha: ${error.message}`);
      });

      request.end();
    } catch (error) {
      resolve(`Failed to query Wolfram Alpha: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
}

// Build debug info prompt showing configured vs actual settings
function buildDebugInfo(settings: Settings, selectedMode: Mode | undefined, enabledToggles: Toggle[]): string {
  const modeConfig = selectedMode ? {
    name: selectedMode.name,
    displayName: selectedMode['display-name'],
    model: selectedMode.model,
    maxTokens: selectedMode.maxTokens,
    extendedThinking: selectedMode.extendedThinking,
    thinkingBudget: selectedMode.thinkingBudget,
  } : null;

  // Check if extended thinking will actually be used
  const hasToolsEnabled = settings.enabledToggles.includes('webfetch') || settings.enabledToggles.includes('wolfram');
  const willUseThinking = selectedMode?.extendedThinking && selectedMode?.thinkingBudget;
  const usesInterleavedThinking = hasToolsEnabled && willUseThinking;

  const actualSettings = {
    model: selectedMode?.model || 'claude-sonnet-4-20250514',
    maxTokens: selectedMode?.maxTokens || 8192,
    extendedThinkingActive: willUseThinking,
    interleavedThinking: usesInterleavedThinking,
  };

  return `[DEBUG INFO - Configuration vs Runtime]
Mode Configuration (from modes.json):
${JSON.stringify(modeConfig, null, 2)}

Enabled Toggles: ${settings.enabledToggles.join(', ') || 'none'}

Actual Runtime Settings:
- Model being used: ${actualSettings.model}
- Max tokens: ${actualSettings.maxTokens}
- Extended thinking active: ${actualSettings.extendedThinkingActive}
${actualSettings.interleavedThinking ? '- Interleaved thinking: enabled (tools + thinking via beta API)' : ''}

If there's a mismatch between the mode configuration and actual runtime settings, this indicates a potential bug in the code.`;
}

// Execute a tool by name
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'web_fetch':
      return executeWebFetch(input.url as string);
    case 'wolfram_alpha':
      return executeWolframAlpha(input.query as string);
    default:
      return `Unknown tool: ${name}`;
  }
}

// Load modes from JSON
function loadModes(): Mode[] {
  // Use app.getAppPath() for packaged apps, __dirname for dev
  const basePath = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
  const modesPath = path.join(basePath, 'modes.json');
  try {
    return JSON.parse(fs.readFileSync(modesPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to load modes.json:', e);
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
      // Decrypt Wolfram App ID if it exists
      if (data.wolframAppIdEncrypted && safeStorage.isEncryptionAvailable()) {
        data.wolframAppId = safeStorage.decryptString(Buffer.from(data.wolframAppIdEncrypted, 'base64'));
        delete data.wolframAppIdEncrypted;
      }
      return data;
    }
  } catch {
    console.error('Error loading settings');
  }
  return { apiKey: '', selectedMode: 'conversational', enabledToggles: ['markdown'], debugFeatures: false, showThinkingByDefault: false };
}

function saveSettings(settings: Settings): void {
  const toSave: Record<string, unknown> = { ...settings };
  // Encrypt API key if possible
  if (settings.apiKey && safeStorage.isEncryptionAvailable()) {
    toSave.apiKeyEncrypted = safeStorage.encryptString(settings.apiKey).toString('base64');
    delete toSave.apiKey;
  }
  // Encrypt Wolfram App ID if possible
  if (settings.wolframAppId && safeStorage.isEncryptionAvailable()) {
    toSave.wolframAppIdEncrypted = safeStorage.encryptString(settings.wolframAppId).toString('base64');
    delete toSave.wolframAppId;
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
  const displayWolframId = settings.wolframAppId ? '••••••••' : '';
  return { ...settings, apiKey: displayKey, wolframAppId: displayWolframId };
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

ipcMain.handle('save-debug-features', (_, enabled: boolean) => {
  const settings = loadSettings();
  settings.debugFeatures = enabled;
  // If disabling debug features, also disable the debuginfo toggle
  if (!enabled) {
    settings.enabledToggles = settings.enabledToggles.filter(t => t !== 'debuginfo');
  }
  saveSettings(settings);
  return true;
});

ipcMain.handle('save-show-thinking-by-default', (_, enabled: boolean) => {
  const settings = loadSettings();
  settings.showThinkingByDefault = enabled;
  saveSettings(settings);
  return true;
});

ipcMain.handle('save-wolfram-app-id', (_, appId: string) => {
  const settings = loadSettings();
  settings.wolframAppId = appId;
  saveSettings(settings);
  return true;
});

ipcMain.handle('save-theme', (_, theme: string) => {
  const settings = loadSettings();
  settings.theme = theme;
  saveSettings(settings);
  return true;
});

// Modes and toggles
ipcMain.handle('get-modes', () => loadModes());
ipcMain.handle('get-toggles', () => TOGGLES);
ipcMain.handle('is-packaged', () => app.isPackaged);

// Active branch check
ipcMain.handle('is-on-active-branch', () => {
  const basePath = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
  const packageJsonPath = path.join(basePath, 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.isOnActiveBranch === true;
  } catch {
    return false;
  }
});

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
  const togglePrompts = enabledToggles
    .filter(t => t.name !== 'debuginfo') // Handle debuginfo separately
    .map(t => t.prompt)
    .filter(p => p);
  if (togglePrompts.length > 0) {
    systemPrompt += togglePrompts.join('\n\n');
  }

  // Add debug info if enabled
  if (settings.enabledToggles.includes('debuginfo') && settings.debugFeatures) {
    const debugInfo = buildDebugInfo(settings, selectedMode, enabledToggles);
    systemPrompt += '\n\n' + debugInfo;
  }

  // Add user message to chat
  chat.messages.push({ role: 'user', content: userMessage });

  // Check which tools are enabled
  const enabledToolNames: string[] = [];
  if (settings.enabledToggles.includes('webfetch')) {
    enabledToolNames.push('web_fetch');
  }
  if (settings.enabledToggles.includes('wolfram')) {
    enabledToolNames.push('wolfram_alpha');
  }
  const enabledTools = TOOLS.filter(t => enabledToolNames.includes(t.name));
  const hasTools = enabledTools.length > 0;

  // Build request parameters
  const maxTokens = selectedMode?.maxTokens || 8192;
  const model = selectedMode?.model || 'claude-sonnet-4-20250514';

  try {
    // Build messages for the API
    let apiMessages: Anthropic.MessageParam[] = chat.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let assistantMessage = '';
    let thinkingBlockIndex = 0;
    let currentThinkingContent = '';
    const collectedThinkingBlocks: string[] = [];  // Collect all thinking blocks
    const collectedToolUses: Array<{ name: string; input: Record<string, unknown> }> = [];  // Collect all tool uses

    // Streaming response with optional tools
    const runStreamWithTools = async (): Promise<void> => {
      const streamParams: Anthropic.MessageStreamParams = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: apiMessages,
      };

      // Add tools if enabled
      if (hasTools) {
        streamParams.tools = enabledTools;
      }

      // Add extended thinking if enabled
      if (selectedMode?.extendedThinking && selectedMode?.thinkingBudget) {
        streamParams.thinking = {
          type: 'enabled',
          budget_tokens: selectedMode.thinkingBudget,
        };
      }

      // Use beta API if we have both tools and thinking (interleaved thinking)
      const needsInterleavedThinking = hasTools && selectedMode?.extendedThinking && selectedMode?.thinkingBudget;
      const stream = needsInterleavedThinking
        ? anthropicClient!.beta.messages.stream({ ...streamParams, betas: ['interleaved-thinking-2025-05-14'] })
        : anthropicClient!.messages.stream(streamParams);

      // Collect tool uses during streaming
      const pendingToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      stream.on('text', (text) => {
        assistantMessage += text;
        mainWindow?.webContents.send('stream-chunk', { chatId, text, fullMessage: assistantMessage });
      });

      // Handle streaming thinking deltas - supports multiple thinking blocks (interleaved thinking)
      stream.on('thinking', (_thinkingDelta, thinkingSnapshot) => {
        currentThinkingContent = thinkingSnapshot;
        mainWindow?.webContents.send('thinking-block', {
          chatId,
          thinking: currentThinkingContent,
          blockIndex: thinkingBlockIndex
        });
      });

      // Collect tool use and thinking blocks as they complete
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          pendingToolUses.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
          // Collect for persistence
          collectedToolUses.push({
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
          // Notify UI about tool use
          mainWindow?.webContents.send('tool-use', { chatId, tools: [{ name: block.name, input: block.input }] });
        } else if (block.type === 'thinking') {
          // Thinking block completed - save it and increment index for next thinking block
          if (block.thinking) {
            collectedThinkingBlocks.push(block.thinking);
          }
          thinkingBlockIndex++;
          currentThinkingContent = '';
        }
      });

      const finalMessage = await stream.finalMessage();

      // If there are tool uses, process them and continue
      if (finalMessage.stop_reason === 'tool_use' && pendingToolUses.length > 0) {
        // Add assistant's response to messages
        // Clean up content blocks to remove extra fields from beta API (like 'parsed')
        // but preserve required fields like 'signature' for thinking blocks
        const cleanContent = finalMessage.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text' as const, text: block.text };
          } else if (block.type === 'tool_use') {
            return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
          } else if (block.type === 'thinking') {
            // Must include signature for thinking blocks
            return { type: 'thinking' as const, thinking: block.thinking, signature: (block as { signature?: string }).signature };
          }
          return block;
        });
        apiMessages.push({ role: 'assistant', content: cleanContent as Anthropic.ContentBlockParam[] });

        // Process each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of pendingToolUses) {
          const result = await executeTool(toolUse.name, toolUse.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        // Add tool results
        apiMessages.push({ role: 'user', content: toolResults });

        // Continue the conversation (recursive call for more tool use)
        await runStreamWithTools();
      }
    };

    await runStreamWithTools();

    // Store the message with thinking blocks and tool uses if any were collected
    const assistantMsg: ChatMessage = { role: 'assistant', content: assistantMessage };
    if (collectedThinkingBlocks.length > 0) {
      assistantMsg.thinking = collectedThinkingBlocks;
    }
    if (collectedToolUses.length > 0) {
      assistantMsg.toolUses = collectedToolUses;
    }
    chat.messages.push(assistantMsg);
    chat.updatedAt = Date.now();
    // Reload chats to preserve any title updates made by generate-title
    const freshChats = loadChats();
    const freshChat = freshChats.find(c => c.id === chatId);
    if (freshChat) {
      freshChat.messages = chat.messages;
      freshChat.updatedAt = chat.updatedAt;
      saveChats(freshChats);
    } else {
      saveChats(chats);
    }

    mainWindow?.webContents.send('stream-end', { chatId });
    return { message: assistantMessage, thinking: currentThinkingContent, chat };
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
      system: 'You are a title generator. Your ONLY job is to generate a short, concise title (3-6 words) that summarizes what the user wants to discuss. You are NOT the assistant that will respond to this message - you are just creating a title for the chat. Do NOT try to answer the user\'s question or explain capabilities. Output ONLY the title text, nothing else. Do not use quotation marks. Do not use emojis.',
      messages: [{ role: 'user', content: `Generate a title for this chat message: "${userMessage}"` }],
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
  const togglePrompts = enabledToggles
    .filter(t => t.name !== 'debuginfo')
    .map(t => t.prompt)
    .filter(p => p);
  if (togglePrompts.length > 0) {
    systemPrompt += togglePrompts.join('\n\n');
  }

  // Add debug info if enabled
  if (settings.enabledToggles.includes('debuginfo') && settings.debugFeatures) {
    const debugInfo = buildDebugInfo(settings, selectedMode, enabledToggles);
    systemPrompt += '\n\n' + debugInfo;
  }

  const maxTokens = selectedMode?.maxTokens || 8192;
  const model = selectedMode?.model || 'claude-sonnet-4-20250514';

  try {
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
    const regenThinkingBlocks: string[] = [];
    let regenThinkingBlockIndex = 0;

    stream.on('text', (text) => {
      assistantMessage += text;
      mainWindow?.webContents.send('stream-chunk', { chatId, text, fullMessage: assistantMessage });
    });

    stream.on('thinking', (_thinkingDelta, thinkingSnapshot) => {
      thinkingContent = thinkingSnapshot;
      mainWindow?.webContents.send('thinking-block', { chatId, thinking: thinkingContent, blockIndex: regenThinkingBlockIndex });
    });

    stream.on('contentBlock', (block) => {
      if (block.type === 'thinking') {
        if (block.thinking) {
          regenThinkingBlocks.push(block.thinking);
        }
        regenThinkingBlockIndex++;
        thinkingContent = '';
      }
    });

    await stream.finalMessage();

    // Store the message with thinking blocks if any were collected
    const regenMsg: ChatMessage = { role: 'assistant', content: assistantMessage };
    if (regenThinkingBlocks.length > 0) {
      regenMsg.thinking = regenThinkingBlocks;
    }
    chat.messages.push(regenMsg);
    chat.updatedAt = Date.now();
    saveChats(chats);

    mainWindow?.webContents.send('stream-end', { chatId });
    return { message: assistantMessage, thinking: thinkingContent, chat };
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
