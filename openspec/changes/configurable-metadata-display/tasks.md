## 1. Data Model & Storage

- [ ] 1.1 Define `MetadataDisplayPrefs` TypeScript type with fields array (id, visible, order)
- [ ] 1.2 Define the canonical list of available metadata field IDs (e.g., `tags`, `created-date`, `modified-date`, `author`, `status`)
- [ ] 1.3 Implement `loadMetadataPrefs()` — reads from localStorage, returns defaults if missing or unavailable
- [ ] 1.4 Implement `saveMetadataPrefs()` — writes to localStorage, silently catches storage errors

## 2. React Context

- [ ] 2.1 Create `MetadataDisplayContext` with current prefs and setter
- [ ] 2.2 Create `MetadataDisplayProvider` that initializes from `loadMetadataPrefs()` and persists on change
- [ ] 2.3 Wrap app root (or layout) with `MetadataDisplayProvider`

## 3. Settings UI

- [ ] 3.1 Add "Metadata Display" section to the Settings page
- [ ] 3.2 Render a list of metadata field rows, each with a toggle (visible/hidden)
- [ ] 3.3 Add drag handles and implement drag-and-drop reordering
- [ ] 3.4 Add keyboard up/down buttons as accessible alternative to drag-and-drop
- [ ] 3.5 Wire toggle and reorder actions to update context and persist preferences

## 4. Apply Preferences to File Views

- [ ] 4.1 Update file detail view to read from `MetadataDisplayContext` — render only visible fields in user-defined order
- [ ] 4.2 Update file list/table view to read from `MetadataDisplayContext` — show only visible fields as columns in user-defined order

## 5. Verification

- [ ] 5.1 Verify toggling a field off removes it from both file detail and list views
- [ ] 5.2 Verify reordering is reflected in both views
- [ ] 5.3 Verify preferences persist after page reload
- [ ] 5.4 Verify graceful fallback when localStorage is unavailable
- [ ] 5.5 Verify keyboard reordering works correctly
