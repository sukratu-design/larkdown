import { Message } from '../common/types';
import { MessageModel } from '../models/messageModel';
import { log } from '../common/utils';

/**
 * Formats an array of Message objects into a structured JSON string.
 * This version includes more fields and uses MessageModel for consistency.
 *
 * @param messages Array of Message objects.
 * @returns A string representing the messages in JSON format.
 */
export function formatToJson(messages: Message[]): string {
  log('info', `Formatting ${messages.length} messages to JSON.`);
  try {
    const processedMessages = messages.map(msg => ({
      message_id: msg.message_id,
      parent_id: msg.parent_id,
      root_id: msg.root_id,
      create_time_iso: MessageModel.getFormattedTimestamp(msg, { timeZone: "UTC" }), // Human-readable ISO timestamp (UTC)
      create_timestamp_ms: msg.create_time, // Original timestamp string (ms)
      update_time_iso: msg.update_time ? MessageModel.getFormattedTimestamp({ ...msg, create_time: msg.update_time } as Message, { timeZone: "UTC" }) : undefined,
      update_timestamp_ms: msg.update_time,
      chat_id: msg.chat_id,
      chat_type: msg.chat_type,
      message_type: msg.message_type,
      sender: {
          id: MessageModel.getSenderIdentifier(msg),
          display_name: MessageModel.getSenderDisplayName(msg),
          type: msg.sender.sender_type,
          raw_sender_details: msg.sender // Include original sender block
      },
      content_text: MessageModel.extractTextContent(msg), // Extracted text or placeholder
      content_raw: msg.content, // Raw JSON content string from API
      mentions: msg.mentions,
      // Add other potentially useful fields directly from msg if needed
      // e.g., msg.deleted, msg.updated
    }));

    return JSON.stringify(processedMessages, null, 2); // Pretty-printed JSON
  } catch (error: any) {
    log('error', 'Error formatting messages to JSON:', error.message);
    throw new Error('Failed to format messages to JSON.');
  }
}


