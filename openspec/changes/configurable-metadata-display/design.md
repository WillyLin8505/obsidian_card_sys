## Context

The app currently renders a fixed set of metadata fields for every file (e.g., tags, created date, modified date, author, status). Users have no control over which fields appear. As the number of metadata fields grows, the UI becomes cluttered. This design introduces a settings-driven approach where users can choose which metadata fields to show and in what order.

## Goals / Non-Goals

**Goals:**
- Provide a Settings UI section for toggling metadata field visibility
- Allow reordering of metadata fields via drag-and-drop
- Persist preferences (localStorage or user profile)
- Apply preferences consistently across all file views

**Non-Goals:**
- Per-file metadata customization (global preference only)
- Adding or removing metadata field definitions (only visibility control)
- Server-side persistence (localStorage is sufficient for v1)

## Decisions

### Decision 1: Store preferences in localStorage

**Choice**: `localStorage` with a JSON key `metadata-display-prefs`

**Rationale**: No backend changes needed, instant persistence, works offline. User preferences are UI-level concerns; server sync can be added later.

**Alternatives considered**:
- User profile in DB: More complex, requires API changes, overkill for v1
- URL params: Not persistent, poor UX

### Decision 2: Preference shape

```ts
type MetadataDisplayPrefs = {
  fields: Array<{
    id: string       // e.g. "tags", "created-date", "author"
    visible: boolean
    order: number
  }>
}
```

**Rationale**: Simple flat array with explicit order. Easy to sort and render. Adding new fields in future just appends with a default `visible: true`.

### Decision 3: Settings UI — toggle + drag-and-drop list

**Choice**: A list of toggleable rows in Settings, with drag handles for reordering.

**Rationale**: Familiar pattern (similar to mobile notification settings). Provides clear visual feedback of current state.

**Alternatives considered**:
- Checkbox table: Less intuitive for reordering
- Separate order and visibility pages: Unnecessary complexity

### Decision 4: Apply preferences via React context

**Choice**: Wrap the app with a `MetadataDisplayContext` that exposes the current field preferences. File view components read from context to determine which fields to render and in what order.

**Rationale**: Avoids prop-drilling. Preferences change infrequently; context re-renders are acceptable.

## Risks / Trade-offs

- **localStorage unavailable** (private browsing, storage full) → Fall back to default field order/visibility; show no error to user
- **New metadata fields added in future** → Default them to `visible: true`, append to end of order; existing prefs remain valid
- **Drag-and-drop accessibility** → Provide keyboard alternatives (up/down buttons) alongside drag handles

## Migration Plan

1. Deploy settings UI and context provider
2. On first load, if no `metadata-display-prefs` key exists, initialize with all fields visible in default order
3. No rollback needed — removing the feature just falls back to rendering all fields (safe default)

## Open Questions

- Should reorder affect the metadata display in file list (table view) as well as file detail view? *(Assume yes for now)*
- What is the canonical list of available metadata fields? *(To be defined in specs)*
