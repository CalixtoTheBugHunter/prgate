#!/usr/bin/env node
// Comment-policy linter (zero runtime dependencies — uses the TypeScript compiler
// API that already ships as a devDependency).
//
// Policy enforced across src/ and test/:
//   ALLOWED  1. `// TODO: ...` single-line comments (anywhere).
//   ALLOWED  2. JSDoc block comments (`/** ... */`) that are the leading comment of an
//               EXPORTED FUNCTION (an `export function` / `export default function`, or
//               an `export const foo = () => {}` / `= function () {}`).
//   REJECTED  everything else — plain `//` comments, non-JSDoc `/* */` blocks, JSDoc on
//             exported types/interfaces/consts, and JSDoc on any non-exported symbol.
//
// Comments are read from the parsed AST's trivia, so `//` or `/* */` sequences inside
// string and template literals are never mistaken for comments.
//
// Exits non-zero (failing CI) when any rejected comment is found.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOTS = ['src', 'test'];
const TODO_LINE = /^\/\/\s*TODO:/;

/** Recursively collect every .ts file under the given directory. */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** True when a node carries the `export` modifier (covers `export default`, too). */
function isExported(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

/** True when a statement is an exported function or exported arrow/function const. */
function isExportedFunction(statement) {
  if (ts.isFunctionDeclaration(statement)) {
    return isExported(statement);
  }
  if (ts.isVariableStatement(statement) && isExported(statement)) {
    return statement.declarationList.declarations.some(
      (decl) =>
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)),
    );
  }
  return false;
}

/** Positions where a JSDoc block is allowed: the leading comment of an exported function. */
function allowedJsdocStarts(sourceFile, text) {
  const allowed = new Set();
  for (const statement of sourceFile.statements) {
    if (!isExportedFunction(statement)) continue;
    for (const range of ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? []) {
      if (range.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        allowed.add(range.pos);
      }
    }
  }
  return allowed;
}

/** Enumerate every comment in the file from AST trivia, deduped by start position. */
function collectComments(sourceFile, text) {
  const byPos = new Map();
  const record = (range) => byPos.set(range.pos, range);
  const visit = (node) => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) record(range);
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) record(range);
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return [...byPos.values()].map((range) => ({
    kind: range.kind,
    pos: range.pos,
    body: text.slice(range.pos, range.end),
  }));
}

/** A `/** ... *\/` block (JSDoc), excluding the empty `/**\/` edge case. */
function isJsdoc(body) {
  return body.startsWith('/**') && body !== '/**/';
}

const violations = [];

for (const root of ROOTS) {
  for (const file of collectTsFiles(root)) {
    const text = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const allowed = allowedJsdocStarts(sourceFile, text);

    for (const comment of collectComments(sourceFile, text)) {
      const isLine = comment.kind === ts.SyntaxKind.SingleLineCommentTrivia;
      if (isLine) {
        if (TODO_LINE.test(comment.body.trimStart())) continue;
      } else if (isJsdoc(comment.body) && allowed.has(comment.pos)) {
        continue;
      }
      const line = sourceFile.getLineAndCharacterOfPosition(comment.pos).line + 1;
      const preview = comment.body.split('\n')[0].slice(0, 72);
      violations.push({ file, line, preview });
    }
  }
}

if (violations.length > 0) {
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  console.error(`✖ Comment policy: ${violations.length} disallowed comment(s).`);
  console.error('  Allowed: `// TODO:` lines, or JSDoc (/** */) on the exported API.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.preview}`);
  }
  process.exit(1);
}

console.log('✓ Comment policy: all comments conform.');
