// Reads the pages and link annotations of a PDF printed by Chrome, so the manual builder and the tests can check that
// every table-of-contents and appendix link lands on the right page. Chrome (Skia) writes the page tree, the annotations
// and the catalog's /Dests as plain objects, which is all this needs; a PDF that hides them in compressed object
// streams is refused rather than misread.

const decodeName = (name) => name.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const refList = (text) => [...text.matchAll(/(\d+)\s+\d+\s+R/g)].map((match) => match[1]);

function readObjects(source) {
  // Stream bodies are binary (images, page contents); drop them so their bytes can never look like PDF syntax.
  const text = source.replace(/stream\r?\n[\s\S]*?endstream/g, 'stream endstream');
  const objects = new Map();
  for (const match of text.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g)) objects.set(match[1], match[2]);
  return objects;
}

// The value of `/Key` inside a dictionary: an indirect reference is followed to its object.
function entry(objects, dict, key) {
  const match = new RegExp(`/${key}\\s*(\\d+\\s+\\d+\\s+R|\\[[^\\]]*\\]|<<[\\s\\S]*?>>|/[^\\s/\\[\\]<>()]+)`).exec(dict);
  if (!match) return null;
  const value = match[1];
  const ref = /^(\d+)\s+\d+\s+R$/.exec(value);
  return ref ? (objects.get(ref[1]) ?? null) : value;
}

/**
 * @param {Buffer | Uint8Array} bytes
 * @returns {{ pageCount: number, links: Array<{ page: number, dest: string | null, targetPage: number | null, uri: string | null }> }}
 */
export function readPdfLinks(bytes) {
  const objects = readObjects(Buffer.from(bytes).toString('latin1'));
  const catalog = [...objects.values()].find((body) => /\/Type\s*\/Catalog\b/.test(body));
  if (!catalog) throw new Error('PDF catalog not found (compressed object streams are not supported).');

  const pageIds = [];
  const visit = (id) => {
    const node = objects.get(id);
    if (!node) throw new Error(`PDF page tree object ${id} is missing.`);
    if (/\/Type\s*\/Pages\b/.test(node)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node);
      for (const kid of refList(kids ? kids[1] : '')) visit(kid);
    } else {
      pageIds.push(id);
    }
  };
  const root = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalog);
  if (!root) throw new Error('PDF page tree not found.');
  visit(root[1]);
  const pageNumber = new Map(pageIds.map((id, index) => [id, index + 1]));
  const pageOfDestination = (destination) => {
    const first = refList(destination)[0];
    return first ? (pageNumber.get(first) ?? null) : null;
  };

  const named = new Map();
  const dests = entry(objects, catalog, 'Dests');
  if (dests) {
    for (const match of dests.matchAll(/\/([^\s/\[\]<>()]+)\s*\[([^\]]*)\]/g)) named.set(decodeName(match[1]), pageOfDestination(match[2]));
  }

  const links = [];
  pageIds.forEach((pageId, index) => {
    const annots = entry(objects, objects.get(pageId), 'Annots');
    for (const annotId of annots ? refList(annots) : []) {
      const annot = objects.get(annotId) || '';
      if (!/\/Subtype\s*\/Link\b/.test(annot)) continue;
      const link = { page: index + 1, dest: null, targetPage: null, uri: null };
      const action = /\/A\s*<<([\s\S]*)>>/.exec(annot)?.[1] || '';
      const uri = /\/URI\s*\(((?:\\.|[^\\)])*)\)/.exec(action);
      const destination = /\/Dest\s*(\/[^\s/\[\]<>()]+|\[[^\]]*\])/.exec(annot)?.[1] || /\/D\s*(\/[^\s/\[\]<>()]+|\[[^\]]*\])/.exec(action)?.[1];
      if (uri) {
        link.uri = uri[1].replace(/\\(.)/g, '$1');
      } else if (destination?.startsWith('/')) {
        link.dest = decodeName(destination.slice(1));
        link.targetPage = named.get(link.dest) ?? null;
      } else if (destination) {
        link.targetPage = pageOfDestination(destination);
      }
      links.push(link);
    }
  });

  return { pageCount: pageIds.length, links };
}
