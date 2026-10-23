import test from 'node:test';
import assert from 'node:assert/strict';
import { readPdfLinks } from '../scripts/manuals/pdf-links.mjs';

// A tiny PDF laid out the way Chrome writes one: the page tree, annotations and /Dests are plain objects.
// Pages: 3 (inside a nested /Pages node), 4 and 5, in that order.
const samplePdf = () =>
  Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj <</Type /Catalog /Pages 2 0 R /Dests 9 0 R>> endobj',
      '2 0 obj <</Type /Pages /Count 3 /Kids [6 0 R 5 0 R]>> endobj',
      '6 0 obj <</Type /Pages /Count 1 /Parent 2 0 R /Kids [3 0 R]>> endobj',
      '3 0 obj <</Type /Page /Parent 6 0 R /Annots [7 0 R 8 0 R 12 0 R]>> endobj',
      '5 0 obj <</Type /Pages /Count 2 /Parent 2 0 R /Kids [4 0 R 10 0 R]>> endobj',
      '4 0 obj <</Type /Page /Parent 5 0 R>> endobj',
      '10 0 obj <</Type /Page /Parent 5 0 R /Annots [11 0 R]>> endobj',
      '7 0 obj <</Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest /sec-a>> endobj',
      '8 0 obj <</Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest /A#2D1>> endobj',
      '12 0 obj <</Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest /missing>> endobj',
      '11 0 obj <</Type /Annot /Subtype /Link /Rect [0 0 10 10] /A <</S /URI /URI (https://example.com)>>>> endobj',
      '9 0 obj <</sec-a [4 0 R /XYZ 0 842 0] /A-1 [10 0 R /XYZ 0 842 0]>> endobj',
      'trailer <</Root 1 0 R>>',
      '%%EOF',
    ].join('\n'),
    'latin1',
  );

test('counts pages in page-tree order, through nested /Pages nodes', () => {
  assert.equal(readPdfLinks(samplePdf()).pageCount, 3);
});

test('resolves named destinations to page numbers, decoding #xx escapes', () => {
  const { links } = readPdfLinks(samplePdf());
  assert.deepEqual(links.filter((link) => link.dest), [
    { page: 1, dest: 'sec-a', targetPage: 2, uri: null },
    { page: 1, dest: 'A-1', targetPage: 3, uri: null },
    { page: 1, dest: 'missing', targetPage: null, uri: null },
  ]);
});

test('reports links to outside addresses', () => {
  const { links } = readPdfLinks(samplePdf());
  assert.deepEqual(links.filter((link) => link.uri), [{ page: 3, dest: null, targetPage: null, uri: 'https://example.com' }]);
});
