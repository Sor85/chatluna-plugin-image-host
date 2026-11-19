# Agent Note: Image host plugin

Status: implemented

## Problem

A ChatLuna v2 plugin is needed to upload and categorize images in a WebUI sidebar page, let the bot use them through a visible, editable prompt, send a random image with `/category` and a specific one with `/category/file`, deduplicate images within a category, and avoid repeats when sending at random.

## Decision

- Disk is the source of truth: `images/<category>/<file>`; `meta.json` only keeps descriptions, visibility, the prompt template and a hash cache (`ImageLibrary` in `src/library.ts`). Mutations run serially, then atomically write the metadata and refresh the `image-host.library` state.
- No custom reply element: the bot sends local images with v2's built-in `<img src>`. `src/prompt.ts` registers a context-zone prompt block `image-host` on every agent at `chatluna/agent-open` (agents already open are covered through `ctx.agents.list()`). In the template, `{dir}` expands to the image root folder and `{categories}` to the visible categories and file names; it renders every turn, is resent only on change, and injects nothing when empty. The default template only gives the image folder and list, without teaching `<img>` usage, since v2 already injects its built-in element instructions. The template is edited and previewed in the sidebar page.
- Commands use a prepended middleware (`src/commands.ts`) on the raw text, because categories change at runtime and may contain `.`, so they cannot be Koishi commands. Unknown categories or names of registered commands fall through.
- Deduplication is by SHA-256 within one category: uploads skip duplicates, cross-category moves refuse them, `dedupe()` removes existing ones. Random picks use one shuffle bag per category: no repeats within a round and no back-to-back repeat across rounds.
- The page (`client/`) registers `/image-host/:category?` via `ctx.slots.route`; uploads are Base64 actions batched by the client; previews use `/image-host/files/:category/:file`, outside `/api` and guarded by the login cookie.
- `package.json` must not list `koishi` in `peerDependencies`; otherwise the host wraps the plugin as a legacy Koishi plugin and `ctx.server` becomes a Koa facade.

## Alternatives considered

- A database table for the index: another state to keep in sync with the disk, and copying files into folders gets harder.
- One Koishi command per category: `/` and `.` split into subcommands, and categories would need re-registration.
- An LLM tool for sending: one extra tool round trip per image; `<img>` sits inline in the message.
- A custom `<image-host>` reply element: hides disk paths and lets the plugin pick at random, but duplicates the built-in `<img>`; adding expressions was ruled out.

## Consequences

- Shuffle bags live in memory and restart after a host restart; only commands use them, the bot picks from the files listed in the prompt.
- The prompt contains absolute image paths; reading them needs `fs:read`, and image files are exempt from the outside-workspace check.
- The same image may exist in several categories.
- The sandbox script `scripts/verify-sandbox.mjs` needs a bot-visible category with three images of different sizes.
