import { Message } from '../common/types';
import { MessageModel } from '../models/messageModel';
import { log } from '../common/utils';

/**
 * Formats an array of Message objects into a plain text string.
 * Each message is represented as: [YYYY-MM-DD HH:MM:SS] Sender Name: Message content
 *
 * @param messages Array of Message objects.
 * @returns A string representing the chat history in plain text.
 */
export function formatToTxt(messages: Message[]): string {
  log('info', `Formatting ${messages.length} messages to TXT.`);
  try {
    const textLines: string[] = [];

    messages.forEach(msg => {
      const timestamp = MessageModel.getFormattedTimestamp(msg, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false // Use 24-hour format for clarity in text logs
      });
      const senderName = MessageModel.getSenderDisplayName(msg);
      const textContent = MessageModel.extractTextContent(msg);

      // Handle multi-line content: indent subsequent lines
      const contentLines = textContent.split('\n');
      const formattedContent = contentLines.map((line, index) =>
        index === 0 ? line : `    ${line}` // Indent subsequent lines of a single message
      ).join('\n');

      textLines.push(`[${timestamp}] ${senderName} (ID: ${MessageModel.getSenderIdentifier(msg)}): ${formattedContent} (MsgID: ${msg.message_id})`);
    });

    return textLines.join('\n\n'); // Separate messages by a double newline for readability
  } catch (error: any) {
    log('error', 'Error formatting messages to TXT:', error.message);
    throw new Error('Failed to format messages to TXT.');
  }
}


