/**
 * Types for the Lark/Feishu Chat Exporter application.
 * These types represent the data structures used in the application.
 */

// Export format options
export type ExportFormat = 'json' | 'csv' | 'txt' | 'html';

// API Response Types

// Chat List API Response
export interface ChatListResponse {
  code: number;
  msg: string;
  data: {
    items: Chat[];
    page_token: string | null;
    has_more: boolean;
  };
}

// Message List API Response
export interface MessageListResponse {
  code: number;
  msg: string;
  data: {
    items: Message[];
    page_token: string | null;
    has_more: boolean;
    // Add this property based on observed API responses or documentation if it exists
    // estimated_total_messages?: number; // Example: If API provides an estimate
  };
}

// Chat Data Structure
export interface Chat {
  chat_id: string;
  name: string;
  avatar: string; // URL
  description: string;
  owner_id: string; // User ID of the owner
  owner_id_type: string; // e.g., "open_id", "user_id", "union_id"
  external: boolean; // Whether this is an external chat
  tenant_key: string;
  create_time: string; // Unix timestamp in milliseconds, as string
  chat_type: 'group' | 'p2p';
  chat_mode: 'standard' | 'topic';
  member_count?: number; // Only for group chats

  // Add more properties from the API response if needed
  // type?: 'group' | 'p2p'; // Redundant with chat_type, but sometimes API includes it
  // status?: number; // Chat status (e.g., 0: normal, -1: dismissed)
}

// Message Data Structure
export interface Message {
  message_id: string;
  parent_id?: string; // For replies, ID of the parent message
  root_id?: string; // For replies, ID of the thread root message
  create_time: string; // Unix timestamp in milliseconds, as string
  update_time?: string; // Unix timestamp in milliseconds, as string (optional, as not all messages are updated)
  chat_id: string;
  chat_type: 'group' | 'p2p';
  message_type: string; // e.g., 'text', 'image', 'file', 'post', 'interactive'
  content: string; // JSON string containing message payload (structure varies by message_type)
  mentions?: Mention[]; // Array of mentioned users/bots
  sender: {
    sender_id: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: 'user' | 'bot'; // Indicates sender is a user or bot
    tenant_key: string;
  };

  // Add more properties from the API response if needed
  // deleted?: boolean; // Whether the message was deleted
  // updated?: boolean; // Whether the message was updated
  // chat_group_id?: string; // Only for topic group messages
}

// Mention in a message
export interface Mention {
  key: string; // Mention key in content (e.g., "<at user_id=\"...")
  id: {
    union_id?: string;
    user_id?: string;
    open_id?: string;
  };
  name: string; // Display name of the mentioned user/bot
  tenant_key: string;
}

// Custom type for simplified message structure for formatters if needed
// export interface SimplifiedMessage {
//     id: string;
//     timestamp: string; // formatted
//     sender: { id: string; name: string };
//     type: string;
//     text: string;
//     // Include fields relevant to export format
// }


