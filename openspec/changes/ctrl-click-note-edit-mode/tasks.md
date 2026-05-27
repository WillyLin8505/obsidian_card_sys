## 1. Investigate Existing Note Navigation & Edit Mode

- [x] 1.1 Locate note card and list item components in the codebase
- [x] 1.2 Identify the existing click handler and navigation logic for opening a note
- [x] 1.3 Determine how edit mode is currently activated on the note detail page (state, route param, etc.)

## 2. Support Edit Mode via Route/Navigation

- [x] 2.1 Add support for `?mode=edit` query parameter (or equivalent) on the note detail page
- [x] 2.2 On mount, if `mode=edit` is present, activate edit mode automatically

## 3. Add Ctrl+Click Handler to Note Components

- [x] 3.1 Update note card component click handler to check `event.ctrlKey || event.metaKey`
- [x] 3.2 On Ctrl/Meta+Click: call `event.preventDefault()` and `event.stopPropagation()`, then navigate to note in edit mode
- [x] 3.3 Update note list item component with the same Ctrl+Click logic
- [x] 3.4 Apply the same handler to any other note-clickable views (search results, card grid, etc.)

## 4. Add Hover Tooltip

- [x] 4.1 Add a tooltip to note card/list item components that shows "Ctrl+Click to edit" on hover

## 5. Verification

- [x] 5.1 Verify Ctrl+Click on a note card opens it in edit mode
- [x] 5.2 Verify ⌘+Click works on macOS
- [x] 5.3 Verify plain click still opens note in default view/preview mode
- [x] 5.4 Verify no new browser tab is opened on Ctrl+Click
- [x] 5.5 Verify behavior works in list view, card grid view, and search results
- [x] 5.6 Verify tooltip appears on hover
