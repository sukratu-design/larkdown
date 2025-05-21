/**
 * Constants used throughout the application.
 */

// API Base URL
export const FEISHU_API_BASE_URL = 'https://open.feishu.cn';

// API Endpoints (relative to base URL)
export const API_ENDPOINTS = {
    TENANT_ACCESS_TOKEN: '/open-apis/auth/v3/tenant_access_token/internal',
    CHAT_LIST: '/open-apis/im/v1/chats',
    MESSAGE_LIST: '/open-apis/im/v1/messages',
};


// API Rate Limits
// Feishu API limits vary. 'im/v1/messages' is often higher (e.g., 50 QPS for tenantAccessToken)
// Using a conservative limit here.
export const API_RATE_LIMIT = {
  // Requests per second - conservative limit based on messages list QPS
  REQUESTS_PER_SECOND: 40, // Example: Stay below 50 QPS
  // Delay in milliseconds between requests to respect the limit
  DELAY_MS: 1000 / 40 // 25ms delay between requests
};

// Error Messages
export const ERROR_MESSAGES = {
  AUTHENTICATION_FAILED: 'Authentication failed. Please check your API Token.',
  TOKEN_VALIDATION_FAILED: 'API Token validation failed. Please check your token.',
  TOKEN_MISSING: 'API Token is missing. Please provide a valid token.',
  API_REQUEST_FAILED: 'API request failed. Please try again later.',
  CHAT_LOAD_FAILED: 'Failed to load chats. Please check your permissions and try again.',
  EXPORT_FAILED: 'Export failed. Please try again.',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded from client-side queue. Please wait or retry.',
  UNSUPPORTED_EXPORT_FORMAT: 'Unsupported export format requested.',
  SAVE_DIALOG_CANCELLED: 'Export cancelled by user.',
  FILE_WRITE_FAILED: 'Failed to write exported file.',
  INVALID_DATE_RANGE: 'Start date cannot be after end date.',
  API_SERVICE_NOT_INITIALIZED: 'API Service not initialized. Please authenticate first.',
};

// UI Messages
export const UI_MESSAGES = {
  AUTHENTICATED: 'Successfully authenticated.',
  EXPORT_COMPLETE: 'Export completed successfully.',
  EXPORT_PROGRESS_FETCHING: 'Fetching messages: {0} of {1} ({2}%)', // {0}=processed, {1}=total, {2}=percentage
  EXPORT_PROGRESS_PROCESSING: 'Processing messages...',
  EXPORT_PROGRESS_SAVING: 'Saving file...',
  EXPORT_ALL_DONE: 'All selected exports finished.',
   EXPORT_SINGLE_COMPLETE: 'Exported {0} messages.', // {0}=message count
   EXPORT_SINGLE_CANCELLED: 'Export cancelled.',
   EXPORT_SINGLE_ERROR: 'Export failed: {0}', // {0}=error message
   LOADING_CHATS: 'Loading chats...'
};

// Other Constants
export const DEFAULT_EXPORT_FILENAME_PREFIX = 'chat_export';
export const DEFAULT_DATE_RANGE_DAYS = 7; // Default number of days for date filter



