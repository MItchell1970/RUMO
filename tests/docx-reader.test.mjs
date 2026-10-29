import test from 'node:test';
import assert from 'node:assert/strict';
import pako from '../dist/vendor/pako.min.mjs';
import { extractDocxXml, extractDocxText, readDocxParts } from '../dist/docx-reader.js';
import { readCVFile } from '../dist/pdf-reader.js';
import { parseCV } from '../dist/cv-model.js';

const prefix = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const suffix = '</w:body></w:document>';
const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
function zip(files, compressed=true) {
  const encode = new TextEncoder();
  const local = [], central = [];
  let offset = 0;
  for (const [name,text] of Object.entries(files)) {
    const key=encode.encode(name), raw=encode.encode(text), data=compressed?pako.deflateRaw(raw):raw;
    const head=new Uint8Array(30+key.length+data.length), v=new DataView(head.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(8,compressed?8:0,true);v.setUint32(18,data.length,true);v.setUint32(22,raw.length,true);v.setUint16(26,key.length,true);head.set(key,30);head.set(data,30+key.length);
    const c=new Uint8Array(46+key.length),cv=new DataView(c.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(10,compressed?8:0,true);cv.setUint32(20,data.length,true);cv.setUint32(24,raw.length,true);cv.setUint16(28,key.length,true);cv.setUint32(42,offset,true);c.set(key,46);
    local.push(head);central.push(c);offset+=head.length;
  }
  const centralSize=central.reduce((sum,item)=>sum+item.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let position=0;
  for (const chunk of [...local,...central,end]){result.set(chunk,position);position+=chunk.length;}return result;
}
test('DOCX runs preserve deliberate spaces, line breaks, tabs, and entity characters', () => {
  const xml=prefix+'<w:p><w:r><w:t>Exper</w:t></w:r><w:r><w:t>iência em </w:t></w:r><w:r><w:t>dados &amp; análise</w:t><w:br/><w:t>Segundo trecho</w:t><w:tab/><w:t>2025</w:t></w:r></w:p>'+suffix;
  assert.equal(extractDocxXml(xml),'Experiência em dados & análise\nSegundo trecho\t2025');
});
test('DOCX table dates stay paired with their own employer and role', () => {
  const row='<w:tr><w:tc>'+p('EXEMPLO UNIVERSITY')+p('Bachelor in Economics')+'</w:tc><w:tc>'+p('')+'</w:tc><w:tc>'+p('')+'</w:tc><w:tc>'+p('Lisbon, Portugal')+p('2023 - 2026')+'</w:tc></w:tr>';
  const text=extractDocxXml(prefix+p('EDUCATION')+'<w:tbl>'+row+'</w:tbl>'+suffix);
  assert.equal(text,'EDUCATION\nEXEMPLO UNIVERSITY\tLisbon, Portugal\nBachelor in Economics\t2023 - 2026');
  assert.match(parseCV(text).education,/Bachelor in Economics\t2023 - 2026/);
});
test('DOCX imports compressed and stored archives, without inventing page metadata', async () => {
  for(const compressed of [true,false]) {
    const file=new File([zip({'word/document.xml':prefix+p('ANA COSTA')+p('EDUCATION')+p('University - Bachelor - 2025')+suffix},compressed)],'curriculo.docx');
    const result=await readCVFile(file);assert.equal(result.kind,'docx');assert.equal(result.metadata,null);assert.match(result.text,/ANA COSTA/);
  }
});
test('DOCX ignores deleted tracked text and field instructions while preserving inserted text', () => {
  assert.equal(extractDocxXml(prefix+'<w:p><w:del><w:r><w:t>Outdated</w:t></w:r></w:del><w:ins><w:r><w:t>Updated</w:t></w:r></w:ins><w:r><w:instrText>SECRET CODE</w:instrText></w:r></w:p>'+suffix),'Updated');
});
test('DOCX rejects unsafe XML, malformed archives and oversized expansion', () => {
  assert.throws(()=>extractDocxXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><x/>'));
  assert.throws(()=>readDocxParts(new Uint8Array(99)));
  assert.throws(()=>extractDocxText(zip({'word/document.xml':'<bad>'})));
  assert.throws(()=>readDocxParts(zip({'word/document.xml':'a'.repeat(6*1024*1024+1)})));
});
