## Why

Users need the ability to control which metadata fields (e.g., tags, dates, author, status) are visible across all files in the app. Currently metadata display is fixed, forcing users to see fields they don't need and hide ones they want — reducing focus and usability.

## What Changes

- Add a Settings page section for metadata display preferences
- Allow users to toggle visibility of each available metadata field globally
- Allow users to reorder metadata fields via drag-and-drop
- Persist these preferences and apply them consistently across all file views

## Capabilities

### New Capabilities

- `metadata-display-settings`: A settings UI where users can select, toggle, and reorder which metadata fields appear across all files.

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- **Settings page**: New "Metadata Display" section added
- **File view components**: Render metadata dynamically based on user preferences
- **Persistence**: User preferences stored in local storage or user profile
- **No breaking changes**: All metadata fields remain available; display is preference-driven
