import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Chats
  getChats: () => ipcRenderer.invoke('get-chats'),
  createChat: (name: string) => ipcRenderer.invoke('create-chat', name),
  renameChat: (id: string, newName: string) => ipcRenderer.invoke('rename-chat', id, newName),
  deleteChat: (id: string) => ipcRenderer.invoke('delete-chat', id),
  getChat: (id: string) => ipcRenderer.invoke('get-chat', id),
  updateChatMessages: (id: string, messages: Array<{ role: string; content: string }>) =>
    ipcRenderer.invoke('update-chat-messages', id, messages),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getActualSettings: () => ipcRenderer.invoke('get-actual-settings'),
  saveApiKey: (apiKey: string) => ipcRenderer.invoke('save-api-key', apiKey),
  saveMode: (mode: string) => ipcRenderer.invoke('save-mode', mode),
  saveToggles: (toggles: string[]) => ipcRenderer.invoke('save-toggles', toggles),
  saveDebugFeatures: (enabled: boolean) => ipcRenderer.invoke('save-debug-features', enabled),
  saveShowThinkingByDefault: (enabled: boolean) => ipcRenderer.invoke('save-show-thinking-by-default', enabled),

  // Modes and toggles
  getModes: () => ipcRenderer.invoke('get-modes'),
  getToggles: () => ipcRenderer.invoke('get-toggles'),
  isPackaged: () => ipcRenderer.invoke('is-packaged'),
  isOnActiveBranch: () => ipcRenderer.invoke('is-on-active-branch'),

  // Messages
  sendMessage: (chatId: string, message: string) => ipcRenderer.invoke('send-message', chatId, message),
  generateTitle: (chatId: string, userMessage: string) => ipcRenderer.invoke('generate-title', chatId, userMessage),
  regenerateMessage: (chatId: string, messageIndex: number) => ipcRenderer.invoke('regenerate-message', chatId, messageIndex),
  editMessage: (chatId: string, messageIndex: number, newContent: string) => ipcRenderer.invoke('edit-message', chatId, messageIndex, newContent),

  // Streaming events
  onStreamChunk: (callback: (data: { chatId: string; text: string; fullMessage: string }) => void) => {
    ipcRenderer.on('stream-chunk', (_, data) => callback(data));
  },
  onStreamEnd: (callback: (data: { chatId: string }) => void) => {
    ipcRenderer.on('stream-end', (_, data) => callback(data));
  },
  onThinkingBlock: (callback: (data: { chatId: string; thinking: string; blockIndex?: number }) => void) => {
    ipcRenderer.on('thinking-block', (_, data) => callback(data));
  },
  onToolUse: (callback: (data: { chatId: string; tools: Array<{ name: string; input: unknown }> }) => void) => {
    ipcRenderer.on('tool-use', (_, data) => callback(data));
  },
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('stream-chunk');
    ipcRenderer.removeAllListeners('stream-end');
    ipcRenderer.removeAllListeners('thinking-block');
    ipcRenderer.removeAllListeners('tool-use');
  },
});
