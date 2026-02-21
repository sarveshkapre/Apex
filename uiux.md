# UIUX.md

## Design system contract

This project uses a **modular shadcn/ui + Radix UI** architecture with Tailwind v4 tokens.

Primary references:

- https://ui.shadcn.com/docs/tailwind-v4
- https://www.radix-ui.com/primitives/docs/guides/styling
- https://www.radix-ui.com/primitives/docs/guides/composition

Local implementation references (from your checked-out UI repo):

- `/Users/sarvesh/code/ui/apps/v4/styles/globals.css`
- `/Users/sarvesh/code/ui/apps/v4/registry/new-york-v4/ui/button.tsx`
- `/Users/sarvesh/code/ui/apps/v4/registry/new-york-v4/ui/dialog.tsx`
- `/Users/sarvesh/code/ui/apps/v4/registry/new-york-v4/ui/card.tsx`
- `/Users/sarvesh/code/ui/apps/v4/registry/new-york-v4/ui/input.tsx`
- `/Users/sarvesh/code/ui/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx`

## Component strategy

1. Build from primitives in `web/src/components/ui/*`.
2. Prefer variant extension over new bespoke components.
3. Use `class-variance-authority` variants for reusable styling differences.
4. Use Radix primitives for interaction-heavy components (dialog, menu, popover, tabs, select, etc.).
5. Keep app-level components (`web/src/components/operator/*`, `web/src/components/portal/*`) composition-only where possible.

## Styling conventions

- Token-first:
  - Use semantic tokens (`background`, `foreground`, `muted`, `border`, `ring`, etc.).
  - Avoid hardcoded hex values in feature components unless explicitly required.
- State-driven styling:
  - Use Radix data attributes (`data-[state=open]`, etc.).
  - Keep focus styles visible and consistent.
- Layout rhythm:
  - Use consistent spacing scales and rounded radii.
  - Avoid large one-off spacing values in page components.

## Accessibility and interaction

- Preserve keyboard interactions from Radix primitives.
- Ensure all interactive elements have visible focus indicators.
- Provide screen-reader labels where icon-only controls are used.
- Use `asChild` composition to avoid nested interactive elements and preserve semantics.

## Page-level UX rules

- Every new surface should include:
  - loading state
  - empty state
  - error/failure state
- Prefer progressive disclosure over dense all-at-once panels.
- Use concise helper text for risky actions (approval-gated, destructive, irreversible).

## Implementation checklist (required before merge)

- New UI uses existing primitives or introduces reusable primitives under `web/src/components/ui`.
- New variants are typed and documented in the component file.
- No duplicated ad-hoc button/input/card styles across pages.
- Mobile + desktop layouts verified.
- Commands pass:
  - `npm --prefix web run lint`
  - `npm --prefix web run build`
