// __tests__/formatters/txtFormatter.test.ts
import { formatToTxt } from '../../src/formatters/txtFormatter';
import { Message } from '../../src/common/types';
import { MessageModel } from '../../src/models/messageModel';
import * as utils from '../../src/common/utils';

jest.mock('../../src/models/messageModel');
jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'),
    log: jest.fn(),
}));

const MockedMessageModel = MessageModel as jest.Mocked<typeof MessageModel>;

describe('txtFormatter', () => {
  const mockMessages: Message[] = [
    {
      message_id: 'id1', create_time: '1600000000000',
      content: JSON.stringify({ text: 'Hello world' }),
      sender: { sender_id: { user_id: 'u1' }, sender_type: 'user', tenant_key: 't1' }
    } as Message,
    {
      message_id: 'id2', create_time: '1600000100000',
      content: JSON.stringify({ text: 'Multi-line\ncontent here.' }),
      sender: { sender_id: { user_id: 'u2', open_id: 'ou2' }, sender_type: 'bot', tenant_key: 't1' }
    } as Message,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    MockedMessageModel.getFormattedTimestamp.mockImplementation((msg, options) => `[${new Date(parseInt(msg.create_time)).toLocaleTimeString('en-GB')}]`); // Simple time for test
    MockedMessageModel.getSenderIdentifier.mockImplementation(msg => msg.sender.sender_id.user_id || msg.sender.sender_id.open_id || 'unknown');
    MockedMessageModel.getSenderDisplayName.mockImplementation(msg => msg.sender.sender_type === 'bot' ? 'BOT' : `User_${msg.sender.sender_id.user_id}`);
    MockedMessageModel.extractTextContent.mockImplementation(msg => JSON.parse(msg.content).text);
  });

  it('should format messages to TXT correctly', () => {
    const result = formatToTxt(mockMessages);
    const expectedOutput = 
`[[${new Date(1600000000000).toLocaleTimeString('en-GB')}]] User_u1 (ID: u1): Hello world (MsgID: id1)

[[${new Date(1600000100000).toLocaleTimeString('en-GB')}]] BOT (ID: u2): Multi-line
    content here. (MsgID: id2)`;

    expect(result).toBe(expectedOutput);
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 2 messages to TXT.');
  });

  it('should return empty string for empty messages array', () => {
    const result = formatToTxt([]);
    expect(result).toBe("");
    expect(utils.log).toHaveBeenCalledWith('info', 'Formatting 0 messages to TXT.');
  });
  
  it('should throw error if MessageModel fails', () => {
    MockedMessageModel.extractTextContent.mockImplementation(() => { throw new Error("Model Error"); });
    expect(() => formatToTxt(mockMessages)).toThrow('Failed to format messages to TXT.');
    expect(utils.log).toHaveBeenCalledWith('error', 'Error formatting messages to TXT:', 'Model Error');
  });
});


