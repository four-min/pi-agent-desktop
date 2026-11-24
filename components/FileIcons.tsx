import type { CSSProperties } from "react";


interface IconProps {
  size?: number;
}

type CatppuccinIconName =
  | "_file"
  | "_folder"
  | "_folder_open"
  | "bash"
  | "config"
  | "css"
  | "database"
  | "docker"
  | "env"
  | "git"
  | "graphql"
  | "html"
  | "image"
  | "javascript"
  | "javascript-react"
  | "json"
  | "lock"
  | "npm-lock"
  | "bun-lock"
  | "next"
  | "eslint"
  | "markdown"
  | "ms-word"
  | "pdf"
  | "python"
  | "rust"
  | "sass"
  | "terraform"
  | "toml"
  | "typescript"
  | "typescript-react"
  | "yaml"
  | "go";

/** Color families for file icons. Each maps to a `--file-icon-<tone>` theme
 * variable (app/globals.css); icons without a tone stay `--text-dim`. The color
 * only shows where an ancestor opts in with `.file-icon-tinted` (the file tree). */
export type FileIconTone =
  | "folder"
  | "ts"
  | "js"
  | "code"
  | "style"
  | "markup"
  | "config"
  | "docs"
  | "image";

const ICON_TONES: Partial<Record<CatppuccinIconName, FileIconTone>> = {
  _folder: "folder",
  _folder_open: "folder",
  typescript: "ts",
  "typescript-react": "ts",
  javascript: "js",
  "javascript-react": "js",
  python: "code",
  rust: "code",
  go: "code",
  bash: "code",
  database: "code",
  graphql: "code",
  terraform: "code",
  css: "style",
  sass: "style",
  html: "markup",
  json: "config",
  yaml: "config",
  toml: "config",
  env: "config",
  config: "config",
  eslint: "config",
  next: "config",
  docker: "config",
  git: "config",
  lock: "config",
  "npm-lock": "config",
  "bun-lock": "config",
  markdown: "docs",
  "ms-word": "docs",
  pdf: "docs",
  image: "image",
};

const CATPPUCCIN_ICONS_ROOT = "/icons/catppuccin";

function CatppuccinIcon({ name, size = 14 }: IconProps & { name: CatppuccinIconName }) {
  const tone = ICON_TONES[name];
  const style = {
    width: size,
    height: size,
    "--catppuccin-icon-light": `url(${CATPPUCCIN_ICONS_ROOT}/latte/${name}.svg)`,
    "--catppuccin-icon-dark": `url(${CATPPUCCIN_ICONS_ROOT}/mocha/${name}.svg)`,
    ...(tone ? { "--file-icon-tone-color": `var(--file-icon-${tone})` } : {}),
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className="catppuccin-file-icon"
      data-file-icon={name}
      data-file-icon-tone={tone}
      style={style}
    />
  );
}

export function FolderIcon({ size = 14, open = false }: IconProps & { open?: boolean }) {
  return <CatppuccinIcon name={open ? "_folder_open" : "_folder"} size={size} />;
}

export function GenericFileIcon({ size = 14 }: IconProps) {
  return <CatppuccinIcon name="_file" size={size} />;
}

const EXTENSION_ICONS: Record<string, CatppuccinIconName> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript-react",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript-react",
  py: "python",
  json: "json",
  jsonc: "json",
  jsonl: "json",
  css: "css",
  less: "css",
  scss: "sass",
  sass: "sass",
  html: "html",
  htm: "html",
  md: "markdown",
  mdx: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "bash",
  rs: "rust",
  go: "go",
  sql: "database",
  graphql: "graphql",
  gql: "graphql",
  tf: "terraform",
  hcl: "terraform",
  docx: "ms-word",
  pdf: "pdf",
  lock: "lock",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  ico: "image",
  avif: "image",
  svg: "image",
};

function getSpecialFileIcon(name: string): CatppuccinIconName | undefined {
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "docker";
  if (name === ".env" || name.startsWith(".env.")) return "env";
  if ([".gitignore", ".gitattributes", ".gitmodules"].includes(name)) return "git";
  if (name === "package-lock.json") return "npm-lock";
  if (name === "bun.lock") return "bun-lock";
  if (["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"].includes(name)) return "next";
  if ([".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.mjs", "eslint.config.js"].includes(name)) return "eslint";
  if (["yarn.lock", "pnpm-lock.yaml", "cargo.lock"].includes(name)) return "lock";
  if (name.endsWith(".config.ts") || name.endsWith(".config.js") || name.endsWith(".config.mjs") || name.endsWith(".config.cjs")) return "config";
  return undefined;
}

export function getFileIcon(name: string, size = 14): React.ReactNode {
  const lower = name.toLowerCase();
  const specialIcon = getSpecialFileIcon(lower);
  if (specialIcon) return <CatppuccinIcon name={specialIcon} size={size} />;

  const ext = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
  const icon = EXTENSION_ICONS[ext];
  return icon ? <CatppuccinIcon name={icon} size={size} /> : <GenericFileIcon size={size} />;
}
