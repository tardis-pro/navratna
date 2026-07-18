export interface TextSplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 150;

const PARAGRAPH_BOUNDARY = /\n\s*\n/;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9"'([])/;

function splitToUnits(text: string): string[] {
  const paragraphs = text.split(PARAGRAPH_BOUNDARY);
  const units: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    for (const sentence of trimmed.split(SENTENCE_BOUNDARY)) {
      const s = sentence.trim();
      if (s) units.push(s);
    }
  }
  return units;
}

function hardSlice(unit: string, chunkSize: number): string[] {
  const pieces: string[] = [];
  for (let i = 0; i < unit.length; i += chunkSize) {
    pieces.push(unit.slice(i, i + chunkSize));
  }
  return pieces;
}

export function splitText(text: string, options: TextSplitterOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = Math.min(options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP, Math.floor(chunkSize / 2));

  const units = splitToUnits(text).flatMap((u) => (u.length > chunkSize ? hardSlice(u, chunkSize) : u));

  const chunks: string[] = [];
  let current = '';

  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (chunkOverlap > 0 && current.length > chunkOverlap) {
      const tail = current.slice(-chunkOverlap);
      current = `${tail} ${unit}`.slice(0, chunkSize);
    } else {
      current = unit;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.trim().length > 0);
}

export interface Chunk {
  content: string;
  title: string;
  tags: string[];
}

export function chunkDocument(
  fullText: string,
  fileName: string,
  tags: string[],
  options: TextSplitterOptions = {}
): Chunk[] {
  return splitText(fullText, options).map((content, index) => ({
    content,
    title: `${fileName}#${index}`,
    tags,
  }));
}
