const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ -1) >>> 0;
}
function u16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function u32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

function makeStoredZip(files: Array<{name:string;content:string}>): Blob {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    u32(lv,0,0x04034b50); u16(lv,4,20); u16(lv,6,0x0800); u16(lv,8,0);
    u32(lv,14,crc); u32(lv,18,data.length); u32(lv,22,data.length);
    u16(lv,26,name.length); u16(lv,28,0);
    local.set(name,30); local.set(data,30+name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv,0,0x02014b50); u16(cv,4,20); u16(cv,6,20); u16(cv,8,0x0800); u16(cv,10,0);
    u32(cv,16,crc); u32(cv,20,data.length); u32(cv,24,data.length);
    u16(cv,28,name.length); u16(cv,30,0); u16(cv,32,0); u16(cv,34,0); u16(cv,36,0);
    u32(cv,38,0); u32(cv,42,offset);
    central.set(name,46); centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum,item)=>sum+item.length,0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev,0,0x06054b50); u16(ev,8,files.length); u16(ev,10,files.length);
  u32(ev,12,centralSize); u32(ev,16,offset); u16(ev,20,0);
  return new Blob([...locals,...centrals,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

export function htmlToDocxBlob(html: string, title: string): Blob {
  const parser = new DOMParser();
  const parsed = parser.parseFromString('<div>'+html+'</div>','text/html');
  const root = parsed.body.firstElementChild;
  const esc = (value:string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const runs = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return '<w:r><w:t xml:space="preserve">'+esc(node.textContent || '')+'</w:t></w:r>';
    if (!(node instanceof Element)) return '';
    if (node.tagName === 'BR') return '<w:r><w:br/></w:r>';
    if (node.tagName === 'IMG') return '';
    const inner = Array.from(node.childNodes).map(runs).join('');
    if (['STRONG','B'].includes(node.tagName)) return inner.replaceAll('<w:r>','<w:r><w:rPr><w:b/></w:rPr>');
    if (['EM','I'].includes(node.tagName)) return inner.replaceAll('<w:r>','<w:r><w:rPr><w:i/></w:rPr>');
    return inner;
  };
  const paragraph = (node: Element) => '<w:p><w:pPr>'+(node.tagName==='H1'?'<w:pStyle w:val="Title"/>':node.tagName==='H2'?'<w:pStyle w:val="Heading1"/>':'')+'</w:pPr>'+runs(node)+'</w:p>';
  const blocks = (node: Element): string => {
    if (node.tagName === 'TABLE') {
      const rows = Array.from(node.querySelectorAll(':scope > tbody > tr, :scope > tr'));
      return '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:color="94A3B8"/><w:bottom w:val="single" w:sz="4" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:color="94A3B8"/><w:insideH w:val="single" w:sz="4" w:color="94A3B8"/><w:insideV w:val="single" w:sz="4" w:color="94A3B8"/></w:tblBorders></w:tblPr>'+rows.map(row=>'<w:tr>'+Array.from(row.children).map(cell=>'<w:tc><w:tcPr/><w:p>'+runs(cell)+'</w:p></w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>';
    }
    if (['P','H1','H2','H3','DIV','LI'].includes(node.tagName)) return paragraph(node);
    return Array.from(node.children).map(blocks).join('') || paragraph(node);
  };
  const body = root ? Array.from(root.children).map(blocks).join('') : '';
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
  const contentTypes='<?xml version="1.0" encoding="UTF-8"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels='<?xml version="1.0" encoding="UTF-8"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return makeStoredZip([{name:'[Content_Types].xml',content:contentTypes},{name:'_rels/.rels',content:rels},{name:'word/document.xml',content:documentXml}]);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser-kan ma taageerayo furitaanka DOCX. Isticmaal Chrome ama Edge cusub.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function docxBlobToHtml(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd = -1;
  for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--) if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0) throw new Error('Faylka DOCX ma aha ZIP sax ah.');
  const count=view.getUint16(eocd+10,true);
  let cursor=view.getUint32(eocd+16,true);
  let documentBytes:Uint8Array|null=null;
  for(let i=0;i<count;i++){
    if(view.getUint32(cursor,true)!==0x02014b50) throw new Error('Qaabka DOCX lama akhrin karo.');
    const method=view.getUint16(cursor+10,true), compressed=view.getUint32(cursor+20,true);
    const nameLen=view.getUint16(cursor+28,true), extraLen=view.getUint16(cursor+30,true), commentLen=view.getUint16(cursor+32,true);
    const localOffset=view.getUint32(cursor+42,true);
    const name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLen));
    if(name==='word/document.xml'){
      const localName=view.getUint16(localOffset+26,true),localExtra=view.getUint16(localOffset+28,true);
      const start=localOffset+30+localName+localExtra;
      const packed=bytes.slice(start,start+compressed);
      documentBytes=method===0?packed:method===8?await inflateRaw(packed):null;
      break;
    }
    cursor+=46+nameLen+extraLen+commentLen;
  }
  if(!documentBytes) throw new Error('DOCX-kan kuma jiro word/document.xml ama compression-ka lama taageero.');
  const xml=new DOMParser().parseFromString(decoder.decode(documentBytes),'application/xml');
  if(xml.querySelector('parsererror')) throw new Error('Qoraalka DOCX wuu dhaawacmay.');
  const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const textOf=(node:Element)=>Array.from(node.getElementsByTagNameNS(w,'t')).map(t=>t.textContent||'').join('');
  const convert=(node:Element):string=>{
    const tag=node.localName;
    if(tag==='p'){
      const text=Array.from(node.getElementsByTagNameNS(w,'t')).map(t=>t.textContent||'').join('');
      const breaks=node.getElementsByTagNameNS(w,'br').length;
      const style=node.getElementsByTagNameNS(w,'pStyle')[0]?.getAttributeNS(w,'val')||'';
      const safe=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const inner=safe+(breaks?'<br>'.repeat(breaks):'');
      return style==='Title'?'<h1>'+inner+'</h1>':style.startsWith('Heading')?'<h2>'+inner+'</h2>':'<p>'+inner+'</p>';
    }
    if(tag==='tbl') return '<table><tbody>'+Array.from(node.children).filter(x=>x.localName==='tr').map(row=>'<tr>'+Array.from(row.children).filter(x=>x.localName==='tc').map(cell=>'<td>'+Array.from(cell.children).filter(x=>x.localName==='p').map(convert).join('')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    return Array.from(node.children).map(convert).join('');
  };
  const body=xml.getElementsByTagNameNS(w,'body')[0];
  if(!body) throw new Error('DOCX body lama helin.');
  return Array.from(body.children).filter(node=>['p','tbl'].includes(node.localName)).map(convert).join('');
}
