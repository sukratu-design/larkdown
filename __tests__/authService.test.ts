// __tests__/authService.test.ts
import axios from 'axios';
import ElectronStore from 'electron-store';
import { AuthService } from '../src/services/authService';
import { FEISHU_API_BASE_URL, API_ENDPOINTS, ERROR_MESSAGES } from '../src/common/constants';
import * as utils from '../src/common/utils';

// Mock external dependencies
jest.mock('axios');
jest.mock('electron-store');
jest.mock('../src/common/utils', () => {
    const originalUtils = jest.requireActual('../src/common/utils');
    return {
        ...originalUtils,
        log: jest.fn(), // Mock log
    };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedElectronStore = ElectronStore as jest.MockedClass<typeof ElectronStore>;
const mockedLog = utils.log as jest.Mock;

describe('AuthService', () => {
  let authService: AuthService;
  let mockStoreInstance: { get: jest.Mock; set: jest.Mock; delete: jest.Mock; path: string };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStoreInstance = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      path: '/fake/store/path.json'
    };
    MockedElectronStore.mockImplementation(() => mockStoreInstance as any);
    
    // Mock axios.create separately for validationClient if needed, or use global mock
    const mockValidationClient = { get: jest.fn() } as unknown as jest.Mocked<ReturnType<typeof axios.create>>;
    mockedAxios.create.mockReturnValue(mockValidationClient);


    authService = new AuthService();
  });

  describe('constructor', () => {
    it('should initialize ElectronStore with correct config', () => {
      expect(MockedElectronStore).toHaveBeenCalledWith({
        name: 'auth-config',
        encryptionKey: 'lark-feishu-chat-exporter-secure-key-v1'
      });
      expect(mockedLog).toHaveBeenCalledWith('info', 'AuthService initialized. Store path:', mockStoreInstance.path);
    });
  });

  describe('setTenantAccessTokenFromInput', () => {
    const testToken = 'valid-user-token';

    it('should store token and validate successfully via API', async () => {
      (mockedAxios.create() as any).get.mockResolvedValue({ data: { code: 0, msg: 'success' } });

      await authService.setTenantAccessTokenFromInput(testToken);

      expect(mockStoreInstance.set).toHaveBeenCalledWith('tenantAccessToken', testToken);
      expect(mockStoreInstance.set).toHaveBeenCalledWith('tokenExpiresAt', expect.any(Number));
      expect((mockedAxios.create() as any).get).toHaveBeenCalledWith(
        API_ENDPOINTS.CHAT_LIST,
        expect.objectContaining({
          headers: { 'Authorization': `Bearer ${testToken}` },
          params: { page_size: 1 }
        })
      );
      expect(mockedLog).toHaveBeenCalledWith('info', 'Tenant access token validation successful.');
    });

    it('should throw error and clear token if validation API returns non-zero code', async () => {
      (mockedAxios.create() as any).get.mockResolvedValue({ data: { code: 99991663, msg: 'Invalid token' } });

      await expect(authService.setTenantAccessTokenFromInput(testToken))
        .rejects.toThrow(`${ERROR_MESSAGES.TOKEN_VALIDATION_FAILED}: Invalid token (Code: 99991663)`);
      
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tenantAccessToken');
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tokenExpiresAt');
      expect(mockedLog).toHaveBeenCalledWith('error', 'Token validation failed (API Error): Invalid token (Code: 99991663)');
    });

    it('should throw error and clear token if validation API call fails (e.g., 401)', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401, data: { msg: 'Unauthorized' } },
        message: 'Request failed with status code 401'
      };
      (mockedAxios.create() as any).get.mockRejectedValue(axiosError);

      await expect(authService.setTenantAccessTokenFromInput(testToken))
        .rejects.toThrow(`${ERROR_MESSAGES.TOKEN_VALIDATION_FAILED}: Unauthorized or token expired.`);
      
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tenantAccessToken');
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tokenExpiresAt');
    });

    it('should throw error for empty token input', async () => {
      await expect(authService.setTenantAccessTokenFromInput(''))
        .rejects.toThrow(ERROR_MESSAGES.TOKEN_MISSING);
      expect(mockedLog).toHaveBeenCalledWith('warn', 'setTenantAccessTokenFromInput: API Token cannot be empty.');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true for valid, non-expired token', async () => {
      mockStoreInstance.get.mockImplementation(key => {
        if (key === 'tenantAccessToken') return 'valid-token';
        if (key === 'tokenExpiresAt') return Date.now() + 3600000; // Expires in 1 hour
        return null;
      });
      expect(await authService.isAuthenticated()).toBe(true);
      expect(mockedLog).toHaveBeenCalledWith('info', 'isAuthenticated: Valid token found. Expires at:', expect.any(String));
    });

    it('should return false and logout if token is expired', async () => {
      mockStoreInstance.get.mockImplementation(key => {
        if (key === 'tenantAccessToken') return 'expired-token';
        if (key === 'tokenExpiresAt') return Date.now() - 10000; // Expired 10s ago
        return null;
      });
      expect(await authService.isAuthenticated()).toBe(false);
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tenantAccessToken'); // Check logout was called
      expect(mockedLog).toHaveBeenCalledWith('info', 'isAuthenticated: Token found but considered expired. Expires at:', expect.any(String));

    });
    
    it('should return false if no token exists', async () => {
        mockStoreInstance.get.mockReturnValue(null);
        expect(await authService.isAuthenticated()).toBe(false);
        expect(mockedLog).toHaveBeenCalledWith('info', 'isAuthenticated: No token or expiry found.');
    });
  });

  describe('getTenantAccessToken', () => {
    it('should return stored token if available', async () => {
      mockStoreInstance.get.mockReturnValue('stored-token');
      expect(await authService.getTenantAccessToken()).toBe('stored-token');
    });

    it('should throw error if no token is available', async () => {
      mockStoreInstance.get.mockReturnValue(null);
      await expect(authService.getTenantAccessToken()).rejects.toThrow(ERROR_MESSAGES.TOKEN_MISSING);
      expect(mockedLog).toHaveBeenCalledWith('error', 'getTenantAccessToken: No token available.');
    });
  });

  describe('logout', () => {
    it('should clear token and expiry from store', () => {
      authService.logout();
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tenantAccessToken');
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('tokenExpiresAt');
      expect(mockedLog).toHaveBeenCalledWith('info', 'Logout called: Clearing stored tenant access token and expiration.');
    });
  });
});


