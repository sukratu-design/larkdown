import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ExportFormat, Chat } from '../common/types'; // Ensure Chat is imported if used in types

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Authentication
    authenticate: (apiToken: string) => // Changed from appId, appSecret
      ipcRenderer.invoke('authenticate', apiToken),
    
    checkAuthStatus: () => 
      ipcRenderer.invoke('check-auth-status'),
    
    // Chat Management
    loadChats: () => 
      ipcRenderer.invoke('load-chats'),
    
    // Export
    exportChat: (selectedChats: Chat[], startTime: number | null, endTime: number | null, format: ExportFormat) => 
      ipcRenderer.invoke('export-chat', selectedChats, startTime, endTime, format),
    
    // Events
    onExportProgress: (callback: (progress: {
        chat_id?: string;
        status: string; // 'In Progress', 'Processing', 'Complete', 'Error', 'Cancelled', 'All Done'
        processed?: number; // messages processed for this chat
        total?: number;     // estimated total messages for THIS chat
        percentage?: number;
        message?: string;
        path?: string;      // path to exported file for a specific chat
        messageCount?: number; // final message count for a specific chat
        error?: string;     // specific error message for this chat or overall
        hasMore?: boolean;  // specific to 'In Progress' for fetching messages
        results?: any[];    // final summary of all exports (on 'All Done')
    }) => void) => {
      const subscription = (_event: IpcRendererEvent, progress: any) => callback(progress);
      ipcRenderer.on('export-progress', subscription);
      
      return () => {
        ipcRenderer.removeListener('export-progress', subscription);
      };
    },

    // Listener for critical authentication failures
    onCriticalAuthFailure: (callback: () => void) => {
        const subscription = () => callback();
        ipcRenderer.on('critical-auth-failure', subscription);
        return () => {
            ipcRenderer.removeListener('critical-auth-failure', subscription);
        };
    }
  }
);

