# Repository Guidelines

## Project Structure & Module Organization
- `index.tsx` mounts `App.tsx`, which coordinates panel routing, persistence, and IndexedDB initialization.
- `components/` holds workspace panels (Sidebar, ProjectSetup, CharacterForge, OutlineBuilder, etc.); move reusable widgets into `components/common/` when they spread.
- `services/db.ts` and `services/geminiService.ts` house persistence/API work; extend them and reuse contracts from `types.ts` via the `@` alias.
- `index.html`, `.env.local`, and `vite.config.ts` store shell markup, environment wiring, and alias configuration; keep assets next to the feature that consumes them.

## Build, Test, and Development Commands
- `npm install`: install dependencies before touching generated assets.
- `npm run dev`: start Vite on `0.0.0.0:3000` using `.env.local` for keys.
- `npm run build`: emit the `dist/` bundle; run before publishing or sharing previews.
- `npm run preview`: serve the build to verify API injection and IndexedDB migrations.
- Add `npm run test` once Vitest exists (wrap `vitest run --coverage`) so CI stays stable.

## Coding Style & Naming Conventions
- TypeScript components use hooks; keep components/types in `PascalCase`, values/functions in `camelCase`, and enums/constants in `UPPER_SNAKE_CASE`.
- Retain two-space indentation, single quotes, semicolons, and import order React -> local utilities/services -> assets/styles.
- Prefer Tailwind utility strings or `clsx`, push heavy logic into services or memoized helpers, and keep filenames aligned with the exported symbol.

## Testing Guidelines
- Co-locate specs in `__tests__` folders beside the source (e.g., `components/Sidebar/__tests__/Sidebar.test.tsx`, `services/__tests__/db.test.ts`).
- Aim for >=80% coverage on `services/` and save/load orchestrators, mixing shallow renders with IndexedDB integration tests.
- Run suites via `npx vitest --run --coverage` (future `npm run test`) and detail manual verification in PRs whenever automation is incomplete.

## Commit & Pull Request Guidelines
- Without Git history, self-impose Conventional Commit subjects (`feat: add wiki autosave`, `fix: debounce gemini retries`) and keep summaries <=72 characters.
- PRs must provide a short description, linked issue/ticket, screenshots or GIFs for UI changes, and the command(s) executed for testing.
- Keep scopes tight; land dependency bumps or cross-cutting refactors separately to simplify bisects.

## Security & Configuration Tips
- Secrets (`GEMINI_API_KEY`, OpenAI/DeepSeek tokens, custom base URLs) stay in `.env.local`; `vite.config.ts` already injects them into `process.env`, so never commit populated env files or literals.
- When changing the IndexedDB schema in `services/db.ts`, bump `DB_VERSION`, add upgrade guards, and remind QA to clear cached data.
- Scrub exported IndexedDB backups or screenshots that include generated prose or prompts before sharing outside the team.
