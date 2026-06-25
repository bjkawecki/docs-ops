# Frontend bundle notes

The production nginx image stays small; bundle size mainly affects first load and browser cache.

## Measure locally

```bash
cd apps/frontend
pnpm run build
# Optional: add rollup-plugin-visualizer to vite.config.ts for stats.html
```

## Applied optimizations

- **Route-level code splitting:** Admin tabs, `DocumentPage`, and `AdminPage` load via `React.lazy()` in `src/App.tsx`.
- **Icons:** Prefer named imports from `@tabler/icons-react` (already used in most files); avoid barrel re-exports.

## Further options (if bundle grows)

- Lazy-load `Help*` pages and heavy editor sub-routes.
- Copy only `apps/backend/src/api-types.ts` into the frontend Docker build stage instead of the full backend package (requires a stable shared-types export).
- Review TipTap/Mantine imports for tree-shaking (`@mantine/core` partial imports).
