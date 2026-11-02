# SchoolOS working rules

- Complete authorized work autonomously, stage by stage, without asking questions. Record assumptions in `PROGRESS.md`.
- Preserve the existing design, colors, layout, naming, and working features. Do not restart or delete working features.
- Never print, log, commit, or hard-code secrets. Keep real credentials in the user's `.env` only.
- Keep `PROGRESS.md` truthful: mark each item DONE, PARTIAL, or NOT DONE. Never claim a change is done without running it.
- Run `npm run lint` and `npm run build` after each stage, fix failures, and record actual results.
- Commit each completed stage with `git add .` and `git commit -m "<stage>"`; configure git identity locally if needed.
- Web app only; preserve responsive desktop and mobile browser layouts, including mobile bottom navigation.
- English is default; support Somali translations and Amharic enablement with English fallback. Keep every school isolated, its identity and currency scoped to it, and follow the final decisions in the project brief and `PROGRESS.md`.
- Follow the requested security, Supabase-only storage, school rules, screen completeness, translation, data safety, and final test requirements in the owner's project brief. Do not use fake or static data or claim unsupported functionality.
