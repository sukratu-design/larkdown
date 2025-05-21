// __tests__/formatters/htmlFormatter.test.ts
import { formatToHtml } from '../../src/formatters/htmlFormatter';
import { Message } from '../../src/common/types';
import { MessageModel } from '../../src/models/messageModel';
import * as utils from '../../src/common/utils';

jest.mock('../../src/models/messageModel');
jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'),
    log: jest.fn(),
}));

const MockedMessageModel = MessageModel as jest.Mocked<typeof MessageModel>;

describe('htmlFormatter', () => {
  const mockMessages: Message[] = [
    {
      message_id: 'id1', create_time: '1600000000000',
      content: JSON.stringify({ text: 'Hello <Reader>!' }),
      sender: { sender_id: { user_id: 'u1' }, sender_type: 'user', tenant_key: 't1' }
    } as Message,
    {
      message_id: 'id2', create_time: '1600000100000',
      content: JSON.stringify({ text: 'Reply with\nnewline & "quote"' }),
      sender: { sender_id: { user_id: 'u2' }, sender_type: 'bot', tenant_key: 't1' }
    } as Message,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    MockedMessageModel.getFormattedTimestamp.mockImplementation((msg, options) => new Date(parseInt(msg.create_time)).toLocaleString());
    MockedMessageModel.getSenderDisplayName.mockImplementation(msg => msg.sender.sender_type === 'bot' ? 'Bot Assistant' : `User ${msg.sender.sender_id.user_id}`);
    MockedMessageModel.extractTextContent.mockImplementation(msg => JSON.parse(msg.content).text);
  });

  it('should format messages to HTML correctly', () => {
    const result = formatToHtml(mockMessages, 'Test Chat <HTML>');
    
    expect(result).toContain('<title>Test Chat &lt;HTML&gt;</title>');
    expect(result).toContain('<h1>Test Chat &lt;HTML&gt;</h1>');

    // Message 1
    expect(result).toContain('<div class="message-item" id="msg-id1">');
    expect(result).toContain('<span class="sender-name">User u1</span>');
    expect(result).toContain(`<span class="timestamp">${new Date(1600000000000).toLocaleString()}</span>`);
    expect(result).toContain('<p>Hello &lt;Reader&gt;!</p>'); // Escaped content
    expect(result).toContain('<div class="message-id">ID: id1</div>');

    // Message 2
    expect(result).toContain('<div class="message-item" id="msg-id2">');
    expect(result).toContain('<span class="sender-bot">Bot Assistant</span>');
    expect(result).toContain(`<span class="timestamp">${new Date(1600000100000).toLocaleString()}</span>`);
    expect(result).toContain('<p>Reply with<br>newline &amp; &quot;quote&quot;</p>'); // Escaped and newline replaced
    expect(result).toContain('<div class="message-id">ID: id2</div>');
    
    expect(result).toContain('<hr>'); // Separator between messages
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 2 messages to HTML for chat: "Test Chat <HTML>".');
  });

  it('should use default chat name if not provided', () => {
    const result = formatToHtml(mockMessages);
    expect(result).toContain('<title>Chat Export</title>');
    expect(result).toContain('<h1>Chat Export</h1>');
  });
  
  it('should return basic HTML for empty messages array', () => {
    const result = formatToHtml([], 'Empty Test Chat');
    expect(result).toContain('<title>Empty Test Chat</title>');
    expect(result).not.toContain('<div class="message-item"');
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 0 messages to HTML for chat: "Empty Test Chat".');
  });

  it('should throw error if MessageModel fails', () => {
    MockedMessageModel.extractTextContent.mockImplementation(() => { throw new Error("Model Error"); });
    expect(() => formatToHtml(mockMessages, 'Fail Chat')).toThrow('Failed to format messages to HTML.');
    expect(utils.log).toHaveBeenCalledWith('error', 'Error formatting messages to HTML:', 'Model Error');
  });
});


