import { Message } from '../common/types';
import { MessageModel } from '../models/messageModel';
import { log } from '../common/utils';

/**
 * Escapes HTML special characters in a string.
 * @param unsafe The string to escape.
 * @returns The escaped string.
 */
function escapeHtml(unsafe: string | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats an array of Message objects into an HTML document string.
 *
 * @param messages Array of Message objects.
 * @param chatName Optional name of the chat for the HTML title.
 * @returns A string representing the chat history as an HTML document.
 */
export function formatToHtml(messages: Message[], chatName: string = 'Chat Export'): string {
  log('info', `Formatting ${messages.length} messages to HTML for chat: "${chatName}".`);
  try {
    let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(chatName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f5f7; color: #1d2129; }
    .chat-container { max-width: 800px; margin: auto; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px; }
    header h1 { text-align: center; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px;}
    .message-item { margin-bottom: 15px; padding: 10px; border-radius: 6px; display: flex; flex-direction: column; }
    /* .message-item:nth-child(odd) { background-color: #f0f2f5; } */ /* Alternating rows can be distracting */
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
    .sender-name { font-weight: bold; color: #007bff; }
    .sender-bot { font-weight: bold; color: #28a745; } /* Distinct color for bots */
    .timestamp { font-size: 0.8em; color: #606770; }
    .message-content { line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
    .message-content p { margin: 0; }
    .message-type-info { font-style: italic; color: #888; font-size: 0.9em; margin-top: 3px; }
    .message-id { font-size: 0.7em; color: #aaa; text-align: right; margin-top: 5px; }
    hr { border: 0; border-top: 1px solid #e0e0e0; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="chat-container">
    <header><h1>${escapeHtml(chatName)}</h1></header>
`;

    messages.forEach((msg, index) => {
      const timestamp = MessageModel.getFormattedTimestamp(msg, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
      const senderName = escapeHtml(MessageModel.getSenderDisplayName(msg));
      const textContent = escapeHtml(MessageModel.extractTextContent(msg)); // Already extracts meaningful text or placeholder
      // const messageType = escapeHtml(msg.message_type); // Not always needed if extractTextContent is good

      const senderClass = msg.sender.sender_type === 'bot' ? 'sender-bot' : 'sender-name';

      htmlContent += `
    <div class="message-item" id="msg-${escapeHtml(msg.message_id)}">
      <div class="message-header">
        <span class="${senderClass}">${senderName}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-content">
        <p>${textContent.replace(/\n/g, '<br>')}</p>
      </div>
      <div class="message-id">ID: ${escapeHtml(msg.message_id)}</div>`;

      htmlContent += `
    </div>`;
      if (index < messages.length - 1) {
        htmlContent += '<hr>';
      }
    });

    htmlContent += `
  </div>
</body>
</html>`;

    return htmlContent;
  } catch (error: any) {
    log('error', 'Error formatting messages to HTML:', error.message);
    throw new Error('Failed to format messages to HTML.');
  }
}


