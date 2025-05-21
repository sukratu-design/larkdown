// __tests__/formatters/jsonFormatter.test.ts
import { formatToJson } from '../../src/formatters/jsonFormatter';
import { Message } from '../../src/common/types';
import { MessageModel } from '../../src/models/messageModel';
import * as utils from '../../src/common/utils';

jest.mock('../../src/models/messageModel');
jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'),
    log: jest.fn(),
}));

const MockedMessageModel = MessageModel as jest.Mocked<typeof MessageModel>;

describe('jsonFormatter', () => {
  const mockMessages: Message[] = [
    {
      message_id: 'id1', parent_id: undefined, root_id: 'root1', create_time: '1600000000000', update_time: '1600000001000',
      chat_id: 'chat1', chat_type: 'p2p', message_type: 'text',
      content: JSON.stringify({ text: 'First message' }),
      mentions: [{ key: 'm1', name: 'UserA' } as Mention],
      sender: { sender_id: { user_id: 'u1', open_id: 'ou1' }, sender_type: 'user', tenant_key: 't1' }
    } as Message,
    {
      message_id: 'id2', parent_id: 'id1', root_id: 'root1', create_time: '1600000100000', update_time: undefined,
      chat_id: 'chat1', chat_type: 'p2p', message_type: 'image',
      content: JSON.stringify({ image_key: 'key123' }),
      mentions: [],
      sender: { sender_id: { user_id: 'u2' }, sender_type: 'bot', tenant_key: 't1' }
    } as Message,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    MockedMessageModel.getFormattedTimestamp.mockImplementation((msg, options) => new Date(parseInt(msg.create_time)).toISOString());
    MockedMessageModel.getSenderIdentifier.mockImplementation(msg => msg.sender.sender_id.user_id || msg.sender.sender_id.open_id || 'unknown');
    MockedMessageModel.getSenderDisplayName.mockImplementation(msg => msg.sender.sender_type === 'bot' ? 'The Bot' : `User ${msg.sender.sender_id.user_id}`);
    MockedMessageModel.extractTextContent.mockImplementation(msg => msg.message_type === 'text' ? JSON.parse(msg.content).text : `[${msg.message_type}]`);
  });

  it('should format messages to JSON string correctly', () => {
    const result = formatToJson(mockMessages);
    const parsed = JSON.parse(result);

    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBe(2);

    // Message 1
    expect(parsed[0]).toEqual({
      message_id: 'id1',
      parent_id: undefined,
      root_id: 'root1',
      create_time_iso: new Date(1600000000000).toISOString(),
      create_timestamp_ms: '1600000000000',
      update_time_iso: new Date(1600000001000).toISOString(),
      update_timestamp_ms: '1600000001000',
      chat_id: 'chat1',
      chat_type: 'p2p',
      message_type: 'text',
      sender: {
        id: 'u1',
        display_name: 'User u1',
        type: 'user',
        raw_sender_details: mockMessages[0].sender
      },
      content_text: 'First message',
      content_raw: mockMessages[0].content,
      mentions: mockMessages[0].mentions
    });

    // Message 2
    expect(parsed[1]).toEqual({
      message_id: 'id2',
      parent_id: 'id1',
      root_id: 'root1',
      create_time_iso: new Date(1600000100000).toISOString(),
      create_timestamp_ms: '1600000100000',
      update_time_iso: undefined,
      update_timestamp_ms: undefined,
      chat_id: 'chat1',
      chat_type: 'p2p',
      message_type: 'image',
      sender: {
        id: 'u2',
        display_name: 'The Bot',
        type: 'bot',
        raw_sender_details: mockMessages[1].sender
      },
      content_text: '[image]',
      content_raw: mockMessages[1].content,
      mentions: []
    });
    
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 2 messages to JSON.');
  });

  it('should return "[]" for empty messages array', () => {
    const result = formatToJson([]);
    expect(result).toBe("[]"); // string "[]" because JSON.stringify([])
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 0 messages to JSON.');
  });
  
  it('should throw error if MessageModel fails', () => {
    MockedMessageModel.extractTextContent.mockImplementation(() => { throw new Error("Model Error"); });
    expect(() => formatToJson(mockMessages)).toThrow('Failed to format messages to JSON.');
    expect(utils.log).toHaveBeenCalledWith('error', 'Error formatting messages to JSON:', 'Model Error');
  });
});


