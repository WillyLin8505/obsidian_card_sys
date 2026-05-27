## ADDED Requirements

### Requirement: User can toggle metadata field visibility
The system SHALL provide a settings UI where users can toggle the visibility of each metadata field (e.g., tags, created date, modified date, author, status) globally across all files.

#### Scenario: User disables a metadata field
- **WHEN** the user navigates to Settings > Metadata Display and toggles a field off
- **THEN** that field SHALL no longer appear in any file view

#### Scenario: User enables a previously disabled field
- **WHEN** the user toggles a previously disabled field back on
- **THEN** that field SHALL reappear in all file views immediately

#### Scenario: Default state on first load
- **WHEN** no metadata display preferences exist in storage
- **THEN** all metadata fields SHALL be visible with their default order

### Requirement: User can reorder metadata fields
The system SHALL allow users to reorder metadata fields via drag-and-drop in the Settings UI, and the new order SHALL be reflected across all file views.

#### Scenario: User reorders metadata fields via drag-and-drop
- **WHEN** the user drags a metadata field row to a new position in Settings
- **THEN** the field order SHALL update immediately in the Settings list and across all file views

#### Scenario: User reorders via keyboard controls
- **WHEN** the user uses up/down keyboard controls on a metadata field row
- **THEN** the field SHALL move one position in the specified direction

### Requirement: Preferences are persisted across sessions
The system SHALL persist metadata display preferences in localStorage so they survive page reloads and browser restarts.

#### Scenario: Preferences survive page reload
- **WHEN** the user sets their metadata preferences and reloads the page
- **THEN** the same visibility and order settings SHALL be restored

#### Scenario: Storage unavailable fallback
- **WHEN** localStorage is unavailable (e.g., private browsing or storage full)
- **THEN** the system SHALL display all metadata fields in default order without showing an error

### Requirement: Preferences apply consistently across all file views
The system SHALL apply the user's metadata display preferences to all file views, including file detail view and file list/table view.

#### Scenario: Hidden field absent from file detail view
- **WHEN** a metadata field is toggled off
- **THEN** it SHALL NOT appear in the file detail view

#### Scenario: Hidden field absent from file list view
- **WHEN** a metadata field is toggled off
- **THEN** it SHALL NOT appear as a column or display element in the file list/table view

#### Scenario: Field order matches user preference in all views
- **WHEN** the user sets a custom field order
- **THEN** metadata fields SHALL render in that order in both file detail and file list views
