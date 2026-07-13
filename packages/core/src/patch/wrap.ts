/**
 * Format-preserving JSX wrapping codemod (SPEC §5, §7).
 *
 * `wrapJsx` finds the app's root JSX — either the argument of a
 * `createRoot(...).render(<X/>)` / `ReactDOM.render(<X/>)` call, or the JSX a
 * default-exported component returns — and wraps it in one or more provider
 * components, adding each wrapper's import. Uses recast + @babel/parser so
 * untouched source keeps its exact formatting.
 *
 * Guarantees:
 *   - Idempotent: re-wrapping an already-wrapped tree (outermost-in) is a no-op;
 *     wrappers already present are skipped.
 *   - Graceful: if no render-site / default-component return can be located, the
 *     file is left byte-for-byte untouched and `unresolved: true` is signalled so
 *     the caller can surface a manual-step warning. Never corrupts the file.
 */
import * as recast from "recast";
import { parse as babelParse, parseExpression } from "@babel/parser";
import _traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import type { PatchResult, WrapSpec } from "../types.js";

// @babel/traverse ships CJS; normalize the default-export interop for ESM.
const traverse = ((_traverse as unknown as { default?: typeof _traverse })
  .default ?? _traverse) as typeof _traverse;

/** wrapJsx result: a PatchResult plus an "unresolvable target" signal. */
export interface WrapResult extends PatchResult {
  /** true ⇒ no render-site / component return found; file left untouched. */
  unresolved?: boolean;
}

const BABEL_PLUGINS = ["jsx", "typescript"] as const;

/** A recast-compatible babel parser configured for TS + JSX source. */
const parser = {
  parse(source: string): unknown {
    return babelParse(source, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      plugins: [...BABEL_PLUGINS],
      tokens: true,
    });
  },
};

type JsxNode = t.JSXElement | t.JSXFragment;

function isJsxNode(node: t.Node | null | undefined): node is JsxNode {
  return t.isJSXElement(node) || t.isJSXFragment(node);
}

/** The tag name of a JSX element, or null for fragments / member-expr names. */
function jsxElementName(node: t.Node): string | null {
  if (t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name)) {
    return node.openingElement.name.name;
  }
  return null;
}

/**
 * If `elPath` is a JSXElement with exactly one JSX child (whitespace ignored),
 * return the child's NodePath; else null. Lets us descend an existing wrapper
 * chain for idempotency.
 */
function singleJsxChildPath(
  elPath: NodePath<t.Node>,
): NodePath<t.Node> | null {
  if (!t.isJSXElement(elPath.node)) return null;
  const children = elPath.get("children");
  const list = Array.isArray(children) ? children : [children];
  const jsxKids = list.filter((c) => isJsxNode(c.node));
  return jsxKids.length === 1 ? jsxKids[0]! : null;
}

/** Build the JSX attributes for a wrapper's props (see WrapSpec convention). */
function buildAttributes(props?: Record<string, string>): t.JSXAttribute[] {
  if (!props) return [];
  return Object.entries(props).map(([key, raw]) => {
    const value = raw.trim();
    if (value.startsWith("{")) {
      // Expression container: strip the outer braces, parse the inner as an
      // expression (parenthesized so an object literal isn't read as a block).
      const inner = value.slice(1, value.lastIndexOf("}"));
      const expr = parseExpression(`(${inner})`, {
        plugins: [...BABEL_PLUGINS],
      }) as t.Expression;
      // Drop the parse-only parenthesization so recast reprints it verbatim.
      delete (expr as { extra?: unknown }).extra;
      return t.jsxAttribute(
        t.jsxIdentifier(key),
        t.jsxExpressionContainer(expr),
      );
    }
    return t.jsxAttribute(t.jsxIdentifier(key), t.stringLiteral(raw));
  });
}

/** Wrap `child` in a single `<Component …>child</Component>` element. */
function buildWrapper(spec: WrapSpec, child: JsxNode): t.JSXElement {
  const name = t.jsxIdentifier(spec.component);
  return t.jsxElement(
    t.jsxOpeningElement(name, buildAttributes(spec.props), false),
    t.jsxClosingElement(name),
    [child],
    false,
  );
}

/** Nest `wrappers` (outermost-first) around `core`. */
function nest(wrappers: WrapSpec[], core: JsxNode): JsxNode {
  let node: JsxNode = core;
  for (let i = wrappers.length - 1; i >= 0; i--) {
    node = buildWrapper(wrappers[i]!, node);
  }
  return node;
}

/** True if any existing import already binds `local` (avoids dup identifiers). */
function importsLocal(program: t.Program, local: string): boolean {
  for (const stmt of program.body) {
    if (!t.isImportDeclaration(stmt)) continue;
    for (const spec of stmt.specifiers) {
      if (spec.local.name === local) return true;
    }
  }
  return false;
}

/** Insert idempotent imports for `wrappers` after the last existing import. */
function ensureWrapperImports(program: t.Program, wrappers: WrapSpec[]): void {
  const seen = new Set<string>();
  const toAdd: t.ImportDeclaration[] = [];
  for (const w of wrappers) {
    if (seen.has(w.component)) continue;
    seen.add(w.component);
    if (importsLocal(program, w.component)) continue;

    const id = t.identifier(w.component);
    const specifier =
      (w.import ?? "named") === "default"
        ? t.importDefaultSpecifier(id)
        : t.importSpecifier(id, id);
    toAdd.push(t.importDeclaration([specifier], t.stringLiteral(w.from)));
  }
  if (toAdd.length === 0) return;

  let lastImport = -1;
  for (let i = 0; i < program.body.length; i++) {
    if (t.isImportDeclaration(program.body[i]!)) lastImport = i;
  }
  program.body.splice(lastImport + 1, 0, ...toAdd);
}

/** Locate the JSX argument of a `*.render(<X/>)` call. */
function findRenderSite(ast: t.Node): NodePath<t.Node> | null {
  let found: NodePath<t.Node> | null = null;
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property, { name: "render" })
      ) {
        const arg = path.node.arguments[0];
        if (isJsxNode(arg)) {
          found = path.get("arguments.0") as NodePath<t.Node>;
          path.stop();
        }
      }
    },
  });
  return found;
}

/** The first `return <JSX>` (or arrow-body JSX) inside a function path. */
function returnedJsxPath(
  fnPath: NodePath<t.Function>,
): NodePath<t.Node> | null {
  const node = fnPath.node;
  // Arrow with a direct JSX expression body: `() => <X/>`.
  if (
    (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) &&
    isJsxNode(node.body)
  ) {
    return fnPath.get("body") as NodePath<t.Node>;
  }

  let result: NodePath<t.Node> | null = null;
  fnPath.traverse({
    // Do not descend into nested functions — their returns aren't ours.
    Function(p) {
      p.skip();
    },
    ReturnStatement(p) {
      if (result) return;
      const arg = p.node.argument;
      if (isJsxNode(arg)) {
        result = p.get("argument") as NodePath<t.Node>;
        p.stop();
      }
    },
  });
  return result;
}

/** Locate the JSX returned by the default-exported component. */
function findDefaultComponentReturn(ast: t.Node): NodePath<t.Node> | null {
  let target: NodePath<t.Node> | null = null;

  traverse(ast, {
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;

      if (t.isFunctionDeclaration(decl)) {
        target = returnedJsxPath(path.get("declaration") as NodePath<t.Function>);
      } else if (
        t.isArrowFunctionExpression(decl) ||
        t.isFunctionExpression(decl)
      ) {
        target = returnedJsxPath(path.get("declaration") as NodePath<t.Function>);
      } else if (t.isIdentifier(decl)) {
        // `export default App` — find App's binding (function or arrow const).
        const binding = path.scope.getBinding(decl.name);
        if (binding) {
          const bp = binding.path;
          if (bp.isFunctionDeclaration()) {
            target = returnedJsxPath(bp as NodePath<t.Function>);
          } else if (bp.isVariableDeclarator()) {
            const init = bp.get("init");
            if (
              init.isArrowFunctionExpression() ||
              init.isFunctionExpression()
            ) {
              target = returnedJsxPath(init as NodePath<t.Function>);
            }
          }
        }
      }
      path.stop();
    },
  });

  return target;
}

export function wrapJsx(content: string, wrappers: WrapSpec[]): WrapResult {
  if (wrappers.length === 0) return { changed: false, content };
  if (content.trim() === "") {
    return { changed: false, content, unresolved: true };
  }

  let ast: t.Node;
  try {
    ast = recast.parse(content, { parser }) as unknown as t.Node;
  } catch {
    return { changed: false, content, unresolved: true };
  }

  const target = findRenderSite(ast) ?? findDefaultComponentReturn(ast);
  if (!target) return { changed: false, content, unresolved: true };

  // Idempotency: descend any already-present outermost wrapper prefix.
  let curPath = target;
  let matched = 0;
  while (matched < wrappers.length) {
    const name = jsxElementName(curPath.node);
    if (name !== wrappers[matched]!.component) break;
    const child = singleJsxChildPath(curPath);
    if (!child) break;
    curPath = child;
    matched++;
  }

  const missing = wrappers.slice(matched);
  if (missing.length === 0) return { changed: false, content };

  const core = curPath.node;
  if (!isJsxNode(core)) return { changed: false, content, unresolved: true };

  curPath.replaceWith(nest(missing, core));

  const program = (ast as t.File).program;
  ensureWrapperImports(program, missing);

  const output = recast.print(ast).code;
  if (output === content) return { changed: false, content };
  return { changed: true, content: output };
}
