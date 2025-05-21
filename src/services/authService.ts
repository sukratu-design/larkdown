import axios from 'axios';
import ElectronStore from 'electron-store';
import { FEISHU_API_BASE_URL, API_ENDPOINTS, ERROR_MESSAGES } from '../common/constants';
import { log } from '../common/utils';

interface StoreSchema {
  appId?: string; 
  appSecret?: string; 
  tenantAccessToken?: string;
  tokenExpiresAt?: number; // Unix timestamp in milliseconds
}

export class AuthService {
  private store: ElectronStore<StoreSchema>;
  private onCriticalAuthFailureCallback?: () => void;
  
  constructor(onCriticalAuthFailureCallback?: () => void) {
    this.store = new ElectronStore<StoreSchema>({
      name: 'auth-config',
      encryptionKey: 'lark-feishu-chat-exporter-secure-key-v1'
    });
    this.onCriticalAuthFailureCallback = onCriticalAuthFailureCallback;
    log('info', 'AuthService initialized. Store path:', this.store.path);
  }

  async setTenantAccessTokenFromInput(token: string): Promise<void> {
      log('info', 'Attempting to set and validate tenant access token from input.');
      if (!token || token.trim() === '') {
           log('warn', 'setTenantAccessTokenFromInput: API Token cannot be empty.');
           throw new Error(ERROR_MESSAGES.TOKEN_MISSING);
      }
      
      this.store.set('tenantAccessToken', token);
      this.store.set('tokenExpiresAt', Date.now() + (24 * 60 * 60 * 1000)); // Assume valid for 24 hours initially

      log('info', 'Validating token by making a test API call (fetch 1 chat).');
      try {
          const validationClient = axios.create({
              baseURL: FEISHU_API_BASE_URL,
              timeout: 10000 
          });

          const response = await validationClient.get(API_ENDPOINTS.CHAT_LIST, {
              headers: { 'Authorization': `Bearer ${token}` },
              params: { page_size: 1 } 
          });

          if (response.data.code !== 0) {
               this.logout(true); // Critical failure if validation fails
               log('error', `Token validation failed (API Error): ${response.data.msg} (Code: ${response.data.code})`);
               throw new Error(`${ERROR_MESSAGES.TOKEN_VALIDATION_FAILED}: ${response.data.msg} (Code: ${response.data.code})`);
          }
          log('info', 'Tenant access token validation successful.');
      } catch (error: any) {
           this.logout(true); // Critical failure on any validation error
           log('error', 'Error during token validation API call:', error.message, error.response?.data);
           if (axios.isAxiosError(error)) {
               const status = error.response?.status;
               const feishuCode = error.response?.data?.code;
               if (status === 401 || feishuCode === 99991663 || feishuCode === 99991664) { 
                   throw new Error(`${ERROR_MESSAGES.TOKEN_VALIDATION_FAILED}: Unauthorized or token expired.`);
               }
               throw new Error(`${ERROR_MESSAGES.TOKEN_VALIDATION_FAILED}: ${error.response?.data?.msg || error.message}`);
           }
           throw new Error(`${ERROR_MESSAGES.TOKEN_VALIDATION_FAILED}: ${error.message || 'Unknown validation error'}`);
      }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = this.store.get('tenantAccessToken');
    const expiresAt = this.store.get('tokenExpiresAt');
    
    if (!token || !expiresAt) {
      log('info', 'isAuthenticated: No token or expiry found.');
      return false;
    }

    const buffer = 5 * 60 * 1000; // 5 minutes
    const isExpiredPlaceholder = Date.now() >= (expiresAt - buffer);
    if (isExpiredPlaceholder) {
        // For user-provided tokens, we don't know the true expiry.
        // If our placeholder expiry is met, rely on API call validation.
        log('info', `isAuthenticated: Placeholder token expiry reached. Validating with API.`);
    }

    log('info', 'isAuthenticated: Found stored token, performing quick API validation...');
     try {
        const validationClient = axios.create({
            baseURL: FEISHU_API_BASE_URL,
            timeout: 7000 // Quick 7s timeout for this check
        });
         const response = await validationClient.get(API_ENDPOINTS.CHAT_LIST, {
              headers: { 'Authorization': `Bearer ${token}` },
              params: { page_size: 1 } 
         });
         if(response.data.code === 0) {
             log('info', 'isAuthenticated: Stored token successfully validated via API.');
             // Optionally update expiresAt if API gave a new one, though this endpoint doesn't.
             return true;
         } else {
              log('warn', `isAuthenticated: Stored token validation failed via API (Code: ${response.data.code}, Msg: ${response.data.msg}). Signaling critical failure.`);
              this.logout(true); // Critical failure
              return false;
         }
     } catch (error: any) {
          log('error', 'isAuthenticated: Error during stored token API validation:', error.message);
           if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.data?.code === 99991663 || error.response?.data?.code === 99991664)) {
             log('warn', 'isAuthenticated: Stored token deemed invalid by API (401/Feishu Error). Clearing and signaling critical failure.');
             this.logout(true); // Critical failure
             return false;
           }
           log('warn', 'isAuthenticated: Stored token validation failed due to network/other error. Treating as invalid and signaling critical failure.');
           this.logout(true); // Critical failure
           return false;
     }
  }

  async getTenantAccessToken(): Promise<string> {
    const token = this.store.get('tenantAccessToken');
    if (!token) {
      log('error', 'getTenantAccessToken: No token available.');
      throw new Error(ERROR_MESSAGES.TOKEN_MISSING);
    }
    return token;
  }

  logout(isCritical: boolean = false): void {
    log('info', `Logout called. Critical: ${isCritical}. Clearing stored tenant access token and expiration.`);
    this.store.delete('tenantAccessToken');
    this.store.delete('tokenExpiresAt');
    
    if (isCritical && this.onCriticalAuthFailureCallback) {
      log('info', 'Invoking critical auth failure callback.');
      this.onCriticalAuthFailureCallback();
    }
  }
}

