// __tests__/apiService.test.ts
import axios, { InternalAxiosRequestConfig } from 'axios';
import { ApiService } from '../src/services/apiService';
import { AuthService } from '../src/services/authService';
import { Chat, Message, ChatListResponse, MessageListResponse } from '../src/common/types';
import { FEISHU_API_BASE_URL, API_ENDPOINTS } from '../src/common/constants';
import * as utils from '../src/common/utils'; // Import all from utils to mock sleep

// Mock external dependencies
jest.mock('axios');
jest.mock('../src/services/authService');
jest.mock('../src/common/utils', () => {
    const originalUtils = jest.requireActual('../src/common/utils');
    return {
        ...originalUtils, // Preserve other utils
        sleep: jest.fn(ms => Promise.resolve()), // Mock sleep to resolve immediately for tests
        log: jest.fn(), // Mock log to prevent console output during tests
    };
});


const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const mockedSleep = utils.sleep as jest.Mock;
const mockedLog = utils.log as jest.Mock;


describe('ApiService', () => {
  let apiService: ApiService;
  let mockAuthServiceInstance: jest.Mocked<AuthService>;

  const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
      defaults: { headers: { common: {} } } as any,
      interceptors: {
          request: { use: jest.fn((successCb, errorCb) => {
              // Store the interceptor to manually call it if needed for complex tests
              // For simple tests, assume it correctly adds auth header.
              return 1; // Return an interceptor ID
          }), eject: jest.fn() },
          response: { use: jest.fn(), eject: jest.fn() }
      },
      getUri: jest.fn()
  } as unknown as jest.Mocked<ReturnType<typeof axios.create>>;


  beforeEach(() => {
    jest.clearAllMocks(); // Clears all mocks, including sleep and log counts

    mockAuthServiceInstance = new MockedAuthService() as jest.Mocked<AuthService>;
    mockAuthServiceInstance.getTenantAccessToken.mockResolvedValue('fake-access-token');
    
    // Mock axios.create() to return our mockAxiosInstance
    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    apiService = new ApiService(mockAuthServiceInstance);
  });

  describe('Constructor and Interceptors', () => {
    it('should create an axios instance with baseURL and timeout', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: FEISHU_API_BASE_URL,
        timeout: 15000,
      });
    });

    it('should add a request interceptor for auth token', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledTimes(1);
    });
     it('should add a response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
    });

    // More detailed interceptor tests would require calling the interceptor functions
    // directly or more complex mocking of axios behavior.
  });


  describe('getChats', () => {
    it('should fetch and return chats with pagination', async () => {
      const mockChatPage1: ChatListResponse = {
        code: 0, msg: 'success',
        data: { items: [{ chat_id: 'c1' } as Chat], page_token: 'next_page', has_more: true },
      };
      const mockChatPage2: ChatListResponse = {
        code: 0, msg: 'success',
        data: { items: [{ chat_id: 'c2' } as Chat], page_token: null, has_more: false },
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockChatPage1, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig })
        .mockResolvedValueOnce({ data: mockChatPage2, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig });

      const chats = await apiService.getChats();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, API_ENDPOINTS.CHAT_LIST, { params: { page_size: 50, user_id_type: 'open_id' } });
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, API_ENDPOINTS.CHAT_LIST, { params: { page_size: 50, user_id_type: 'open_id', page_token: 'next_page' } });
      expect(chats).toEqual([{ chat_id: 'c1' }, { chat_id: 'c2' }]);
      expect(mockedLog).toHaveBeenCalledWith('info', 'Finished fetching all chats. Total: 2 in 2 pages.');
    });

    it('should throw error if API returns non-zero code for getChats', async () => {
        // This behavior is typically handled by the response interceptor.
        // We mock the get call to simulate the interceptor's rejection.
        const feishuError = new Error('Feishu API Error: Some error (Code: 12345)');
        mockAxiosInstance.get.mockRejectedValue(feishuError);
        
        await expect(apiService.getChats()).rejects.toThrow(feishuError);
        expect(mockedLog).toHaveBeenCalledWith('error', 'Error during queued task execution:', feishuError.message);
    });
  });

  describe('getMessages', () => {
    const chatId = 'chat123';
    const startTime = Date.now() - 100000;
    const endTime = Date.now();
    const progressCallback = jest.fn();

    it('should fetch messages with pagination and call progressCallback', async () => {
      const mockMessagePage1: MessageListResponse = {
        code: 0, msg: 'success',
        data: { items: [{ message_id: 'm1' } as Message], page_token: 'next_msg_page', has_more: true },
      };
      const mockMessagePage2: MessageListResponse = {
        code: 0, msg: 'success',
        data: { items: [{ message_id: 'm2' } as Message], page_token: null, has_more: false },
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockMessagePage1, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig })
        .mockResolvedValueOnce({ data: mockMessagePage2, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig });

      const messages = await apiService.getMessages(chatId, startTime, endTime, progressCallback);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      const expectedParamsBase = {
        container_id_type: 'chat', container_id: chatId,
        start_time: utils.formatDateForAPI(startTime), end_time: utils.formatDateForAPI(endTime),
        page_size: 50, sort_type: 'create_time_asc',
      };
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, API_ENDPOINTS.MESSAGE_LIST, { params: expectedParamsBase });
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, API_ENDPOINTS.MESSAGE_LIST, { params: { ...expectedParamsBase, page_token: 'next_msg_page' } });
      
      expect(messages).toEqual([{ message_id: 'm1' }, { message_id: 'm2' }]);
      
      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenNthCalledWith(1, 1, 51, true); // 1 processed, 1+50 estimate, hasMore=true
      expect(progressCallback).toHaveBeenNthCalledWith(2, 2, 2, false); // 2 processed, 2 total, hasMore=false
      expect(mockedLog).toHaveBeenCalledWith('info', `Finished fetching messages for chat ${chatId}. Total: 2 in 2 pages.`);
    });
  });

  describe('Rate Limiting Logic (executeWithRateLimit & processRateLimitQueue)', () => {
    it('should queue tasks and process them sequentially with sleep calls', async () => {
      // Mock get to resolve simply for these tasks
      mockAxiosInstance.get.mockResolvedValue({ data: { code: 0, msg: 'success', data: { items: [], has_more: false } }, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig });

      const task1 = apiService.getChats(); // Queues one call to get
      const task2 = apiService.getChats(); // Queues another
      const task3 = apiService.getChats(); // Queues a third

      await Promise.all([task1, task2, task3]);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3); // Each getChats makes one get call initially
      // Since sleep is mocked to resolve immediately, this doesn't test actual timing,
      // but verifies that sleep is called between tasks.
      expect(mockedSleep).toHaveBeenCalledTimes(2); // Called between task1&2, and task2&3
      expect(mockedSleep).toHaveBeenCalledWith(API_RATE_LIMIT.DELAY_MS);
      expect(mockedLog).toHaveBeenCalledWith('info', 'Rate limit queue processing started. Queue size: 3');
      expect(mockedLog).toHaveBeenCalledWith('info', 'Rate limit queue processing finished.');
    });

     it('should continue processing queue if a task fails', async () => {
        const successfulResponse = { data: { code: 0, msg: 'success', data: { items: [], has_more: false } }, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig };
        const errorToThrow = new Error('Simulated API fail');

        mockAxiosInstance.get
            .mockResolvedValueOnce(successfulResponse)  // Task 1 succeeds
            .mockRejectedValueOnce(errorToThrow)        // Task 2 fails
            .mockResolvedValueOnce(successfulResponse); // Task 3 succeeds

        const results = await Promise.allSettled([
            apiService.getChats(), // Task 1
            apiService.getChats(), // Task 2
            apiService.getChats()  // Task 3
        ]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        // @ts-ignore
        expect(results[1].reason).toEqual(errorToThrow); // Ensure the correct error was propagated
        expect(results[2].status).toBe('fulfilled');
        
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
        expect(mockedSleep).toHaveBeenCalledTimes(2); // Sleep calls should still occur
        expect(mockedLog).toHaveBeenCalledWith('error', 'Error during queued task execution:', errorToThrow.message);
    });
  });
});


