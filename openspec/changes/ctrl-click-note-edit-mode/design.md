## Context

Note cards/list items currently handle a single click to open a note in view/preview mode. There is no shortcut to jump directly into edit mode. This change adds Ctrl+Click as a modifier-key shortcut to open notes directly in edit mode, targeting users who frequently edit notes from the list.

## Goals / Non-Goals

**Goals:**
- Detect Ctrl+Click on note elements and route to edit mode
- Preserve existing single-click behavior (view/preview)
- Work consistently across all note list and card views in the app

**Non-Goals:**
- Changing keyboard-only navigation (that's a separate concern)
- Adding right-click context menus for edit mode
- Supporting other modifier keys (Shift+Click, Alt+Click)
- Mobile/touch support (Ctrl+Click is a desktop interaction)

## Decisions

### Decision 1: Handle the modifier key check in the click event handler

**Choice**: In each note clickable component, check `event.ctrlKey` (and `event.metaKey` for Mac ⌘) in the `onClick` handler. If true, navigate to edit mode; otherwise, perform the default action.

**Rationale**: The simplest approach — no new abstractions needed. Co-locates the logic with the existing click handler. `metaKey` covers Mac users who use ⌘+Click naturally.

**Alternatives considered**:
- Global event listener on `document`: Harder to maintain, risks interfering with browser/OS shortcuts
- Custom hook `useCtrlClick(ref, callback)`: Worth considering if the pattern spreads to many components, but premature for now

### Decision 2: Navigate to edit mode via route param

**Choice**: Navigate to the note route with an `?mode=edit` query parameter (or equivalent flag the note page already supports or will support). The note detail page reads this param on mount and activates edit mode.

**Rationale**: Clean separation — the note list/card doesn't need to know internal edit state; it just signals intent via the URL. Deep-linkable and testable.

**Alternatives considered**:
- Global state (e.g., Zustand/Context): Couples list and detail; state may linger across navigations
- Separate `/notes/:id/edit` route: Valid, but requires more routing changes; query param is lighter

### Decision 3: `event.preventDefault()` + `event.stopPropagation()` on Ctrl+Click

**Choice**: Call both when handling Ctrl+Click to prevent browser default behavior (e.g., opening a new tab on `<a>` tags) and stop event bubbling.

**Rationale**: Ctrl+Click on anchor elements opens a new tab in most browsers. We must intercept this explicitly.

## Risks / Trade-offs

- **macOS ⌘+Click vs Ctrl+Click**: macOS users may expect ⌘+Click. → Check both `event.ctrlKey` and `event.metaKey`
- **Browser Ctrl+Click default (new tab on links)**: → `event.preventDefault()` must be called before navigation
- **Discoverability**: Users won't know about the shortcut without a tooltip or docs → Add a tooltip hint on hover (e.g., "Ctrl+Click to edit")

## Migration Plan

1. Update note card/list item click handlers to check for Ctrl/Meta key
2. Ensure note detail page supports `?mode=edit` query param to activate edit mode on mount
3. No data migrations needed; purely UI behavior change
4. Rollback: revert click handler changes; no side effects

## Open Questions

- Does the note detail page already have an edit mode toggle? If so, what is the existing mechanism to activate it programmatically? *(Needs codebase check before implementation)*
- Should the tooltip hint be added immediately or in a follow-up? *(Recommend immediately for discoverability)*
