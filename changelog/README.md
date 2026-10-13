# Changelog workflow

Only entries in `src/data/changelog.json` are shown to players. It starts empty. Drafts and source metadata are never imported into the app or copied into its public assets.

## Generate

`npm run build` automatically generates a draft from Git commits and changed feature files. You can also run `npm run changelog:draft` directly. It uses local Git information, requires no credentials or external service, and preserves existing drafts instead of overwriting edits.

Draft wording is a starting point generated from commit subjects and affected features, not an AI-written account of every code change. Review it for accuracy and rewrite the title, summary, and changes in language players will understand. The draft's `source` block shows the commits and filenames used to prepare it.

## Approve

1. Open the file named in the generation output under `changelog/drafts/`.
2. Edit `date`, `title`, `summary`, and `changes`. Leave `id` and `source` intact.
3. Run `npm run changelog:approve -- update-<id>.json` with its actual filename.

That command is the approval: it adds only the player-facing fields to the published data. The local Vite app updates immediately. Production receives the approved entry with the next deployment; approval never deploys on its own.

Approve one draft covering a release, then generate a fresh draft for later work. Ideally commit feature changes before drafting, so the Git revision clearly defines the release boundary. Already approved sources are skipped, and stale drafts from before the last approval cannot be published accidentally.

You can also maintain `src/data/changelog.json` directly. Each entry has `id`, an ISO `date` (`YYYY-MM-DD`), `title`, `summary`, and a list of `changes`. Entries display newest first.
