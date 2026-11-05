import { describe, expect, it, jest } from '@jest/globals';
const send = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock('../configs/aws', () => ({ awsConfig: { region: 'eu-central-1' } }));
jest.mock('@aws-sdk/client-textract', () => ({
  TextractClient: jest.fn().mockImplementation(() => ({ send: (...args: any[]) => send(...args) })),
  DetectDocumentTextCommand: jest.fn().mockImplementation(input => ({ input })),
}));
import { extractTextFromBuffer } from './awsTextractService';

describe('Textract buffer input', () => {
  it('sends original bytes and returns only nonempty LINE blocks', async () => {
    const bytes = Buffer.from([255, 216, 255]);
    send.mockResolvedValue({ Blocks: [{ BlockType: 'LINE', Text: 'Total 100' }, { BlockType: 'WORD', Text: 'Total' }, { BlockType: 'LINE' }] });
    expect(await extractTextFromBuffer(bytes)).toEqual(['Total 100']);
    expect(send).toHaveBeenCalledWith({ input: { Document: { Bytes: bytes } } });
  });
  it('propagates service failures to the job processor', async () => {
    send.mockRejectedValue(new Error('AWS unavailable'));
    await expect(extractTextFromBuffer(Buffer.from('jpeg'))).rejects.toThrow('AWS unavailable');
  });
});
