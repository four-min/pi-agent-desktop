# Catppuccin file icons

This directory contains a selected subset of [Catppuccin Icons for VSCode](https://github.com/catppuccin/vscode-icons), version `v1.26.0` (`b6915da9f6889b683a110aa747de96c2820a537d`).

- `latte/` is used in Pi Web's light theme.
- `mocha/` is used in Pi Web's dark theme.
- Pi Web uses the SVG alpha channel as a mask and applies `var(--text-dim)`,
  so the rendered icons remain monochrome in both themes. Inside the file tree
  (`.file-icon-tinted`) the mask is filled with a per-type tone instead
  (`--file-icon-*` in `app/globals.css`, mapped in `components/FileIcons.tsx`).
- `image.svg` is drawn for Pi Web in the same 16px stroke style; it is not part
  of the upstream set.

The copied assets are licensed under the MIT License. See [LICENSE](./LICENSE).
