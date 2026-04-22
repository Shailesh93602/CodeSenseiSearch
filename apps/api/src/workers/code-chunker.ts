/**
 * AST-aware code chunker.
 *
 * The original chunker in base.worker.ts split code by fixed character
 * counts with word-boundary snapping. That works for prose but produces
 * low-quality embeddings for code — a 1000-char chunk will slice a
 * function in half and a SearchResult that points "line 42-68" won't
 * line up with anything a human can act on.
 *
 * This module walks the TypeScript AST and emits one chunk per
 * function / method / class / top-level variable with an initializer.
 * Everything between declarations (imports, comments, interstitial
 * statements) is returned as a separate "module-scope" chunk so we
 * don't drop it on the floor.
 *
 * For languages the TS parser can't handle (Go, Rust, Python, etc.)
 * we fall back to the caller's existing chunker. Detection is by
 * `isAstSupportedLanguage`.
 */
import * as ts from 'typescript';

export type CodeChunkKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'module-scope';

export interface CodeChunk {
  text: string;
  startChar: number;
  endChar: number;
  startLine: number;
  endLine: number;
  kind: CodeChunkKind;
  name?: string;
}

const AST_LANGUAGES = new Set([
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'js',
  'ts',
]);

export function isAstSupportedLanguage(language: string | null | undefined): boolean {
  if (!language) return false;
  return AST_LANGUAGES.has(language.toLowerCase());
}

/**
 * Pick the right ScriptKind for the file so the parser handles .tsx
 * JSX and .js no-types correctly.
 */
function scriptKindFor(language: string): ts.ScriptKind {
  const lower = language.toLowerCase();
  if (lower === 'tsx') return ts.ScriptKind.TSX;
  if (lower === 'jsx') return ts.ScriptKind.JSX;
  if (lower === 'js' || lower === 'javascript') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * Parse `source` and emit one chunk per top-level declaration plus
 * module-scope segments between them. Best-effort: parse errors degrade
 * gracefully (the parser still produces a tree; we just get fewer or
 * differently-shaped nodes).
 */
export function chunkByAst(source: string, language: string): CodeChunk[] {
  const sourceFile = ts.createSourceFile(
    `chunk.${language}`,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    scriptKindFor(language),
  );

  const chunks: CodeChunk[] = [];
  let cursor = 0;

  const flushInterstitial = (upTo: number) => {
    if (upTo <= cursor) return;
    const text = source.slice(cursor, upTo).trim();
    if (text.length === 0) {
      cursor = upTo;
      return;
    }
    chunks.push({
      text,
      startChar: cursor,
      endChar: upTo,
      startLine: lineOf(sourceFile, cursor),
      endLine: lineOf(sourceFile, upTo - 1),
      kind: 'module-scope',
    });
    cursor = upTo;
  };

  for (const node of sourceFile.statements) {
    const chunk = declarationChunk(node, sourceFile, source);
    if (!chunk) continue;

    flushInterstitial(chunk.startChar);
    chunks.push(chunk);
    cursor = chunk.endChar;
  }

  flushInterstitial(source.length);

  return chunks;
}

function declarationChunk(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  source: string,
): CodeChunk | null {
  const kind = classify(node);
  if (!kind) return null;

  // Include leading jsdoc / trivia in the chunk so the doc comment
  // travels with its function. getFullStart covers leading trivia;
  // getStart() skips it. We want full including comments, BUT not so
  // much that we swallow blank lines above — trim whitespace from the
  // leading side.
  const rawStart = node.getFullStart();
  const start = skipBlankLines(source, rawStart);
  const end = node.getEnd();

  const text = source.slice(start, end).trimEnd();
  const name = nameOf(node);

  return {
    text,
    startChar: start,
    endChar: end,
    startLine: lineOf(sourceFile, start),
    endLine: lineOf(sourceFile, end - 1),
    kind,
    ...(name ? { name } : {}),
  };
}

function classify(node: ts.Node): CodeChunkKind | null {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';

  // `export const foo = () => {}` or `const x = ...` at module scope —
  // treat the whole statement as one chunk so we don't lose the
  // initializer's function body.
  if (ts.isVariableStatement(node)) {
    const hasCallable = node.declarationList.declarations.some((d) => {
      if (!d.initializer) return false;
      return (
        ts.isArrowFunction(d.initializer) ||
        ts.isFunctionExpression(d.initializer) ||
        ts.isClassExpression(d.initializer)
      );
    });
    return hasCallable ? 'function' : 'variable';
  }

  return null;
}

function nameOf(node: ts.Node): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) return first.name.text;
  }
  return undefined;
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  if (pos < 0) return 0;
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    Math.max(0, Math.min(pos, sourceFile.text.length)),
  );
  return line + 1;
}

/**
 * Walk forward from `pos` past any blank/whitespace-only lines. Ensures
 * that a chunk for a function preceded by 10 blank lines doesn't include
 * all 10.
 */
function skipBlankLines(source: string, pos: number): number {
  let i = pos;
  while (i < source.length) {
    const nextNewline = source.indexOf('\n', i);
    if (nextNewline === -1) break;
    const line = source.slice(i, nextNewline);
    if (line.trim() !== '') break;
    i = nextNewline + 1;
  }
  return i;
}
