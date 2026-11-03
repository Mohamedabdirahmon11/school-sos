export interface PdfImageAsset {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPage {
  lines: string[];
  images?: PdfImageAsset[];
}

export type PdfPageInput = string[] | PdfPage;

interface ParsedImage {
  data: Buffer;
  width: number;
  height: number;
  filter: 'DCTDecode' | 'FlateDecode';
  colors: 1 | 3;
}

function cleanPdfText(value: string): string {
  return String(value).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
}

function readDataUrl(dataUrl: string): { kind: 'jpeg' | 'png'; data: Buffer } | null {
  const match = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;
  return { kind: match[1].toLowerCase() === 'png' ? 'png' : 'jpeg', data: Buffer.from(match[2], 'base64') };
}

function parseJpeg(data: Buffer): ParsedImage | null {
  if (data.length < 4 || data[0] !== 0xFF || data[1] !== 0xD8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xFF) { offset += 1; continue; }
    const marker = data[offset + 1];
    if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { offset += 2; continue; }
    if (offset + 3 >= data.length) return null;
    const length = data.readUInt16BE(offset + 2);
    const isStartOfFrame = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    if (isStartOfFrame) {
      if (offset + 9 >= data.length) return null;
      return { data, width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5), filter: 'DCTDecode', colors: 3 };
    }
    offset += 2 + length;
  }
  return null;
}

function parsePng(data: Buffer): ParsedImage | null {
  if (data.length < 33 || data.readUInt32BE(0) !== 0x89504E47 || data.readUInt32BE(4) !== 0x0D0A1A0A) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      if (payload.length < 13) return null;
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
    } else if (type === 'IDAT') {
      idat.push(payload);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 0 && colorType !== 2) || idat.length === 0) return null;
  return { data: Buffer.concat(idat), width, height, filter: 'FlateDecode', colors: colorType === 0 ? 1 : 3 };
}

function parseImage(dataUrl: string): ParsedImage | null {
  const decoded = readDataUrl(dataUrl);
  if (!decoded) return null;
  return decoded.kind === 'jpeg' ? parseJpeg(decoded.data) : parsePng(decoded.data);
}

export function createPdf(inputPages: PdfPageInput[]): Buffer {
  const pages: PdfPage[] = (inputPages.length ? inputPages : [['SchoolOS document']]).map(page => Array.isArray(page)
    ? { lines: page }
    : { lines: page.lines || [], images: page.images || [] });

  const images = new Map<string, { asset: ParsedImage; name: string; id: number }>();
  for (const page of pages) {
    for (const image of page.images || []) {
      if (images.has(image.dataUrl)) continue;
      const asset = parseImage(image.dataUrl);
      if (asset) images.set(image.dataUrl, { asset, name: `Im${images.size}`, id: 0 });
    }
  }

  const objects: Buffer[] = [];
  const allocate = () => { objects.push(Buffer.alloc(0)); return objects.length; };
  const catalogId = allocate();
  const pagesId = allocate();
  const pageSlots = pages.map(() => ({ pageId: allocate(), contentId: allocate() }));
  const fontId = allocate();
  for (const item of images.values()) item.id = allocate();

  const pageRefs = pageSlots.map(slot => `${slot.pageId} 0 R`).join(' ');
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'ascii');
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`, 'ascii');
  objects[fontId - 1] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'ascii');

  for (const item of images.values()) {
    const { asset, id } = item;
    const dict = [
      '/Type /XObject', '/Subtype /Image', `/Width ${asset.width}`, `/Height ${asset.height}`,
      `/ColorSpace ${asset.colors === 1 ? '/DeviceGray' : '/DeviceRGB'}`, '/BitsPerComponent 8',
      asset.filter === 'DCTDecode'
        ? '/Filter /DCTDecode'
        : `/Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${asset.colors} /BitsPerComponent 8 /Columns ${asset.width} >>`
    ].join(' ');
    objects[id - 1] = Buffer.concat([
      Buffer.from(`<< ${dict} /Length ${asset.data.length} >>\nstream\n`, 'ascii'),
      asset.data,
      Buffer.from('\nendstream', 'ascii')
    ]);
  }

  pages.forEach((page, index) => {
    const slot = pageSlots[index];
    const validImages = (page.images || []).map(image => ({ image, entry: images.get(image.dataUrl) })).filter(entry => entry.entry);
    const commands = validImages.map(({ image, entry }) => `q\n${image.width} 0 0 ${image.height} ${image.x} ${image.y} cm\n/${entry!.name} Do\nQ`);
    const hasHeaderImage = validImages.some(({ image }) => image.y + image.height > 700 && image.width <= 200);
    const textTop = hasHeaderImage ? 748 : 792;
    const textCommands = ['BT', '/F1 10 Tf', `48 ${textTop} Td`, '14 TL'];
    for (const raw of page.lines.flatMap(line => String(line ?? '').match(/.{1,96}/g) || [''])) {
      textCommands.push(`(${cleanPdfText(raw)}) Tj`, 'T*');
    }
    textCommands.push('ET');
    const stream = Buffer.from([...commands, ...textCommands].join('\n'), 'ascii');
    const xObjects = validImages.map(({ entry }) => `/${entry!.name} ${entry!.id} 0 R`).join(' ');
    const resources = `/Font << /F1 ${fontId} 0 R >>${xObjects ? ` /XObject << ${xObjects} >>` : ''}`;
    objects[slot.pageId - 1] = Buffer.from(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << ${resources} >> /Contents ${slot.contentId} 0 R >>`, 'ascii');
    objects[slot.contentId - 1] = Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('\nendstream', 'ascii')
    ]);
  });

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%SchoolOS\n', 'ascii')];
  const offsets = [0];
  let offset = chunks[0].length;
  for (let id = 1; id <= objects.length; id += 1) {
    const item = Buffer.concat([Buffer.from(`${id} 0 obj\n`, 'ascii'), objects[id - 1], Buffer.from('\nendobj\n', 'ascii')]);
    offsets[id] = offset;
    chunks.push(item);
    offset += item.length;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'ascii'));
  return Buffer.concat(chunks);
}
