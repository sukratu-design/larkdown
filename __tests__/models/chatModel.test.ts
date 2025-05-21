// __tests__/models/chatModel.test.ts
import { ChatModel } from '../../src/models/chatModel';
import { Chat } from '../../src/common/types';
import * as utils from '../../src/common/utils';

jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'),
    log: jest.fn(),
}));

describe('ChatModel', () => {
  const mockChats: Chat[] = [
    { chat_id: 'group1', name: 'Alpha Team', chat_type: 'group', member_count: 5, create_time: '1600000000000', description: 'Dev team' } as Chat,
    { chat_id: 'p2p1', name: '', chat_type: 'p2p', create_time: '1600000100000', description: 'With Bob' } as Chat,
    { chat_id: 'group2', name: '  Beta Squad  ', chat_type: 'group', create_time: '1600000200000' } as Chat, // With spaces in name
    { chat_id: 'group3', name: '', chat_type: 'group', create_time: '1600000300000' } as Chat, // No name
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock toLocaleDateString for consistent test results
    jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('01/01/2023');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });


  describe('getDisplayName', () => {
    it('should return name if available', () => {
      expect(ChatModel.getDisplayName(mockChats[0])).toBe('Alpha Team');
      expect(ChatModel.getDisplayName(mockChats[2])).toBe('Beta Squad'); // Trims spaces
    });
    it('should return "Direct Message" for P2P without name', () => {
      expect(ChatModel.getDisplayName(mockChats[1])).toBe('Direct Message');
    });
    it('should return default for group without name', () => {
      expect(ChatModel.getDisplayName(mockChats[3])).toBe('Group Chat (group3...)');
    });
  });

  describe('getDescription', () => {
    it('should construct description correctly for full group chat', () => {
      expect(ChatModel.getDescription(mockChats[0])).toBe('Group Chat • 5 members • Created: 01/01/2023 • "Dev team"');
    });
    it('should construct description for P2P chat', () => {
      expect(ChatModel.getDescription(mockChats[1])).toBe('Direct Message • Created: 01/01/2023 • "With Bob"');
    });
    it('should handle missing parts gracefully', () => {
      const minimalChat: Chat = { chat_id: 'min1', chat_type: 'group', create_time: '1600000400000' } as Chat;
      expect(ChatModel.getDescription(minimalChat)).toBe('Group Chat • Created: 01/01/2023');
    });
     it('should log warning for invalid create_time', () => {
        const chatWithInvalidTime: Chat = { ...mockChats[0], create_time: 'invalid' };
        ChatModel.getDescription(chatWithInvalidTime);
        expect(utils.log).toHaveBeenCalledWith('warn', 'Could not parse create_time for chat group1: invalid');
     });
  });

  describe('sortChats', () => {
    it('should sort groups first, then P2P, then by name', () => {
      const chatsToSort = [ mockChats[1], mockChats[3], mockChats[0], mockChats[2] ]; // p2p1, group3, group1, group2
      const sorted = ChatModel.sortChats(chatsToSort);
      // Expected: group1 (Alpha), group2 (Beta), group3 (Default), p2p1 (Direct)
      expect(ChatModel.getDisplayName(sorted[0])).toBe('Alpha Team');
      expect(ChatModel.getDisplayName(sorted[1])).toBe('Beta Squad');
      expect(ChatModel.getDisplayName(sorted[2])).toBe('Group Chat (group3...)');
      expect(ChatModel.getDisplayName(sorted[3])).toBe('Direct Message');
      expect(utils.log).toHaveBeenCalledWith('info', 'Sorting 4 chats.');
    });
  });

  describe('filterChats', () => {
    it('should return all if search text is empty', () => {
      expect(ChatModel.filterChats(mockChats, '')).toEqual(mockChats);
    });
    it('should filter by name (case-insensitive)', () => {
      expect(ChatModel.filterChats(mockChats, 'alpha').length).toBe(1);
      expect(ChatModel.filterChats(mockChats, 'ALPHA')[0].chat_id).toBe('group1');
    });
    it('should filter by description (case-insensitive)', () => {
      expect(ChatModel.filterChats(mockChats, 'dev team').length).toBe(1);
      expect(ChatModel.filterChats(mockChats, 'DEV TEAM')[0].chat_id).toBe('group1');
    });
    it('should filter by chat ID (case-insensitive)', () => {
      expect(ChatModel.filterChats(mockChats, 'p2p1').length).toBe(1);
      expect(ChatModel.filterChats(mockChats, 'P2P1')[0].chat_id).toBe('p2p1');
    });
    it('should return empty if no match', () => {
      expect(ChatModel.filterChats(mockChats, 'nonexistent').length).toBe(0);
    });
  });
});


