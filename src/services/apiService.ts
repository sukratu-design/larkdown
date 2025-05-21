import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { AuthService } from './authService';
import {
  Chat,
  Message,
  ChatListResponse,
  MessageListResponse
} from '../common/types';
import { FEISHU_API_BASE_URL, API_ENDPOINTS, API_RATE_LIMIT, ERROR_MESSAGES } from '../common/constants';
import { sleep, formatDateForAPI, log } from '../common/utils';

/**
 * ApiService handles all interaction with the Lark/Feishu API.
 * It manages requests, retries, and pagination with rate limiting.
 */
export class ApiService {
  private authService: AuthService;
  private httpClient: AxiosInstance;
  private rateLimitQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(authService: AuthService) {
    this.authService = authService;
    log('info', 'ApiService initialized.');

    this.httpClient = axios.create({
      baseURL: FEISHU_API_BASE_URL,
      timeout: 15000 // 15 seconds
    });

    this.httpClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      try {
        const token = await this.authService.getTenantAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      } catch (error) {
        // This could happen if getTenantAccessToken throws (e.g., token missing after logout)
        log('error', 'Axios Request Interceptor: Failed to get tenant access token.', error);
        // Signal critical auth failure if token cannot be retrieved
        this.authService.logout(true); 
        return Promise.reject(new Error(ERROR_MESSAGES.TOKEN_MISSING));
      }
    }, (error) => {
        log('error', 'Axios Request Interceptor Error:', error);
        return Promise.reject(error);
    });

    this.httpClient.interceptors.response.use(response => {
        if (response.data && typeof response.data.code === 'number') {
            if (response.data.code === 0) {
                 return response;
            }
             log('warn', `Feishu API Error Code: ${response.data.code}, Message: ${response.data.msg}, Request: ${response.config.url}`);
            if (response.data.code === 99991663 || response.data.code === 99991664 ) { // Invalid tenant_access_token or token expired
                log('error', 'Tenant access token invalid or expired. Logging out critically.');
                this.authService.logout(true); 
                return Promise.reject(new Error(ERROR_MESSAGES.AUTHENTICATION_FAILED + ` (Code: ${response.data.code})`));
            }
            if (response.data.code === 99991672) { // Rate limit exceeded
                 log('warn', 'Feishu API rate limit exceeded (Code 99991672).');
                 return Promise.reject(new Error(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED + ` (Code: ${response.data.code})`));
            }
             return Promise.reject(new Error(`Feishu API Error: ${response.data.msg} (Code: ${response.data.code})`));
        }
        // If response.data.code is not present or not a number, but status indicates error
        if (response.status >= 400) {
             log('error', `HTTP Error: ${response.status} - ${response.statusText}`, response.data);
             return Promise.reject(new Error(`HTTP Error: ${response.status} ${response.statusText}`));
         }
        return response;
    }, async (error) => {
        if (axios.isCancel(error)) {
             log('warn', 'Request cancelled:', error.message);
             return Promise.reject(new Error(`Request cancelled: ${error.message}`));
        } else if (error.response) {
             log('error', `API Error Response Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}, Request: ${error.config?.url}`);
             if (error.response.status === 401 || error.response.status === 403) {
                 log('error', 'API Authentication/Authorization error (401/403). Token might be invalid. Logging out critically.');
                 this.authService.logout(true); 
                 return Promise.reject(new Error(ERROR_MESSAGES.AUTHENTICATION_FAILED + ` (HTTP ${error.response.status})`));
             }
             if (error.response.status === 429) {
                 log('warn', 'HTTP 429 Rate Limit Exceeded.');
                 const retryAfter = error.response.headers['retry-after'];
                 if (retryAfter) {
                    log('info', `Received Retry-After: ${retryAfter}. Consider implementing server-suggested delay.`);
                 }
                 return Promise.reject(new Error(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED + ' (HTTP 429)'));
            }
             return Promise.reject(new Error(error.response.data?.msg || `Request failed with status ${error.response.status}`));
        } else if (error.request) {
            log('error', 'API No Response Error (Network issue or timeout):', error.code, error.message);
            return Promise.reject(new Error(ERROR_MESSAGES.API_REQUEST_FAILED + (error.code ? ` (${error.code})` : ' (No response)')));
        } else {
            log('error', 'API Request Setup Error:', error.message);
            return Promise.reject(new Error(`API request setup failed: ${error.message}`));
        }
    });
  }

  async getChats(): Promise<Chat[]> {
     return this.executeWithRateLimit(async () => {
         const chats: Chat[] = [];
         let pageToken: string | null = null;
         let hasMore = true;
         let pageCount = 0;

         log('info', 'Fetching chats from API...');
         while(hasMore) {
              pageCount++;
              const params: Record<string, any> = { page_size: 50, user_id_type: 'open_id' };
              if (pageToken) params.page_token = pageToken;

              log('info', `Fetching chat page ${pageCount}, token: ${pageToken || 'N/A'}`);
              const response = await this.httpClient.get<ChatListResponse>(API_ENDPOINTS.CHAT_LIST, { params });

              if (response.data && response.data.data && response.data.data.items) {
                  chats.push(...response.data.data.items);
              }
              pageToken = response.data.data?.page_token || null;
              hasMore = response.data.data?.has_more === true;
              log('info', `Fetched ${response.data.data?.items?.length || 0} chats this page. Total: ${chats.length}. Has more: ${hasMore}`);
         }
         log('info', `Finished fetching all chats. Total: ${chats.length} in ${pageCount} pages.`);
         return chats;
     });
  }

  async getMessages(
    chatId: string,
    startTime: number,
    endTime: number,
    progressCallback?: (messagesProcessed: number, totalEstimated: number, hasMorePages: boolean) => void
  ): Promise<Message[]> {
    const allMessages: Message[] = [];
    let pageToken: string | null = null;
    let hasMorePages = true;
    let messagesProcessedThisChat = 0;
    let estimatedTotalForChat = 0; 
    let pageCount = 0;

    const startTimeStr = formatDateForAPI(startTime);
    const endTimeStr = formatDateForAPI(endTime);

    log('info', `Fetching messages for chat ${chatId} from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);

    while(hasMorePages) {
       pageCount++;
       const fetchedPageMessages = await this.executeWithRateLimit<Message[]>(async () => {
            const params: Record<string, any> = {
              container_id_type: 'chat',
              container_id: chatId,
              start_time: startTimeStr,
              end_time: endTimeStr,
              page_size: 50, 
              sort_type: 'create_time_asc'
            };
            if (pageToken) params.page_token = pageToken;

            log('info', `Fetching message page ${pageCount} for chat ${chatId}, token: ${pageToken || 'start'}`);
            const response = await this.httpClient.get<MessageListResponse>(API_ENDPOINTS.MESSAGE_LIST, { params });

            const items = response.data.data?.items || [];
            pageToken = response.data.data?.page_token || null;
            hasMorePages = response.data.data?.has_more === true;

            messagesProcessedThisChat += items.length;

            if (pageCount === 1) { // First page
                if (items.length < 50 && !hasMorePages) { // If first page is less than page_size and no more pages
                    estimatedTotalForChat = items.length;
                } else {
                    // A simple heuristic: if we got a full page, assume at least that many more, or items.length * 2 if very few
                    estimatedTotalForChat = items.length + (hasMorePages ? 50 : 0); 
                }
            } else if (hasMorePages) {
                 // If not the first page and there are more pages, refine estimate: current total + at least one more page
                estimatedTotalForChat = messagesProcessedThisChat + 50;
            } else { // Last page
                estimatedTotalForChat = messagesProcessedThisChat;
            }
            
            if (progressCallback) {
              progressCallback(messagesProcessedThisChat, estimatedTotalForChat, hasMorePages);
            }
            return items;
        });

        allMessages.push(...fetchedPageMessages);
        log('info', `Fetched ${fetchedPageMessages.length} messages this page for chat ${chatId}. Total so far: ${allMessages.length}. Has more pages: ${hasMorePages}`);
    }
    log('info', `Finished fetching messages for chat ${chatId}. Total: ${allMessages.length} in ${pageCount} pages.`);
    allMessages.sort((a, b) => parseInt(a.create_time) - parseInt(b.create_time));
    return allMessages;
  }

  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      this.rateLimitQueue.push(task);
      if (!this.isProcessingQueue) {
        this.processRateLimitQueue();
      }
    });
  }

  private async processRateLimitQueue(): Promise<void> {
    if (this.isProcessingQueue || this.rateLimitQueue.length === 0) return;

    this.isProcessingQueue = true;
    log('info', `Rate limit queue processing started. Queue size: ${this.rateLimitQueue.length}`);

    while (this.rateLimitQueue.length > 0) {
        const task = this.rateLimitQueue.shift();
        if (task) {
            try {
                await task();
            } catch (error: any) {
                log('error', 'Error during queued task execution:', error.message);
            }

            if (this.rateLimitQueue.length > 0) {
                await sleep(API_RATE_LIMIT.DELAY_MS);
            }
        }
    }
    this.isProcessingQueue = false;
    log('info', 'Rate limit queue processing finished.');
  }
}

