const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const contentBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const uncompressedSize = contentBuf.length;
    const crc = crc32(contentBuf);
    const compressedBuf = zlib.deflateRawSync(contentBuf);
    const compressedSize = compressedBuf.length;

    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedBuf);

    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedBuf.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function generateXlsx(rows) {
  let sheetRowsXml = '';
  rows.forEach((row, rowIndex) => {
    const r = rowIndex + 1;
    let cellsXml = '';
    row.forEach((val, colIndex) => {
      const colLetter = String.fromCharCode(65 + colIndex);
      const cellRef = `${colLetter}${r}`;
      cellsXml += `<c r="${cellRef}" t="inlineStr"><is><t>${val}</t></is></c>`;
    });
    sheetRowsXml += `<row r="${r}">${cellsXml}</row>`;
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXmlRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRowsXml}
  </sheetData>
</worksheet>`;

  return createZip([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookXmlRels },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1Xml },
  ]);
}

const sampleNames = [
  'Yash Tupkar', 'Bhumika Akotkar', 'Rahul Sharma', 'Priya Patel', 'Amit Verma',
  'Ananya Joshi', 'Sneha Kulkarni', 'Rohit Singh', 'Pooja Nair', 'Vikram Malhotra',
  'Aditi Rao', 'Kunal Mehta', 'Deepak Gupta', 'Neha Deshmukh', 'Arjun Kapoor',
  'Ritu Jain', 'Siddharth Roy', 'Tanvi Shah', 'Gaurav Dubey', 'Meera Iyer'
];

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Hyderabad', 'Nagpur', 'Ahmedabad', 'Chennai', 'Indore', 'Kolkata'];

// Generate 20 test contacts. Row 1 and 2 are the user's verified test numbers
const contactRows = [
  ['Name', 'Phone', 'City'],
  ['Yash Tupkar', '91789297769', 'Nagpur'],
  ['Bhumika Akotkar', '917389721838', 'Pune'],
];

// Add 18 more sample rows
for (let i = 2; i < sampleNames.length; i++) {
  const fakeNumber = `9198${String(10000000 + i * 4231).slice(0, 8)}`;
  contactRows.push([sampleNames[i], fakeNumber, cities[i % cities.length]]);
}

// 1. Write test_contacts_20.xlsx
const xlsx20Buf = generateXlsx(contactRows);
const xlsx20Path = path.join(__dirname, 'test_campaign_contacts.xlsx');
fs.writeFileSync(xlsx20Path, xlsx20Buf);
console.log(`Created Excel: ${xlsx20Path} (${contactRows.length - 1} contacts)`);

// 2. Write test_contacts_20.csv
const csv20Lines = contactRows.map(r => r.join(',')).join('\n') + '\n';
const csv20Path = path.join(__dirname, 'test_campaign_contacts.csv');
fs.writeFileSync(csv20Path, csv20Lines, 'utf8');
console.log(`Created CSV: ${csv20Path} (${contactRows.length - 1} contacts)`);
