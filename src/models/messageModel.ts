import { Message } from '../common/types';
import { log } from '../common/utils'; // Added for logging

/**
 * MessageModel provides methods for working with Message objects.
 * This class encapsulates operations and transformations on message data.
 */
export class MessageModel {
  /**
   * Extract text content from a message.
   * Provides user-friendly placeholders for non-text content.
   * @param message The message object
   * @returns Extracted text content or placeholder
   */
  static extractTextContent(message: Message): string {
    try {
      if (message.message_type === 'text') {
        const content = JSON.parse(message.content);
        let text = content.text || '';
        // Remove mention tags but keep the @username part for readability
        text = text.replace(/<at user_id="[^"]+">@([^<]+)<\/at>/g, '@$1');
        text = text.replace(/<at open_id="[^"]+">@([^<]+)<\/at>/g, '@$1'); // Handle open_id mentions
        return text.trim();
      }
      // Common non-text types with placeholders
      else if (message.message_type === 'image') return '[Image]';
      else if (message.message_type === 'file') {
        const fileContent = JSON.parse(message.content);
        return `[File: ${fileContent.file_name || 'Unknown File'}] (Size: ${fileContent.file_size ? (parseInt(fileContent.file_size)/(1024*1024)).toFixed(2) + 'MB' : 'N/A'})`;
      }
      else if (message.message_type === 'audio') return '[Audio]';
      else if (message.message_type === 'video') return '[Video]';
      else if (message.message_type === 'sticker') return '[Sticker]';
      else if (message.message_type === 'post') { // Rich text post
         const postContent = JSON.parse(message.content);
         // Try to get a title or summary from the post content
         // This is highly dependent on the structure of 'post' content
         const title = postContent?.pc?.title || postContent?.title || 'Rich Text Post';
         return `[Post: ${title}]`;
      }
      else if (message.message_type === 'share_chat') {
        const shareContent = JSON.parse(message.content);
        return `[Shared Chat: ${shareContent.chat_name || 'Unknown Chat'}]`;
      }
      else if (message.message_type === 'share_user') {
         const shareContent = JSON.parse(message.content);
         return `[Shared User: ${shareContent.user_name || 'Unknown User'}]`;
      }
      else if (message.message_type === 'interactive') return '[Interactive Message Card]';
      else if (message.message_type === 'system') {
        const systemContent = JSON.parse(message.content);
        // System messages can have various templates, try to find a common text field
        return `[System: ${systemContent.text || systemContent.template || 'Notification'}]`;
      }
      // Default for other or unknown types
      return `[${message.message_type} message]`;
    } catch (error: any) {
      log('warn', `Error extracting content from message ${message.message_id} (type: ${message.message_type}):`, error.message);
      return `[Error parsing ${message.message_type} content]`;
    }
  }

  /**
   * Get formatted timestamp for a message.
   *
   * @param message The message object
   * @param options Optional formatting options for toLocaleString
   * @returns Formatted timestamp string
   */
  static getFormattedTimestamp(message: Message, options?: Intl.DateTimeFormatOptions): string {
    try {
      const timestamp = parseInt(message.create_time);
      if (isNaN(timestamp)) throw new Error('Invalid timestamp string');
      const date = new Date(timestamp);
      return date.toLocaleString(undefined, options); // Use default locale or provided options
    } catch (e: any) {
      log('warn', `Could not format timestamp for message ${message.message_id}: ${message.create_time}`, e.message);
      return 'Unknown Time';
    }
  }

   /**
    * Get sender identifier (user_id, open_id, or union_id if available).
    * @param message The message object.
    * @returns The sender's identifier string.
    */
   static getSenderIdentifier(message: Message): string {
       return message.sender?.sender_id?.user_id ||
              message.sender?.sender_id?.open_id ||
              message.sender?.sender_id?.union_id ||
              'UnknownID';
   }

   /**
    * Get sender's display name.
    * Attempts to use mentioned name if available (for users), or a generic "Bot" / "User (ID)"
    * @param message The message object.
    * @returns The sender's display name.
    */
   static getSenderDisplayName(message: Message): string {
       if (message.sender?.sender_type === 'bot') {
           // Future: Could try to resolve bot name if API provides it elsewhere or in sender block
           return 'Bot';
       }
       
       const senderId = MessageModel.getSenderIdentifier(message);
       // Try to find sender's name from mentions (works if sender mentioned themselves or system did)
       // This is a heuristic and not a reliable way to get all user names.
       // A proper user info API call would be needed for general user name resolution.
       const mention = message.mentions?.find(m =>
           m.id?.user_id === senderId ||
           m.id?.open_id === senderId ||
           m.id?.union_id === senderId
       );
       if (mention?.name) {
           return mention.name;
       }

       if (senderId !== 'UnknownID') {
           return `User (${senderId.substring(0, 6)}...)`; // Fallback to truncated ID
       }
       return 'Unknown User';
   }

  /**
   * Check if a message contains attachments (file, image, video, audio).
   *
   * @param message The message object
   * @returns Boolean indicating if message has attachments
   */
  static hasAttachment(message: Message): boolean {
    return ['image', 'file', 'audio', 'video', 'media'].includes(message.message_type);
  }

  /**
   * Group messages by date for easier display.
   *
   * @param messages Array of message objects
   * @returns Object with dates as keys and arrays of messages as values
   */
  static groupByDate(messages: Message[]): Record<string, Message[]> {
    log('info', `Grouping ${messages.length} messages by date.`);
    const grouped: Record<string, Message[]> = {};
    for (const message of messages) {
      try {
        const timestamp = parseInt(message.create_time);
        if (isNaN(timestamp)) throw new Error('Invalid timestamp string for grouping');
        const date = new Date(timestamp);
        const dateKey = date.toDateString(); // e.g., "Mon Mar 15 2023"

        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(message);
      } catch (e: any) {
        log('warn', `Skipping message ${message.message_id} in groupByDate due to invalid timestamp: ${message.create_time}`, e.message);
        continue;
      }
    }
    return grouped;
  }
}


