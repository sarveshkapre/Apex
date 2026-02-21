# AGENTS.md

## UI/UX Implementation Baseline (Mandatory)

For all frontend work in this repository, use the **shadcn/ui Tailwind v4 + Radix primitives** approach as the default design system.

### Canonical references

- shadcn Tailwind v4 docs: https://ui.shadcn.com/docs/tailwind-v4
- Radix Styling guide: https://www.radix-ui.com/primitives/docs/guides/styling
- Radix Composition (`asChild`) guide: https://www.radix-ui.com/primitives/docs/guides/composition

### Local reference repo (preferred for concrete examples)

- `/Users/sarvesh/code/ui/apps/v4`
- `/Users/sarvesh/code/ui/apps/v4/styles/globals.css`
- `/Users/sarvesh/code/ui/apps/v4/registry/new-york-v4/ui`
- `/Users/sarvesh/code/ui/apps/v4/content/docs/(root)/tailwind-v4.mdx`
- `/Users/sarvesh/code/ui/apps/v4/content/docs/components/radix`

## Engineering rules for UI changes

- Build page features by composing primitives from `web/src/components/ui/*` first.
- If a primitive is missing, add it using shadcn-compatible patterns (CVA variants, `data-slot`, `data-state`, `asChild` support where relevant).
- Keep theming token-driven (CSS custom properties + Tailwind v4 `@theme` style mapping).
- Avoid one-off visual styles directly in feature components when a reusable primitive/variant is appropriate.
- Keep accessibility semantics from Radix primitives intact (focus states, keyboard behavior, aria attributes).

## Required quality bar for any UI PR

- Uses modular reusable primitives/variants, not duplicated ad-hoc markup.
- Uses consistent spacing, radius, color, and typography tokens.
- Has clear empty/loading/error states for new UI surfaces.
- Works on desktop + mobile breakpoints.
- Preserves or improves keyboard/focus behavior.

## Before shipping UI work

- Cross-check with `uiux.md` in this repo.
- Validate with:
  - `npm --prefix web run lint`
  - `npm --prefix web run build`
