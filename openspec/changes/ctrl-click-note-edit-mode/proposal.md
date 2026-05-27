## Why

Currently, clicking a note navigates to or previews it, requiring extra steps to enter edit mode. A Ctrl+Click shortcut gives power users a faster, mouse-driven way to jump directly into editing without leaving the keyboard-mouse flow.

## What Changes

- Detect Ctrl+Click events on note cards/items throughout the app
- When Ctrl+Click is detected on a note, navigate directly to that note in edit mode instead of the default view/preview mode

## Capabilities

### New Capabilities

- `ctrl-click-note-edit`: Intercept Ctrl+Click on note elements and open them in edit mode directly.

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- **Note card / list item components**: Add Ctrl+Click event handler
- **Routing / navigation logic**: Support an `?mode=edit` param or equivalent to open notes in edit mode
- **No breaking changes**: Normal click behavior is unchanged
