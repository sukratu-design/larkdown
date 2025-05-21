import { Chat } from '../common/types';
import { log } from '../common/utils'; // Added for logging

/**
 * ChatModel provides methods for working with Chat objects.
 * This class encapsulates operations and transformations on chat data.
 */
export class ChatModel {
  /**
   * Create a display name for a chat based on its properties.
   *
   * @param chat The chat object
   * @returns A display name for the chat
   */
  static getDisplayName(chat: Chat): string {
    // log('debug', `Getting display name for chat ID: ${chat.chat_id}`);
    if (chat.name && chat.name.trim().length > 0) {
      return chat.name;
    }
    if (chat.chat_type === 'p2p') {
      return 'Direct Message'; // Placeholder, real name resolution is complex
    }
    return `Group Chat (${chat.chat_id.substring(0, 8)}...)`;
  }

  /**
   * Get a description for a chat.
   *
   * @param chat The chat object
   * @returns A description string
   */
  static getDescription(chat: Chat): string {
    // log('debug', `Getting description for chat ID: ${chat.chat_id}`);
    const parts = [];
    if (chat.chat_type === 'group') {
      parts.push('Group Chat');
      if (chat.member_count !== undefined) {
        parts.push(`${chat.member_count} members`);
      }
    } else if (chat.chat_type === 'p2p') {
      parts.push('Direct Message');
    }

    if (chat.create_time) {
      try {
        const createDate = new Date(parseInt(chat.create_time));
        parts.push(`Created: ${createDate.toLocaleDateString()}`);
      } catch (e) {
        log('warn', `Could not parse create_time for chat ${chat.chat_id}: ${chat.create_time}`);
      }
    }

    if (chat.description && chat.description.trim().length > 0) {
      parts.push(`"${chat.description}"`);
    }
    return parts.join(' • ');
  }

  /**
   * Sort chats by type and name.
   *
   * @param chats Array of chat objects
   * @returns Sorted array
   */
  static sortChats(chats: Chat[]): Chat[] {
    log('info', `Sorting ${chats.length} chats.`);
    return [...chats].sort((a, b) => {
      if (a.chat_type !== b.chat_type) {
        return a.chat_type === 'group' ? -1 : 1; // Groups first
      }
      const nameA = ChatModel.getDisplayName(a).toLowerCase();
      const nameB = ChatModel.getDisplayName(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Filter chats by search text.
   *
   * @param chats Array of chat objects
   * @param searchText Text to search for
   * @returns Filtered array
   */
  static filterChats(chats: Chat[], searchText: string): Chat[] {
    // log('debug', `Filtering ${chats.length} chats with search term: "${searchText}"`);
    if (!searchText || searchText.trim() === '') {
      return chats;
    }
    const search = searchText.toLowerCase();
    return chats.filter(chat => {
      const displayName = ChatModel.getDisplayName(chat).toLowerCase();
      const description = chat.description ? chat.description.toLowerCase() : '';
      const chatIdMatch = chat.chat_id.toLowerCase().includes(search);
      return displayName.includes(search) || description.includes(search) || chatIdMatch;
    });
  }
}


