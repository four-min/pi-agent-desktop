import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { FolderIcon, getFileIcon } = await jiti.import("./FileIcons.tsx");

const render = (node) => renderToStaticMarkup(node);
const iconOf = (html) => html.match(/data-file-icon="([^"]+)"/)?.[1];
const toneOf = (html) => html.match(/data-file-icon-tone="([^"]+)"/)?.[1];

test("folders switch between closed and open icons and share the folder tone", () => {
  const closed = render(React.createElement(FolderIcon, { open: false }));
  const open = render(React.createElement(FolderIcon, { open: true }));
  assert.equal(iconOf(closed), "_folder");
  assert.equal(iconOf(open), "_folder_open");
  assert.equal(toneOf(closed), "folder");
  assert.equal(toneOf(open), "folder");
  assert.match(open, /--file-icon-tone-color:var\(--file-icon-folder\)/);
});

test("files of the same type share an icon and tone; types differ", () => {
  const cases = [
    ["a.ts", "typescript", "ts"],
    ["b.TSX", "typescript-react", "ts"],
    ["c.mjs", "javascript", "js"],
    ["main.py", "python", "code"],
    ["site.scss", "sass", "style"],
    ["index.html", "html", "markup"],
    ["tsconfig.json", "json", "config"],
    ["README.md", "markdown", "docs"],
    ["logo.png", "image", "image"],
    ["photo.JPEG", "image", "image"],
    ["Dockerfile", "docker", "config"],
  ];
  for (const [name, icon, tone] of cases) {
    const html = render(getFileIcon(name));
    assert.equal(iconOf(html), icon, name);
    assert.equal(toneOf(html), tone, name);
  }
});

test("unknown and extensionless files fall back to the untinted default icon", () => {
  for (const name of ["data.xyz", "LICENSE", "Makefile"]) {
    const html = render(getFileIcon(name));
    assert.equal(iconOf(html), "_file", name);
    assert.equal(toneOf(html), undefined, name);
    assert.doesNotMatch(html, /--file-icon-tone-color/);
  }
});

test("every referenced icon ships in both theme folders", () => {
  const names = new Set();
  for (const name of ["x.ts", "x.tsx", "x.js", "x.jsx", "x.py", "x.json", "x.css", "x.scss", "x.html", "x.md", "x.yaml", "x.toml", "x.sh", "x.rs", "x.go", "x.sql", "x.graphql", "x.tf", "x.docx", "x.pdf", "x.lock", "x.png", "x.svg", "x.unknown", ".env", ".gitignore", "package-lock.json", "bun.lock", "next.config.ts", "eslint.config.mjs", "vite.config.ts", "Dockerfile"]) {
    names.add(iconOf(render(getFileIcon(name))));
  }
  names.add("_folder");
  names.add("_folder_open");
  for (const name of names) {
    for (const flavor of ["latte", "mocha"]) {
      const url = new URL(`../public/icons/catppuccin/${flavor}/${name}.svg`, import.meta.url);
      assert.ok(existsSync(url), `${flavor}/${name}.svg`);
    }
  }
});
