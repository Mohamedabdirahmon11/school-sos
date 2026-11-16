import test from 'node:test';
import assert from 'node:assert/strict';
import { isArtworkBelow200Dpi } from '../src/lib/documents/artwork.ts';

test('artwork resolution warning uses the selected page dimensions at about 200 DPI',()=>{
  assert.equal(isArtworkBelow200Dpi(1654,2339,'A4'),false);
  assert.equal(isArtworkBelow200Dpi(1200,1800,'A4'),true);
  assert.equal(isArtworkBelow200Dpi(675,426,'CR80'),false);
  assert.equal(isArtworkBelow200Dpi(400,300,'CR80'),true);
  assert.equal(isArtworkBelow200Dpi(0,100,'A4'),true);
});
