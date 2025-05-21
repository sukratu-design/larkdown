// __tests__/models/messageModel.test.ts
import { MessageModel } from '../../src/models/messageModel';
import { Message } from '../../src/common/types';
import * as utils from '../../src/common/utils';

jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'),
    log: jest.fn(),
}));

describe('MessageModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock toLocaleString for consistent test results
    jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('01/01/2023, 12:00:00 AM');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('extractTextContent', () => {
    it('should extract text and clean mentions', () => {
      const msg: Message = { message_type: 'text', content: JSON.stringify({ text: 'Hello <at user_id="u1">@User1</at> and <at open_id="ou2">@User2</at>!' }) } as Message;
      expect(MessageModel.extractTextContent(msg)).toBe('Hello @User1 and @User2!');
    });
    it('should return placeholders for non-text types', () => {
      expect(MessageModel.extractTextContent({ message_type: 'image' } as Message)).toBe('[Image]');
      expect(MessageModel.extractTextContent({ message_type: 'file', content: JSON.stringify({ file_name: 'doc.pdf', file_size: '1048576' }) } as Message)).toBe('[File: doc.pdf] (Size: 1.00MB)');
      expect(MessageModel.extractTextContent({ message_type: 'audio' } as Message)).toBe('[Audio]');
      expect(MessageModel.extractTextContent({ message_type: 'video' } as Message)).toBe('[Video]');
      expect(MessageModel.extractTextContent({ message_type: 'sticker' } as Message)).toBe('[Sticker]');
      expect(MessageModel.extractTextContent({ message_type: 'post', content: JSON.stringify({ pc: { title: 'My Post' }}) } as Message)).toBe('[Post: My Post]');
      expect(MessageModel.extractTextContent({ message_type: 'share_chat', content: JSON.stringify({ chat_name: 'Shared Chat' }) } as Message)).toBe('[Shared Chat: Shared Chat]');
      expect(MessageModel.extractTextContent({ message_type: 'share_user', content: JSON.stringify({ user_name: 'Shared User' }) } as Message)).toBe('[Shared User: Shared User]');
      expect(MessageModel.extractTextContent({ message_type: 'interactive' } as Message)).toBe('[Interactive Message Card]');
      expect(MessageModel.extractTextContent({ message_type: 'system', content: JSON.stringify({ text: 'System update' }) } as Message)).toBe('[System: System update]');
      expect(MessageModel.extractTextContent({ message_type: 'unknown' } as Message)).toBe('[unknown message]');
    });
    it('should handle parsing errors', () => {
      const msg: Message = { message_id: 'err1', message_type: 'text', content: 'invalid_json' } as Message;
      expect(MessageModel.extractTextContent(msg)).toBe('[Error parsing text content]');
      expect(utils.log).toHaveBeenCalledWith('warn', 'Error extracting content from message err1 (type: text):', expect.any(String));
    });
  });

  describe('getFormattedTimestamp', () => {
    it('should format valid timestamp', () => {
      expect(MessageModel.getFormattedTimestamp({ create_time: '1600000000000' } as Message)).toBe('01/01/2023, 12:00:00 AM');
    });
    it('should handle invalid timestamp', () => {
      expect(MessageModel.getFormattedTimestamp({ message_id: 'ts_err', create_time: 'invalid' } as Message)).toBe('Unknown Time');
      expect(utils.log).toHaveBeenCalledWith('warn', 'Could not format timestamp for message ts_err: invalid', 'Invalid timestamp string');
    });
  });

  describe('getSenderIdentifier', () => {
    it('should return user_id if present', () => expect(MessageModel.getSenderIdentifier({ sender: { sender_id: { user_id: 'u1' } } } as Message)).toBe('u1'));
    it('should return open_id if user_id absent', () => expect(MessageModel.getSenderIdentifier({ sender: { sender_id: { open_id: 'ou1' } } } as Message)).toBe('ou1'));
    it('should return union_id if user_id and open_id absent', () => expect(MessageModel.getSenderIdentifier({ sender: { sender_id: { union_id: 'un1' } } } as Message)).toBe('un1'));
    it('should return UnknownID if no id present', () => expect(MessageModel.getSenderIdentifier({ sender: { sender_id: {} } } as Message)).toBe('UnknownID'));
  });

  describe('getSenderDisplayName', () => {
    it('should return "Bot" for bot type', () => expect(MessageModel.getSenderDisplayName({ sender: { sender_type: 'bot' } } as Message)).toBe('Bot'));
    it('should return mention name if matched', () => {
      const msg: Message = { sender: { sender_id: { user_id: 'u1' }, sender_type: 'user' }, mentions: [{ id: { user_id: 'u1' }, name: 'MatchedUser' } as Mention] } as Message;
      expect(MessageModel.getSenderDisplayName(msg)).toBe('MatchedUser');
    });
    it('should return truncated ID if no mention match', () => expect(MessageModel.getSenderDisplayName({ sender: { sender_id: { user_id: 'longuserid123' }, sender_type: 'user' } } as Message)).toBe('User (longus...)'));
    it('should return "Unknown User" if no ID or mention', () => expect(MessageModel.getSenderDisplayName({ sender: { sender_id: {}, sender_type: 'user' } } as Message)).toBe('Unknown User'));
  });

  describe('hasAttachment', () => {
    it.each(['image', 'file', 'audio', 'video', 'media'])('should return true for %s', (type) => {
      expect(MessageModel.hasAttachment({ message_type: type } as Message)).toBe(true);
    });
    it.each(['text', 'post', 'system'])('should return false for %s', (type) => {
      expect(MessageModel.hasAttachment({ message_type: type } as Message)).toBe(false);
    });
  });

  describe('groupByDate', () => {
    it('should group messages by date string', () => {
      const messages: Message[] = [
        { message_id: 'm1', create_time: '1600000000000' } as Message, // Date A
        { message_id: 'm2', create_time: '1600086399999' } as Message, // Date A (almost next day)
        { message_id: 'm3', create_time: '1600086400000' } as Message, // Date B (exactly next day UTC)
      ];
      jest.spyOn(Date.prototype, 'toDateString')
        .mockReturnValueOnce('Date A')
        .mockReturnValueOnce('Date A')
        .mockReturnValueOnce('Date B');
      
      const grouped = MessageModel.groupByDate(messages);
      expect(Object.keys(grouped)).toEqual(['Date A', 'Date B']);
      expect(grouped['Date A']).toEqual([messages[0], messages[1]]);
      expect(grouped['Date B']).toEqual([messages[2]]);
      expect(utils.log).toHaveBeenCalledWith('info', 'Grouping 3 messages by date.');
    });
    it('should skip messages with invalid timestamps for grouping', () => {
        const messages: Message[] = [ { message_id: 'm_inv', create_time: 'invalid' } as Message ];
        const grouped = MessageModel.groupByDate(messages);
        expect(Object.keys(grouped).length).toBe(0);
        expect(utils.log).toHaveBeenCalledWith('warn', 'Skipping message m_inv in groupByDate due to invalid timestamp: invalid', 'Invalid timestamp string for grouping');
    });
  });
});


