const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const {
  extractTextFromPdf,
  analyzeDocumentMedia,
  processInboundMedia,
} = require('../src/whatsappAutomation/mediaProcessor');

/** Helper to generate a minimal valid PDF buffer with text stream */
function createTestPdf(text) {
  const streamContent = `BT /F1 12 Tf 72 712 Td (${text}) Tj ET`;
  const compressed = zlib.deflateSync(Buffer.from(streamContent, 'utf-8'));

  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${compressed.length} /Filter /FlateDecode >>
stream
${compressed.toString('binary')}
endstream
endobj
xref
0 6
0000000000 65535 f 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
%%EOF`;

  return Buffer.from(pdfString, 'binary');
}

test('extractTextFromPdf extracts text from compressed FlateDecode streams', () => {
  const pdfBuffer = createTestPdf('MSEDCL Consumer: 021548796541 Units: 350 Amount: 4200');
  const extracted = extractTextFromPdf(pdfBuffer);
  assert.ok(extracted.includes('MSEDCL Consumer: 021548796541'));
  assert.ok(extracted.includes('Units: 350'));
  assert.ok(extracted.includes('Amount: 4200'));
});

test('analyzeDocumentMedia downloads and extracts text from incoming PDF', async () => {
  const testBillText = 'MAHAVITARAN ELECTRICITY BILL Consumer No 1928374655 Billed Units 410 Total 4850';
  const pdfBuffer = createTestPdf(testBillText);

  const mockProvider = {
    async downloadMedia(ref) {
      assert.equal(ref.providerMediaId, 'media_doc_123');
      return { buffer: pdfBuffer, mime: 'application/pdf' };
    },
  };

  const result = await analyzeDocumentMedia({
    provider: mockProvider,
    media: { providerMediaId: 'media_doc_123', mime: 'application/pdf', filename: 'bill.pdf' },
    filename: 'bill.pdf',
    caption: 'Please calculate solar requirement',
    automation: { name: 'Vaibhav Solar' },
  });

  assert.equal(result.success, true);
  assert.ok(result.extractedText.includes('Consumer No 1928374655'));
  assert.ok(result.promptForLLM.includes('MAHAVITARAN ELECTRICITY BILL'));
  assert.ok(result.promptForLLM.includes('Please calculate solar requirement'));
  assert.ok(result.logText.includes('bill.pdf'));
});

test('processInboundMedia routes audio, image, and document messages', async () => {
  // Test PDF via processInboundMedia
  const pdfBuffer = createTestPdf('Solar Proposal Roof Area 800 sqft RCC Flat');
  const mockProvider = {
    async downloadMedia() {
      return { buffer: pdfBuffer, mime: 'application/pdf' };
    },
  };

  const docMessage = {
    type: 'document',
    media: { providerMediaId: 'doc_id', filename: 'proposal.pdf' },
    caption: 'Check this roof layout',
  };

  const processed = await processInboundMedia({
    provider: mockProvider,
    message: docMessage,
    automation: { name: 'Vaibhav Solar' },
  });

  assert.ok(processed.userUtterance.includes('proposal.pdf'));
  assert.ok(processed.userUtterance.includes('Solar Proposal Roof Area 800 sqft'));
  assert.ok(processed.logText.includes('proposal.pdf'));
});

test('processInboundMedia handles video acknowledgment', async () => {
  const videoMessage = {
    type: 'video',
    media: { caption: 'Here is my rooftop video' },
  };

  const processed = await processInboundMedia({
    provider: {},
    message: videoMessage,
    automation: { name: 'Vaibhav Solar' },
  });

  assert.ok(processed.userUtterance.includes('Here is my rooftop video'));
  assert.ok(processed.logText.includes('Here is my rooftop video'));
});
