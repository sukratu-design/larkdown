import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import { AuthService } from '../services/authService';
import { ApiService } from '../services/apiService';
import { ExportFormat, Message, Chat } from '../common/types';
import { DataProcessingService } from '../services/dataProcessingService';
import { ERROR_MESSAGES, UI_MESSAGES, DEFAULT_EXPORT_FILENAME_PREFIX } from '../common/constants';
import { log } from '../common/utils';


// Global references
let mainWindow: BrowserWindow | null = null;

const authService = new AuthService(() => {
  log('info', 'Critical authentication failure detected by AuthService. Notifying renderer.');
  mainWindow?.webContents.send('critical-auth-failure');
});

let apiService: ApiService | null = null;
const dataProcessingService = new DataProcessingService();

function createWindow() {
  log('info', 'Creating main window...');
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, '../../index.html'));
  } else {
    mainWindow.loadFile('index.html'); 
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    log('info', 'Main window closed.');
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  log('info', 'Electron app ready.');
  createWindow();

  app.on('activate', () => {
    if (mainWindow === null) {
      log('info', 'App activated, creating window.');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  log('info', 'All windows closed.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

ipcMain.handle('authenticate', async (_, apiToken: string) => {
  log('info', 'IPC: authenticate request received.');
  try {
    await authService.setTenantAccessTokenFromInput(apiToken);
    // ApiService is re-initialized here to ensure it uses the new token immediately
    apiService = new ApiService(authService); 
    const isAuthenticated = await authService.isAuthenticated(); // This now includes API validation

    if (isAuthenticated) {
      log('info', 'Authentication successful after token input and validation.');
      return { success: true, token: apiToken }; 
    } else {
      // isAuthenticated would have called logout(true) if validation failed critically
      log('warn', 'Authentication failed after setting token (isAuthenticated returned false).');
      throw new Error(ERROR_MESSAGES.AUTHENTICATION_FAILED);
    }
  } catch (error: any) {
    log('error', 'Authentication error in IPC handler:', error.message);
    // authService.logout(true) might have already been called if error originated there
    return {
      success: false,
      error: error.message || ERROR_MESSAGES.AUTHENTICATION_FAILED
    };
  }
});

ipcMain.handle('check-auth-status', async () => {
  log('info', 'IPC: check-auth-status request received.');
  const isAuthenticated = await authService.isAuthenticated(); // This now includes API validation
  if (isAuthenticated) {
    if (!apiService) {
        log('info', 'Auth status check: Authenticated, initializing ApiService.');
        apiService = new ApiService(authService);
    }
  } else {
    log('info', 'Auth status check: Not authenticated (or validation failed).');
    apiService = null; 
    // If isAuthenticated returned false due to critical failure, AuthService already called the callback
  }
  return { isAuthenticated };
});

ipcMain.handle('load-chats', async () => {
  log('info', 'IPC: load-chats request received.');
  try {
    if (!apiService) {
      log('warn', 'Load chats: API Service not initialized. Attempting re-auth check.');
      // Trigger auth check which might re-initialize apiService or signal critical failure
      const authStatus = await authService.isAuthenticated();
      if (!authStatus || !apiService) {
        throw new Error(ERROR_MESSAGES.API_SERVICE_NOT_INITIALIZED);
      }
    }
    const chats = await apiService.getChats();
    log('info', `Successfully loaded ${chats.length} chats.`);
    return { success: true, chats };
  } catch (error: any) {
    log('error', 'Error loading chats in IPC handler:', error.message);
    // If the error is due to auth, ApiService/AuthService should have triggered critical logout
    return {
      success: false,
      error: error.message || ERROR_MESSAGES.CHAT_LOAD_FAILED
    };
  }
});

ipcMain.handle('export-chat', async (_, selectedChats: Chat[], startTime: number | null, endTime: number | null, format: ExportFormat) => {
  log('info', `IPC: export-chat request for ${selectedChats.length} chats, format: ${format}, start: ${startTime}, end: ${endTime}.`);
  if (!apiService) {
    const errorMsg = ERROR_MESSAGES.API_SERVICE_NOT_INITIALIZED;
    log('error', `Export chat: ${errorMsg}`);
     mainWindow?.webContents.send('export-progress', { 
        status: 'Error', 
        message: errorMsg,
        error: errorMsg 
    });
    return { success: false, error: errorMsg };
  }

  if (!mainWindow) {
    const errorMsg = 'Main window not available for save dialog.';
    log('error', `Export chat: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const exportResults: { chatId: string, path: string | null, messageCount: number, status: 'Complete' | 'Cancelled' | 'Error', error?: string }[] = [];
  const totalSelectedChats = selectedChats.length;

  for (const chat of selectedChats) {
    const chatId = chat.chat_id;
    const chatDisplayName = chat.name || `Chat_${chat.chat_id.substring(0, 8)}`;
    log('info', `Starting export for chat: ${chatDisplayName} (ID: ${chatId})`);

    try {
      mainWindow.webContents.send('export-progress', {
        chat_id: chatId,
        status: 'In Progress', // Initial status before dialog
        message: `Preparing to export ${chatDisplayName}...`
      });

      const defaultFileName = `${DEFAULT_EXPORT_FILENAME_PREFIX}_${chatDisplayName.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.${format}`;
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: `Save Export for ${chatDisplayName}`,
        defaultPath: defaultFileName,
        filters: [
          { name: `${format.toUpperCase()} Files`, extensions: [format] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (canceled || !filePath) {
        log('info', `User cancelled save dialog for chat ${chatId}.`);
        mainWindow.webContents.send('export-progress', {
          chat_id: chatId,
          status: 'Cancelled',
          message: UI_MESSAGES.EXPORT_SINGLE_CANCELLED
        });
        exportResults.push({ chatId, path: null, messageCount: 0, status: 'Cancelled' });
        continue; 
      }

      log('info', `Saving chat ${chatId} to ${filePath}`);
      let messagesProcessedThisChat = 0;
      let totalEstimatedMessagesForThisChat = 0;
      let hasMoreMessagesForThisChat = true;

      const chatProgressCallback = (processed: number, totalEstimate: number, hasMore: boolean) => {
        messagesProcessedThisChat = processed;
        totalEstimatedMessagesForThisChat = totalEstimate;
        hasMoreMessagesForThisChat = hasMore;

        const percentage = totalEstimate > 0 ? Math.round((processed / totalEstimate) * 100) : (hasMore ? 0 : (processed > 0 ? 100 : 0));
        mainWindow?.webContents.send('export-progress', {
          chat_id: chatId,
          status: 'In Progress',
          processed: messagesProcessedThisChat,
          total: totalEstimatedMessagesForThisChat, // This is the estimate for THIS chat
          percentage: percentage,
          message: UI_MESSAGES.EXPORT_PROGRESS_FETCHING.replace('{0}', String(processed)).replace('{1}', String(totalEstimate)).replace('{2}', String(percentage)),
          hasMore: hasMoreMessagesForThisChat
        });
      };
      
      const actualStartTime = startTime === null ? 0 : startTime;
      const actualEndTime = endTime === null ? Date.now() + (1000 * 60 * 60 * 24 * 365 * 10) : endTime; // Far future if no end date

      const rawMessages: Message[] = await apiService.getMessages(
        chatId,
        actualStartTime,
        actualEndTime,
        chatProgressCallback
      );

      log('info', `Fetched ${rawMessages.length} messages for chat ${chatId}. Processing...`);
      mainWindow.webContents.send('export-progress', {
        chat_id: chatId,
        status: 'Processing',
        processed: rawMessages.length,
        total: rawMessages.length, // Final count for this chat
        percentage: 100,
        message: UI_MESSAGES.EXPORT_PROGRESS_PROCESSING,
        hasMore: false 
      });

      const exportData = dataProcessingService.processMessages(rawMessages, format, chatDisplayName);

      log('info', `Writing ${format.toUpperCase()} data to file for chat ${chatId}.`);
      await writeFile(filePath, exportData, { encoding: 'utf-8' });

      exportResults.push({ chatId, path: filePath, messageCount: rawMessages.length, status: 'Complete' });
      mainWindow.webContents.send('export-progress', {
        chat_id: chatId,
        status: 'Complete',
        path: filePath,
        messageCount: rawMessages.length,
        message: UI_MESSAGES.EXPORT_SINGLE_COMPLETE.replace('{0}', String(rawMessages.length))
      });
      log('info', `Successfully exported chat ${chatId} to ${filePath}.`);

    } catch (error: any) {
      log('error', `Export error for chat ${chatId}:`, error.message, error.stack);
      const errorMessage = error.message || ERROR_MESSAGES.EXPORT_FAILED;
      exportResults.push({ chatId, path: null, messageCount: 0, status: 'Error', error: errorMessage });
      if (mainWindow) {
        mainWindow.webContents.send('export-progress', {
          chat_id: chatId,
          status: 'Error',
          message: UI_MESSAGES.EXPORT_SINGLE_ERROR.replace('{0}', errorMessage),
          error: errorMessage
        });
      }
    }
  }

  const successfulExports = exportResults.filter(r => r.status === 'Complete').length;
  log('info', `Export process finished for all selected chats. Successful: ${successfulExports}/${totalSelectedChats}.`);
  if (mainWindow) {
    mainWindow.webContents.send('export-progress', {
      status: 'All Done',
      message: `${UI_MESSAGES.EXPORT_ALL_DONE} ${successfulExports} of ${totalSelectedChats} chat(s) processed.`,
      results: exportResults // Send detailed results if needed
    });
  }

  return { success: true, exports: exportResults };
});

