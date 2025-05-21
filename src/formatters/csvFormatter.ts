import { Message } from '../common/types';
import { MessageModel } from '../models/messageModel';
import { log } from '../common/utils';

/**
 * Escapes a string for CSV field.
 * - Wraps field in double quotes if it contains comma, newline, or double quote.
 * - Escapes internal double quotes by doubling them.
 * @param field The string to escape.
 * @returns The CSV-safe string.
 */
function escapeCsvField(field: string | undefined | null): string {
  if (field === undefined || field === null) {
    return '';
  }
  const str = String(field);
  // Check for characters that require quoting: comma, double quote, newline, carriage return
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape double quotes within the field by doubling them, then wrap the whole field in double quotes
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats an array of Message objects into a CSV string.
 *
 * @param messages Array of Message objects.
 * @returns A string representing the messages in CSV format.
 */
export function formatToCsv(messages: Message[]): string {
  log('info', `Formatting ${messages.length} messages to CSV.`);
  try {
    const headers = [
      'Message ID',
      'Parent ID',
      'Root ID',
      'Timestamp (UTC)',
      'Updated Timestamp (UTC)',
      'Chat ID',
      'Message Type',
      'Sender ID',
      'Sender Name',
      'Sender Type',
      'Content Text',
      'Raw Content (JSON)'
    ];

    const csvRows: string[] = [];
    csvRows.push(headers.join(',')); // Header row

    messages.forEach(msg => {
      const row = [
        escapeCsvField(msg.message_id),
        escapeCsvField(msg.parent_id),
        escapeCsvField(msg.root_id),
        escapeCsvField(MessageModel.getFormattedTimestamp(msg, {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false, timeZone: 'UTC'
        }) + ' UTC'),
         escapeCsvField(msg.update_time ? MessageModel.getFormattedTimestamp({ ...msg, create_time: msg.update_time } as Message, { // Hack to reuse formatter
             year: 'numeric', month: '2-digit', day: '2-digit',
             hour: '2-digit', minute: '2-digit', second: '2-digit',
             hour12: false, timeZone: 'UTC'
         }) + ' UTC' : ''),
        escapeCsvField(msg.chat_id),
        escapeCsvField(msg.message_type),
        escapeCsvField(MessageModel.getSenderIdentifier(msg)),
        escapeCsvField(MessageModel.getSenderDisplayName(msg)),
        escapeCsvField(msg.sender.sender_type),
        escapeCsvField(MessageModel.extractTextContent(msg)),
        escapeCsvField(msg.content), // Raw JSON content
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  } catch (error: any) {
    log('error', 'Error formatting messages to CSV:', error.message);
    throw new Error('Failed to format messages to CSV.');
  }
}


