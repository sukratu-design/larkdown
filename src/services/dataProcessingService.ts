import { Message, ExportFormat } from '../common/types';
import { MessageModel } from '../models/messageModel'; // Used by formatters
import { formatToJson } from '../formatters/jsonFormatter';
import { formatToCsv } from '../formatters/csvFormatter';
import { formatToTxt } from '../formatters/txtFormatter';
import { formatToHtml } from '../formatters/htmlFormatter';
import { log } from '../common/utils';
import { ERROR_MESSAGES } from '../common/constants';

/**
 * DataProcessingService orchestrates the formatting of chat messages
 * into various export formats.
 */
export class DataProcessingService {
  /**
   * Processes an array of messages and formats them according to the specified format.
   *
   * @param messages Array of Message objects.
   * @param format The target export format ('json', 'csv', 'txt', 'html').
   * @param chatName Optional: The name of the chat, used for HTML title.
   * @returns A string containing the formatted data.
   * @throws Error if an unsupported format is requested or if formatting fails.
   */
  public processMessages(messages: Message[], format: ExportFormat, chatName?: string): string {
    log('info', `DataProcessingService: Processing ${messages.length} messages into ${format.toUpperCase()} format for chat "${chatName || 'N/A'}".`);
    try {
      switch (format) {
        case 'json':
          return formatToJson(messages);
        case 'csv':
          return formatToCsv(messages);
        case 'txt':
          return formatToTxt(messages);
        case 'html':
          return formatToHtml(messages, chatName || 'Chat Export');
        default:
          // This case should ideally not be reached if UI validates format selection
          const typedFormat: never = format; // Ensures all cases are handled
          log('error', `Unsupported export format requested: ${typedFormat}`);
          throw new Error(ERROR_MESSAGES.UNSUPPORTED_EXPORT_FORMAT + `: ${typedFormat}`);
      }
    } catch (error: any) {
      log('error', `Error processing messages for format ${format}:`, error.message);
      // Re-throw the error to be caught by the main process handler, possibly augmenting it
      throw new Error(`Failed to format messages to ${format.toUpperCase()}. ${error.message || ''}`);
    }
  }
}


