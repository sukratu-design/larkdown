/**
 * Utility functions used throughout the application.
 */

/**
 * Formats a date (timestamp in ms) to the format expected by the Feishu API.
 * The Feishu API /im/v1/messages endpoint accepts `start_time` and `end_time`
 * as string representations of Unix timestamps in milliseconds.
 *
 * @param timestamp Timestamp in milliseconds since epoch.
 * @returns String representation of the timestamp.
 */
export function formatDateForAPI(timestamp: number): string {
  // Ensure it's an integer string
  return Math.floor(timestamp).toString();
}

/**
 * Sleep for the specified number of milliseconds.
 * Useful for implementing delays, e.g., for rate limiting.
 *
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
export function sleep(ms: number): Promise<void> {
  if (ms < 0) ms = 0; // Ensure no negative sleep
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format a file size in bytes to a human-readable string.
 *
 * @param bytes Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Truncate a string to a specified length and add ellipsis if needed.
 *
 * @param str String to truncate
 * @param maxLength Maximum length
 * @returns Truncated string
 */
export function truncateString(str: string | null | undefined, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * Generate a unique ID.
 * Useful for keys in lists, etc.
 *
 * @returns Unique ID string
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * Basic logging function that writes to console.
 * Can be extended for more sophisticated logging if needed.
 * @param level Log level ('info', 'warn', 'error')
 * @param message The message to log
 * @param args Additional arguments to log
 */
export function log(level: 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (level === 'error') {
        console.error(logMessage, ...args);
    } else if (level === 'warn') {
        console.warn(logMessage, ...args);
    } else {
        // Default to console.log for 'info' or other levels
        console.log(logMessage, ...args);
    }
}


