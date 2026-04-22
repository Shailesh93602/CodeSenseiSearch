import { chunkByAst, isAstSupportedLanguage } from '../code-chunker';

describe('code-chunker (AST-aware)', () => {
  describe('isAstSupportedLanguage', () => {
    it.each(['typescript', 'tsx', 'javascript', 'jsx', 'js', 'ts'])(
      'recognises %s',
      (lang) => {
        expect(isAstSupportedLanguage(lang)).toBe(true);
      },
    );

    it.each(['python', 'go', 'rust', 'java', '', null, undefined])(
      'rejects %s',
      (lang) => {
        expect(isAstSupportedLanguage(lang as any)).toBe(false);
      },
    );
  });

  it('emits one chunk per top-level function', () => {
    const source = `
function add(a: number, b: number) {
  return a + b;
}

function sub(a: number, b: number) {
  return a - b;
}
    `.trim();

    const chunks = chunkByAst(source, 'typescript');
    const fns = chunks.filter((c) => c.kind === 'function');

    expect(fns).toHaveLength(2);
    expect(fns[0].name).toBe('add');
    expect(fns[0].text).toMatch(/function add/);
    expect(fns[0].text).toMatch(/return a \+ b/);
    expect(fns[1].name).toBe('sub');
  });

  it('treats exported arrow functions as function chunks', () => {
    const source = `
export const greet = (name: string) => {
  return \`hi, \${name}\`;
};
    `.trim();

    const chunks = chunkByAst(source, 'typescript');
    const arrow = chunks.find((c) => c.name === 'greet');

    expect(arrow).toBeDefined();
    expect(arrow!.kind).toBe('function');
    expect(arrow!.text).toMatch(/greet/);
    expect(arrow!.text).toMatch(/hi/);
  });

  it('emits one chunk per class', () => {
    const source = `
class Foo {
  bar() {
    return 1;
  }
  baz() {
    return 2;
  }
}

class Qux {
  hello() { return 'hi'; }
}
    `.trim();

    const chunks = chunkByAst(source, 'typescript');
    const classes = chunks.filter((c) => c.kind === 'class');

    expect(classes).toHaveLength(2);
    expect(classes[0].name).toBe('Foo');
    expect(classes[0].text).toMatch(/bar\(\)/);
    expect(classes[0].text).toMatch(/baz\(\)/);
    expect(classes[1].name).toBe('Qux');
  });

  it('preserves start/end line numbers for traceability', () => {
    const source =
      'import x from "x";\n' +
      '\n' +
      'function a() { return 1; }\n' +
      '\n' +
      'function b() {\n' +
      '  return 2;\n' +
      '}\n';

    const chunks = chunkByAst(source, 'typescript');
    const a = chunks.find((c) => c.name === 'a');
    const b = chunks.find((c) => c.name === 'b');

    expect(a!.startLine).toBe(3);
    expect(a!.endLine).toBe(3);
    expect(b!.startLine).toBe(5);
    expect(b!.endLine).toBe(7);
  });

  it('captures module-scope code between declarations as a chunk', () => {
    const source = `
import fs from 'fs';
const CONSTANT = 42;

function work() {
  return CONSTANT;
}
    `.trim();

    const chunks = chunkByAst(source, 'typescript');
    const moduleScope = chunks.filter((c) => c.kind === 'module-scope');
    const constantChunk = chunks.find((c) => c.name === 'CONSTANT');

    // Import is module-scope; CONSTANT is classified as variable (no
    // function initializer); work() is function.
    expect(moduleScope.length).toBeGreaterThanOrEqual(1);
    expect(moduleScope.some((c) => c.text.includes("import fs from 'fs'"))).toBe(true);
    expect(constantChunk?.kind).toBe('variable');
    expect(chunks.some((c) => c.name === 'work' && c.kind === 'function')).toBe(true);
  });

  it('does not crash on syntactically-broken source', () => {
    const source = `function broken( { { { /* missing close brace`;
    expect(() => chunkByAst(source, 'typescript')).not.toThrow();
  });

  it('handles JSX in .tsx files', () => {
    const source = `
export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
    `.trim();

    const chunks = chunkByAst(source, 'tsx');
    const button = chunks.find((c) => c.name === 'Button');

    expect(button).toBeDefined();
    expect(button!.text).toMatch(/<button>/);
  });

  it('returns empty array for empty source', () => {
    expect(chunkByAst('', 'typescript')).toEqual([]);
  });
});
