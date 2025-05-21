// __tests__/formatters/csvFormatter.test.ts
import { formatToCsv } from '../../src/formatters/csvFormatter';
import { Message } from '../../src/common/types';
import { MessageModel } from '../../src/models/messageModel';
import * as utils from '../../src/common/utils';

jest.mock('../../src/models/messageModel');
jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'),
    log: jest.fn(),
}));

const MockedMessageModel = MessageModel as jest.Mocked<typeof MessageModel>;

describe('csvFormatter', () => {
  const mockMessages: Message[] = [
    {
      message_id: 'id1', parent_id: undefined, root_id: undefined, create_time: '1600000000000', update_time: '1600000001000', chat_id: 'chat1', message_type: 'text',
      content: JSON.stringify({ text: 'Hello, "world"!' }),
      sender: { sender_id: { user_id: 'u1' }, sender_type: 'user', tenant_key: 't1' }
    } as Message,
    {
      message_id: 'id2', parent_id: 'id1', root_id: 'id1', create_time: '1600000100000', update_time: undefined, chat_id: 'chat1', message_type: 'text',
      content: JSON.stringify({ text: 'Reply\nNew line' }),
      sender: { sender_id: { user_id: 'u2', open_id: 'ou2' }, sender_type: 'bot', tenant_key: 't1' }
    } as Message,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks for MessageModel methods
    MockedMessageModel.getFormattedTimestamp.mockImplementation((msg, options) => new Date(parseInt(msg.create_time)).toUTCString());
    MockedMessageModel.getSenderIdentifier.mockImplementation(msg => msg.sender.sender_id.user_id || msg.sender.sender_id.open_id || 'unknown');
    MockedMessageModel.getSenderDisplayName.mockImplementation(msg => msg.sender.sender_type === 'bot' ? 'Bot' : `User ${msg.sender.sender_id.user_id}`);
    MockedMessageModel.extractTextContent.mockImplementation(msg => JSON.parse(msg.content).text);
  });

  it('should format messages to CSV correctly', () => {
    const result = formatToCsv(mockMessages);
    const rows = result.split('\n');

    expect(rows[0]).toBe('Message ID,Parent ID,Root ID,Timestamp (UTC),Updated Timestamp (UTC),Chat ID,Message Type,Sender ID,Sender Name,Sender Type,Content Text,Raw Content (JSON)');
    
    // Row 1
    expect(rows[1]).toContain('id1');
    expect(rows[1]).toContain(',,'); // parent_id and root_id are undefined
    expect(rows[1]).toContain(new Date(1600000000000).toUTCString() + ' UTC'); // create_time
    expect(rows[1]).toContain(new Date(1600000001000).toUTCString() + ' UTC'); // update_time
    expect(rows[1]).toContain('chat1');
    expect(rows[1]).toContain('text');
    expect(rows[1]).toContain('u1'); // sender_id
    expect(rows[1]).toContain('User u1'); // sender_name
    expect(rows[1]).toContain('user'); // sender_type
    expect(rows[1]).toContain('"Hello, ""world""!"'); // escaped text content
    expect(rows[1]).toContain('"{""text"":""Hello, \""world\""!"}"'); // escaped raw content

    // Row 2
    expect(rows[2]).toContain('id2');
    expect(rows[2]).toContain('id1,id1'); // parent_id and root_id
    expect(rows[2]).toContain(new Date(1600000100000).toUTCString() + ' UTC'); // create_time
    expect(rows[2]).toContain(',chat1'); // No update_time
    expect(rows[2]).toContain('text');
    expect(rows[2]).toContain('u2'); // sender_id (user_id takes precedence)
    expect(rows[2]).toContain('Bot'); // sender_name
    expect(rows[2]).toContain('bot'); // sender_type
    expect(rows[2]).toContain('"Reply\nNew line"'); // escaped text content
    expect(rows[2]).toContain('"{""text"":""Reply\\nNew line""}"'); // escaped raw content
    
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 2 messages to CSV.');
  });

  it('should return only headers for empty messages array', () => {
    const result = formatToCsv([]);
    expect(result).toBe('Message ID,Parent ID,Root ID,Timestamp (UTC),Updated Timestamp (UTC),Chat ID,Message Type,Sender ID,Sender Name,Sender Type,Content Text,Raw Content (JSON)');
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 0 messages to CSV.');
  });
  
  it('should throw error if MessageModel fails', () => {
    MockedMessageModel.extractTextContent.mockImplementation(() => { throw new Error("Model Error"); });
    expect(() => formatToCsv(mockMessages)).toThrow('Failed to format messages to CSV.');
    expect(utils.log).toHaveBeenCalledWith('error', 'Error formatting messages to CSV:', 'Model Error');
  });
});


