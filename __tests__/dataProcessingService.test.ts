// __tests__/services/dataProcessingService.test.ts
import { DataProcessingService } from '../../src/services/dataProcessingService';
import { Message, ExportFormat } from '../../src/common/types';
import * as jsonFormatter from '../../src/formatters/jsonFormatter';
import * as csvFormatter from '../../src/formatters/csvFormatter';
import * as txtFormatter from '../../src/formatters/txtFormatter';
import * as htmlFormatter from '../../src/formatters/htmlFormatter';
import * as utils from '../../src/common/utils'; // To mock log

// Mock the formatter modules
jest.mock('../../src/formatters/jsonFormatter');
jest.mock('../../src/formatters/csvFormatter');
jest.mock('../../src/formatters/txtFormatter');
jest.mock('../../src/formatters/htmlFormatter');
jest.mock('../../src/common/utils', () => ({
    ...jest.requireActual('../../src/common/utils'), // Import and retain default behavior
    log: jest.fn(), // Mock log
}));


const mockedJsonFormatter = jsonFormatter as jest.Mocked<typeof jsonFormatter>;
const mockedCsvFormatter = csvFormatter as jest.Mocked<typeof csvFormatter>;
const mockedTxtFormatter = txtFormatter as jest.Mocked<typeof txtFormatter>;
const mockedHtmlFormatter = htmlFormatter as jest.Mocked<typeof htmlFormatter>;
const mockedLog = utils.log as jest.Mock;


describe('DataProcessingService', () => {
  let service: DataProcessingService;
  const mockMessages: Message[] = [{ message_id: '1' } as Message];
  const chatName = 'Test Chat';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataProcessingService();
  });

  it('should call formatToJson for "json" format', () => {
    mockedJsonFormatter.formatToJson.mockReturnValue('json_data');
    const result = service.processMessages(mockMessages, 'json', chatName);
    expect(mockedJsonFormatter.formatToJson).toHaveBeenCalledWith(mockMessages);
    expect(result).toBe('json_data');
    expect(mockedLog).toHaveBeenCalledWith('info', expect.stringContaining('Processing 1 messages into JSON format for chat "Test Chat"'));
  });

  it('should call formatToCsv for "csv" format', () => {
    mockedCsvFormatter.formatToCsv.mockReturnValue('csv_data');
    const result = service.processMessages(mockMessages, 'csv', chatName);
    expect(mockedCsvFormatter.formatToCsv).toHaveBeenCalledWith(mockMessages);
    expect(result).toBe('csv_data');
  });

  it('should call formatToTxt for "txt" format', () => {
    mockedTxtFormatter.formatToTxt.mockReturnValue('txt_data');
    const result = service.processMessages(mockMessages, 'txt', chatName);
    expect(mockedTxtFormatter.formatToTxt).toHaveBeenCalledWith(mockMessages);
    expect(result).toBe('txt_data');
  });

  it('should call formatToHtml for "html" format with chatName', () => {
    mockedHtmlFormatter.formatToHtml.mockReturnValue('html_data');
    const result = service.processMessages(mockMessages, 'html', chatName);
    expect(mockedHtmlFormatter.formatToHtml).toHaveBeenCalledWith(mockMessages, chatName);
    expect(result).toBe('html_data');
  });

  it('should call formatToHtml with default chatName if not provided', () => {
    mockedHtmlFormatter.formatToHtml.mockReturnValue('html_data_default');
    service.processMessages(mockMessages, 'html');
    expect(mockedHtmlFormatter.formatToHtml).toHaveBeenCalledWith(mockMessages, 'Chat Export');
  });

  it('should throw error for unsupported format', () => {
    // @ts-expect-error Testing invalid format
    expect(() => service.processMessages(mockMessages, 'xml', chatName))
      .toThrow('Unsupported export format requested: xml');
    expect(mockedLog).toHaveBeenCalledWith('error', 'Unsupported export format requested: xml');
  });

  it('should re-throw error if a formatter fails', () => {
    mockedJsonFormatter.formatToJson.mockImplementation(() => {
      throw new Error('JSON formatting failed');
    });
    expect(() => service.processMessages(mockMessages, 'json', chatName))
      .toThrow('Failed to format messages to JSON. JSON formatting failed');
    expect(mockedLog).toHaveBeenCalledWith('error', 'Error processing messages for format json:', 'JSON formatting failed');
  });
});


