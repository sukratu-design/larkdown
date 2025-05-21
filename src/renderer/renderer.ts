import { Chat, ExportFormat } from '../common/types';
import { ChatModel } from '../models/chatModel'; 

// --- Type Definition for window.api ---
interface ExposedApi {
  authenticate: (apiToken: string) => Promise<{ success: boolean; token?: string; error?: string }>;
  checkAuthStatus: () => Promise<{ isAuthenticated: boolean }>;
  loadChats: () => Promise<{ success: boolean; chats?: Chat[]; error?: string }>;
  exportChat: (
    selectedChats: Chat[],
    startTime: number | null,
    endTime: number | null,
    format: ExportFormat
  ) => Promise<{ success: boolean; exports?: { chatId: string, path: string | null, messageCount: number, status: string, error?: string }[]; error?: string }>;
  onExportProgress: (
    callback: (progress: {
      chat_id?: string;
      status: string; 
      processed?: number;
      total?: number;
      percentage?: number;
      message?: string;
      path?: string;
      messageCount?: number;
      error?: string; 
      hasMore?: boolean;
      results?: any[];
    }) => void
  ) => () => void; 
  onCriticalAuthFailure: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    api: ExposedApi;
  }
}

// --- State Variables ---
let isAuthenticated = false;
let allChats: Chat[] = [];
let filteredChats: Chat[] = [];
let selectedChatIds: Set<string> = new Set();
let currentExportFormat: ExportFormat = 'html';

// For BUG-002: Progress tracking based on message volume
let chatProgressData = new Map<string, { 
    initialEstimate: number; // Small default value
    currentEstimate: number; // Updated by progress.total from main process for this chat
    processedMessages: number; 
    isCompleteOrFailed: boolean; // To ensure overall progress counts accurately
}>();
let grandTotalEstimatedMessages = 0;
let grandTotalProcessedMessages = 0;
let totalSelectedChatsForExport = 0; // Count of chats selected for export
let completedOrFailedChatsInCurrentExport = 0; // Count of chats that finished (success, error, cancel)

let unsubscribeExportProgress: (() => void) | null = null;
let unsubscribeCriticalAuthFailure: (() => void) | null = null;


// --- DOM Elements ---
const DOMElements = {
  globalLoader: (): HTMLElement => document.getElementById('global-loader')!,
  // Auth View
  authView: (): HTMLElement => document.getElementById('auth-view')!,
  apiTokenInput: (): HTMLInputElement => document.getElementById('api-token') as HTMLInputElement,
  saveTokenButton: (): HTMLButtonElement => document.getElementById('save-token-button') as HTMLButtonElement,
  authStatusDiv: (): HTMLElement => document.getElementById('auth-status')!,
  // Chat Selection View
  chatSelectionView: (): HTMLElement => document.getElementById('chat-selection-view')!,
  loadChatsButton: (): HTMLButtonElement => document.getElementById('load-chats-button') as HTMLButtonElement,
  chatSearchInput: (): HTMLInputElement => document.getElementById('chat-search') as HTMLInputElement,
  chatsListDiv: (): HTMLElement => document.getElementById('chats-list')!,
  selectAllChatsCheckbox: (): HTMLInputElement => document.getElementById('select-all-chats') as HTMLInputElement,
  selectedChatsCountP: (): HTMLElement => document.getElementById('selected-chats-count')!,
  // Export Config View
  exportConfigView: (): HTMLElement => document.getElementById('export-config-view')!,
  startDateInput: (): HTMLInputElement => document.getElementById('start-date') as HTMLInputElement,
  endDateInput: (): HTMLInputElement => document.getElementById('end-date') as HTMLInputElement,
  exportFormatSelect: (): HTMLSelectElement => document.getElementById('export-format') as HTMLSelectElement,
  startExportButton: (): HTMLButtonElement => document.getElementById('start-export-button') as HTMLButtonElement,
  // Export Progress View
  exportProgressView: (): HTMLElement => document.getElementById('export-progress-view')!,
  overallProgressBar: (): HTMLElement => document.getElementById('overall-progress-bar')!,
  overallProgressText: (): HTMLElement => document.getElementById('overall-progress-text')!,
  currentActionStatusP: (): HTMLElement => document.getElementById('current-action-status')!,
  individualChatProgressListDiv: (): HTMLElement => document.getElementById('individual-chat-progress-list')!,
  exportResultSummaryDiv: (): HTMLElement => document.getElementById('export-result-summary')!,
  exportDoneButton: (): HTMLButtonElement => document.getElementById('export-done-button') as HTMLButtonElement,
};

// --- UI Update Functions ---
function showView(view: HTMLElement) {
  DOMElements.authView().style.display = 'none';
  DOMElements.chatSelectionView().style.display = 'none';
  DOMElements.exportConfigView().style.display = 'none';
  DOMElements.exportProgressView().style.display = 'none';
  view.style.display = 'block';
}

function toggleGlobalLoader(show: boolean) {
    DOMElements.globalLoader().style.display = show ? 'flex' : 'none';
}

function updateAuthStatus(message: string, type: 'success' | 'warning' | 'error' | 'info') {
  const div = DOMElements.authStatusDiv();
  div.textContent = message;
  div.className = 'p-3 rounded-md mb-4 text-sm transition-all duration-300'; 
  if (type === 'success') div.classList.add('status-success');
  else if (type === 'warning') div.classList.add('status-warning');
  else if (type === 'error') div.classList.add('status-error');
  else div.classList.add('bg-blue-100', 'border', 'border-blue-300', 'text-blue-700'); 
}

function renderChatList() {
  const listDiv = DOMElements.chatsListDiv();
  listDiv.innerHTML = ''; 

  if (filteredChats.length === 0 && allChats.length > 0) {
    listDiv.innerHTML = `<p class="text-gray-500 italic text-center py-4">No chats found matching your search.</p>`;
  } else if (allChats.length === 0) {
     listDiv.innerHTML = `<p class="text-gray-500 italic text-center py-4">Click "Load Chats" or re-authenticate if needed.</p>`;
  }


  filteredChats.forEach(chat => {
    const displayName = ChatModel.getDisplayName(chat);
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = `
      <input type="checkbox" data-chat-id="${chat.chat_id}" ${selectedChatIds.has(chat.chat_id) ? 'checked' : ''} class="chat-checkbox">
      <div class="chat-item-details">
        <span class="chat-item-name">${displayName}</span>
        <small class="chat-item-id">ID: ${chat.chat_id}</small>
        ${chat.description ? `<small class="chat-item-description">${ChatModel.getDescription(chat)}</small>` : `<small class="chat-item-description">${ChatModel.getDescription(chat)}</small>`}
      </div>
    `;
    item.querySelector('.chat-checkbox')!.addEventListener('change', (e) => {
      const checkbox = e.target as HTMLInputElement;
      if (checkbox.checked) {
        selectedChatIds.add(chat.chat_id);
      } else {
        selectedChatIds.delete(chat.chat_id);
      }
      updateSelectedChatsCountAndExportButton();
    });
    listDiv.appendChild(item);
  });
  updateSelectedChatsCountAndExportButton();
}

function updateSelectedChatsCountAndExportButton() {
    const count = selectedChatIds.size;
    DOMElements.selectedChatsCountP().textContent = `Selected chats: ${count}`;
    DOMElements.startExportButton().disabled = count === 0;
    DOMElements.selectAllChatsCheckbox().checked = count > 0 && count === filteredChats.length && filteredChats.length > 0;
}


function filterChats() {
  const searchTerm = DOMElements.chatSearchInput().value.toLowerCase();
  if (!searchTerm) {
    filteredChats = [...allChats];
  } else {
    filteredChats = ChatModel.filterChats(allChats, searchTerm);
  }
  renderChatList();
}

// --- Event Handlers ---
async function handleSaveToken() {
  const token = DOMElements.apiTokenInput().value.trim();
  if (!token) {
    updateAuthStatus('API Token cannot be empty.', 'error');
    return;
  }
  toggleGlobalLoader(true);
  updateAuthStatus('Validating token...', 'info');
  try {
    const result = await window.api.authenticate(token);
    if (result.success) {
      isAuthenticated = true;
      updateAuthStatus('Token saved and validated successfully!', 'success');
      DOMElements.apiTokenInput().value = ''; 
      showView(DOMElements.chatSelectionView());
      DOMElements.exportConfigView().style.display = 'block'; 
      await handleLoadChats(); 
    } else {
      isAuthenticated = false;
      updateAuthStatus(`Authentication failed: ${result.error || 'Unknown error'}`, 'error');
    }
  } catch (err: any) {
    isAuthenticated = false;
    updateAuthStatus(`Error during authentication: ${err.message || err}`, 'error');
  } finally {
    toggleGlobalLoader(false);
  }
}

async function handleLoadChats() {
  toggleGlobalLoader(true);
  DOMElements.chatsListDiv().innerHTML = `<p class="text-gray-500 italic text-center py-4">Loading chats...</p>`;
  try {
    const result = await window.api.loadChats();
    if (result.success && result.chats) {
      allChats = ChatModel.sortChats(result.chats); 
      filterChats(); 
      if (allChats.length === 0) {
         DOMElements.chatsListDiv().innerHTML = `<p class="text-gray-500 italic text-center py-4">No chats found. Ensure your token has permissions or try re-authenticating.</p>`;
      }
    } else {
        if (result.error && (result.error.includes('Authentication failed') || result.error.includes('API Service not initialized') || result.error.includes('Token is missing'))) {
             handleCriticalAuthFailure();
        } else {
             DOMElements.chatsListDiv().innerHTML = `<p class="text-red-500 italic text-center py-4">Failed to load chats: ${result.error || 'Unknown error'}</p>`;
        }
    }
  } catch (err: any) {
     if (err.message && (err.message.includes('Authentication failed') || err.message.includes('API Service not initialized') || err.message.includes('Token is missing'))) {
         handleCriticalAuthFailure();
     } else {
         DOMElements.chatsListDiv().innerHTML = `<p class="text-red-500 italic text-center py-4">Error loading chats: ${err.message || err}</p>`;
     }
  } finally {
    toggleGlobalLoader(false);
  }
}

function handleSelectAllChats(e: Event) {
    const isChecked = (e.target as HTMLInputElement).checked;
    selectedChatIds.clear();
    if (isChecked) {
        filteredChats.forEach(chat => selectedChatIds.add(chat.chat_id));
    }
    renderChatList(); 
}


async function handleStartExport() {
  if (selectedChatIds.size === 0) {
    alert('Please select at least one chat to export.');
    return;
  }

  const chatsToExport = allChats.filter(chat => selectedChatIds.has(chat.chat_id));
  totalSelectedChatsForExport = chatsToExport.length;
  completedOrFailedChatsInCurrentExport = 0;

  // Reset progress data for BUG-002
  chatProgressData.clear();
  grandTotalEstimatedMessages = 0;
  grandTotalProcessedMessages = 0;

  const initialEstimatePerChat = 50; // Default initial estimate if API doesn't provide one early

  chatsToExport.forEach(chat => {
    chatProgressData.set(chat.chat_id, { 
      initialEstimate: initialEstimatePerChat,
      currentEstimate: initialEstimatePerChat, 
      processedMessages: 0,
      isCompleteOrFailed: false 
    });
    grandTotalEstimatedMessages += initialEstimatePerChat;
  });


  const startDateVal = DOMElements.startDateInput().value;
  const endDateVal = DOMElements.endDateInput().value;
  
  let startTime: number | null = null;
  if (startDateVal) {
    startTime = DOMElements.startDateInput().valueAsDate?.getTime() || null; 
  }

  let endTime: number | null = null;
  if (endDateVal) {
    const ed = DOMElements.endDateInput().valueAsDate;
    if (ed) {
        ed.setHours(23, 59, 59, 999); 
        endTime = ed.getTime(); 
    }
  }

  if (startTime !== null && endTime !== null && startTime > endTime) {
    alert('Start date cannot be after end date.');
    return;
  }

  currentExportFormat = DOMElements.exportFormatSelect().value as ExportFormat;

  showView(DOMElements.exportProgressView());
  DOMElements.exportResultSummaryDiv().style.display = 'none';
  DOMElements.exportResultSummaryDiv().innerHTML = '';
  DOMElements.individualChatProgressListDiv().innerHTML = ''; 
  DOMElements.currentActionStatusP().textContent = `Initializing export for ${totalSelectedChatsForExport} chat(s)...`;
  DOMElements.overallProgressBar().style.width = '0%';
  DOMElements.overallProgressText().textContent = '0%';
  DOMElements.exportDoneButton().style.display = 'none';


  chatsToExport.forEach(chat => {
    const displayName = ChatModel.getDisplayName(chat);
    const progressItem = document.createElement('div');
    progressItem.id = `progress-item-${chat.chat_id}`;
    progressItem.className = 'progress-item-container border-gray-200 flex flex-col';
    progressItem.innerHTML = `
      <div class="progress-item-header">
        <span class="progress-item-name" title="${displayName}">${displayName}</span>
        <span class="progress-item-status-badge pending">Pending</span>
      </div>
       <div class="w-full bg-gray-200 rounded-full h-1.5 mb-1">
           <div class="progress-chat-bar bg-blue-500 h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
       </div>
      <p class="progress-item-message text-xs text-gray-500">Waiting to start...</p>
    `;
    DOMElements.individualChatProgressListDiv().appendChild(progressItem);
  });
  
  toggleGlobalLoader(false); 

  if (unsubscribeExportProgress) unsubscribeExportProgress(); 
  unsubscribeExportProgress = window.api.onExportProgress(handleExportProgress);

  try {
    console.log(`Renderer: Starting export with ${chatsToExport.length} chats. Start: ${startTime}, End: ${endTime}, Format: ${currentExportFormat}`);
    await window.api.exportChat(chatsToExport, startTime, endTime, currentExportFormat);
    console.log('Renderer: IPC exportChat call finished.');
  } catch (err: any) {
    console.error('Renderer: Error calling exportChat IPC handler:', err);
    DOMElements.currentActionStatusP().textContent = `Failed to initiate export: ${err.message || err}`;
    DOMElements.exportResultSummaryDiv().innerHTML = `<p>A critical error occurred: ${err.message || err}</p>`;
    DOMElements.exportResultSummaryDiv().className = 'mt-6 p-4 rounded-md status-error';
    DOMElements.exportResultSummaryDiv().style.display = 'block';
    DOMElements.exportDoneButton().style.display = 'block';
  }
}

function updateIndividualChatProgressUI(progress: any) {
  const itemDiv = document.getElementById(`progress-item-${progress.chat_id}`);
  if (!itemDiv) {
    console.warn(`Progress item for chat_id ${progress.chat_id} not found.`);
    return;
  }

  const statusBadge = itemDiv.querySelector('.progress-item-status-badge') as HTMLElement;
  const messageP = itemDiv.querySelector('.progress-item-message') as HTMLElement;
  const progressBar = itemDiv.querySelector('.progress-chat-bar') as HTMLElement;

  statusBadge.textContent = progress.status;
  statusBadge.className = 'progress-item-status-badge'; // Reset all color classes
  let statusMessage = progress.message || progress.status;

  itemDiv.classList.remove('border-green-500', 'border-red-500', 'border-orange-500', 'border-blue-300', 'border-yellow-300', 'border-gray-200');
  progressBar.classList.remove('bg-blue-500', 'bg-yellow-400', 'bg-green-500', 'bg-red-500', 'bg-gray-300');
  progressBar.classList.add('transition-all', 'duration-300');


  switch (progress.status) {
    case 'In Progress':
      statusBadge.classList.add('in-progress');
      itemDiv.classList.add('border-blue-300');
      progressBar.classList.add('bg-blue-500');
      if (progress.percentage !== undefined) {
          progressBar.style.width = `${progress.percentage}%`;
      }
      break;
    case 'Processing':
      statusBadge.classList.add('processing');
      itemDiv.classList.add('border-yellow-300');
      progressBar.classList.add('bg-yellow-400');
      progressBar.style.width = '100%'; 
      break;
    case 'Complete':
      statusBadge.classList.add('completed');
      itemDiv.classList.add('border-green-500');
      progressBar.classList.add('bg-green-500');
      progressBar.style.width = '100%';
      if (progress.path) {
        statusMessage = `Completed. ${progress.messageCount || 0} messages. Path: ${progress.path}`;
        messageP.setAttribute('title', `File saved at: ${progress.path}`);
      }
      break;
    case 'Error':
      statusBadge.classList.add('failed');
      itemDiv.classList.add('border-red-500');
      progressBar.classList.add('bg-red-500');
      progressBar.style.width = '100%'; 
      statusMessage = `Error: ${progress.error || progress.message || 'Unknown error'}`;
      break;
    case 'Cancelled':
      statusBadge.classList.add('cancelled');
      itemDiv.classList.add('border-orange-500');
      progressBar.classList.add('bg-gray-300');
      progressBar.style.width = '0%';
      break;
    default: // Pending
      statusBadge.classList.add('pending');
      itemDiv.classList.add('border-gray-200');
      progressBar.classList.add('bg-gray-300');
      progressBar.style.width = '0%';
  }
  messageP.textContent = statusMessage;
}

function handleExportProgress(progress: any) {
  console.log('Renderer received Export Progress:', JSON.stringify(progress));

  if (progress.chat_id) {
    updateIndividualChatProgressUI(progress); // Update specific chat UI

    // Logic for BUG-002: Update overall progress based on message volume
    const chatData = chatProgressData.get(progress.chat_id);
    if (chatData) {
      const oldProcessedForThisChat = chatData.processedMessages;
      const oldEstimateForThisChat = chatData.currentEstimate;

      let newProcessedForThisChat = chatData.processedMessages;
      if (typeof progress.processed === 'number') {
        newProcessedForThisChat = progress.processed;
      }
      
      let newEstimateForThisChat = chatData.currentEstimate;
      // `progress.total` is the rolling estimate for *this chat* from apiService
      if (typeof progress.total === 'number' && progress.total > 0) {
         newEstimateForThisChat = progress.total;
      }

      // Update grand totals
      grandTotalProcessedMessages = grandTotalProcessedMessages - oldProcessedForThisChat + newProcessedForThisChat;
      grandTotalEstimatedMessages = grandTotalEstimatedMessages - oldEstimateForThisChat + newEstimateForThisChat;
      
      chatData.processedMessages = newProcessedForThisChat;
      chatData.currentEstimate = newEstimateForThisChat;

      if ((progress.status === 'Complete' || progress.status === 'Error' || progress.status === 'Cancelled')) {
          if (!chatData.isCompleteOrFailed) {
              completedOrFailedChatsInCurrentExport++;
              chatData.isCompleteOrFailed = true;
              
              // Final adjustment for this chat's contribution to totals
              const finalCount = progress.messageCount !== undefined ? progress.messageCount : newProcessedForThisChat;
              grandTotalProcessedMessages = grandTotalProcessedMessages - chatData.processedMessages + finalCount;
              grandTotalEstimatedMessages = grandTotalEstimatedMessages - chatData.currentEstimate + finalCount;
              chatData.processedMessages = finalCount;
              chatData.currentEstimate = finalCount; // Estimate becomes actual
          }
      }
    }
  } else { 
    // Overall status message (e.g., 'All Done' or global error)
    DOMElements.currentActionStatusP().textContent = progress.message || progress.status;

    if (progress.status === 'All Done') {
      DOMElements.currentActionStatusP().textContent = progress.message || 'All exports finished.';
      const results = progress.results || [];
      const successCount = results.filter((r:any) => r.status === 'Complete').length;
      const failureCount = results.filter((r:any) => r.status === 'Error').length;
      const cancelledCount = results.filter((r:any) => r.status === 'Cancelled').length;

      let summaryHtml = `<p>${progress.message || 'All selected chats have been processed.'}</p>
                         <p class="font-semibold mt-2">Summary:</p>
                         <ul class="list-disc list-inside text-sm">
                           <li>Completed: ${successCount}</li>
                           <li>Failed: ${failureCount}</li>
                           <li>Cancelled: ${cancelledCount}</li>
                         </ul>`;
      DOMElements.exportResultSummaryDiv().innerHTML = summaryHtml;
      DOMElements.exportResultSummaryDiv().className = 'mt-6 p-4 rounded-md status-success';
      DOMElements.exportResultSummaryDiv().style.display = 'block';
      DOMElements.exportDoneButton().style.display = 'block';
      toggleGlobalLoader(false);
      // Ensure overall progress bar reflects 100% if all done based on chat counts
      DOMElements.overallProgressBar().style.width = '100%';
      DOMElements.overallProgressText().textContent = '100%';

    } else if (progress.status === 'Error' && !progress.chat_id) { 
      DOMElements.currentActionStatusP().textContent = `Export failed: ${progress.error || progress.message || 'Unknown critical error'}`;
      DOMElements.exportResultSummaryDiv().innerHTML = `<p>A critical error occurred during export: ${progress.error || progress.message || 'Unknown error'}</p>`;
      DOMElements.exportResultSummaryDiv().className = 'mt-6 p-4 rounded-md status-error';
      DOMElements.exportResultSummaryDiv().style.display = 'block';
      DOMElements.exportDoneButton().style.display = 'block';
      toggleGlobalLoader(false);
    }
  }

  // Update overall progress bar consistently
  if (grandTotalEstimatedMessages > 0) {
      const overallPercentage = Math.min(100, Math.round((grandTotalProcessedMessages / grandTotalEstimatedMessages) * 100));
      DOMElements.overallProgressBar().style.width = `${overallPercentage}%`;
      DOMElements.overallProgressText().textContent = `${overallPercentage}%`;
  } else if (totalSelectedChatsForExport > 0 && completedOrFailedChatsInCurrentExport === totalSelectedChatsForExport) {
      // Fallback if estimates were off but all chats are processed
      DOMElements.overallProgressBar().style.width = '100%';
      DOMElements.overallProgressText().textContent = '100%';
  } else if (totalSelectedChatsForExport === 0) { // No chats selected or cleared
      DOMElements.overallProgressBar().style.width = '0%';
      DOMElements.overallProgressText().textContent = '0%';
  }

}


function handleExportDone() {
    selectedChatIds.clear(); 
    allChats = []; // Clear loaded chats to force refresh if user wants to do another export
    filteredChats = [];

    // Reset progress tracking state
    chatProgressData.clear();
    grandTotalEstimatedMessages = 0;
    grandTotalProcessedMessages = 0;
    totalSelectedChatsForExport = 0;
    completedOrFailedChatsInCurrentExport = 0;

    DOMElements.overallProgressBar().style.width = '0%';
    DOMElements.overallProgressText().textContent = '0%';
    DOMElements.currentActionStatusP().textContent = 'Initializing export...';
    DOMElements.individualChatProgressListDiv().innerHTML = ''; 
    DOMElements.exportResultSummaryDiv().style.display = 'none';
    DOMElements.exportResultSummaryDiv().innerHTML = '';
    DOMElements.exportDoneButton().style.display = 'none';
    DOMElements.chatSearchInput().value = '';

    showView(DOMElements.chatSelectionView());
    DOMElements.exportConfigView().style.display = 'block'; 
    
    renderChatList(); // This will show "Click Load Chats"
    updateAuthStatus('Ready for new export or load chats again.', 'info'); // Update auth status message too
}

function handleCriticalAuthFailure() {
    console.warn("Renderer: Critical auth failure detected. Redirecting to auth view.");
    isAuthenticated = false;
    // apiService reference is in main process, renderer doesn't have its own
    updateAuthStatus('Authentication token is invalid or session expired. Please re-authenticate.', 'error');
    showView(DOMElements.authView());
    DOMElements.exportConfigView().style.display = 'none';
    DOMElements.chatSelectionView().style.display = 'none'; // Hide chat selection as well
    allChats = []; // Clear chat data
    filteredChats = [];
    selectedChatIds.clear();
    renderChatList(); // Clear UI list
    toggleGlobalLoader(false); // Ensure loader is off

    // Reset any ongoing export UI state as well
    DOMElements.exportProgressView().style.display = 'none';
    DOMElements.individualChatProgressListDiv().innerHTML = '';
    DOMElements.exportResultSummaryDiv().style.display = 'none';
    DOMElements.overallProgressBar().style.width = '0%';
    DOMElements.overallProgressText().textContent = '0%';
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  DOMElements.endDateInput().valueAsDate = today;
  DOMElements.startDateInput().valueAsDate = sevenDaysAgo;

  DOMElements.saveTokenButton().addEventListener('click', handleSaveToken);
  DOMElements.loadChatsButton().addEventListener('click', handleLoadChats);
  DOMElements.chatSearchInput().addEventListener('input', filterChats);
  DOMElements.selectAllChatsCheckbox().addEventListener('change', handleSelectAllChats);
  DOMElements.startExportButton().addEventListener('click', handleStartExport);
  DOMElements.exportDoneButton().addEventListener('click', handleExportDone);

  toggleGlobalLoader(true);
  try {
    const status = await window.api.checkAuthStatus();
    if (status.isAuthenticated) {
      isAuthenticated = true;
      updateAuthStatus('Previously authenticated. Token loaded and validated.', 'info');
      showView(DOMElements.chatSelectionView());
      DOMElements.exportConfigView().style.display = 'block';
      await handleLoadChats(); 
    } else {
      // If checkAuthStatus returns false, it might be due to failed validation in AuthService
      // which would have triggered critical-auth-failure if it was a critical error.
      // If not critical (e.g. first run, no token), show default auth message.
      if (!DOMElements.authStatusDiv().textContent?.includes('invalid')) { // Avoid overwriting specific error from critical failure
          updateAuthStatus('Please provide an API Token to begin.', 'info');
      }
      showView(DOMElements.authView());
    }
  } catch (err: any) {
    updateAuthStatus(`Error checking auth status: ${err.message || err}`, 'error');
    showView(DOMElements.authView());
  } finally {
    toggleGlobalLoader(false);
  }

  // Subscribe to export progress
  if (unsubscribeExportProgress) unsubscribeExportProgress();
  unsubscribeExportProgress = window.api.onExportProgress(handleExportProgress);

  // Subscribe to critical auth failures
  if (unsubscribeCriticalAuthFailure) unsubscribeCriticalAuthFailure();
  unsubscribeCriticalAuthFailure = window.api.onCriticalAuthFailure(handleCriticalAuthFailure);
});

window.addEventListener('beforeunload', () => {
  if (unsubscribeExportProgress) {
    unsubscribeExportProgress();
    unsubscribeExportProgress = null;
  }
  if (unsubscribeCriticalAuthFailure) {
    unsubscribeCriticalAuthFailure();
    unsubscribeCriticalAuthFailure = null;
  }
});

