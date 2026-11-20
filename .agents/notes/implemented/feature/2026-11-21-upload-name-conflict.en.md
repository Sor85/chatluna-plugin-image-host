# Agent Note: Ask to replace or skip uploads with existing names

Status: implemented

## Problem

When an uploaded image had the same file name as an existing image in the category, the upload silently appended `-1`, `-2`, so users could not replace an old image. The page should ask whether to replace or skip.

## Decision

- `image-host.image.upload` takes an optional `onConflict` (`UploadConflictMode` in `src/types.ts`), defaulting to `ask`: files whose name matches an image that existed before the request (with different content) are not written and come back in `UploadResult.conflicts` by their index in the request. The client still holds the original `File` objects and re-sends only those, so the server never stages upload content.
- `overwrite` writes to the existing file's path, keeping its file name and bot visibility, and only updates content, hash and mtime; the category's shuffle bag is reset and the replaced content no longer counts for deduplication. Results come back in `replaced`.
- Besides replace and skip there is "Keep both" (`rename`, the old numbering behaviour): browsers name every pasted image `image.png`, so with only replace or skip a second screenshot could never be added.
- Later files with the same name within one request are numbered rather than reported, so pasting several images at once does not ask about each other.
- The page asks once with `ConflictDialog` (`client/dialogs.tsx`) after all batches finish, and the choice applies to every conflicting file; closing the dialog means skip. The upload button stays disabled while asking, and a new upload reports that the previous one is still running.

## Alternatives considered

- Checking names on the client beforehand: the final extension is decided after the server sniffs the file header (a `.jpg` that is really PNG becomes `.png`), so the client cannot predict the final name reliably.
- Choosing per file: tedious with many conflicts; one choice for all covers the common case.
