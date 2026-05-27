## ADDED Requirements

### Requirement: Ctrl+Click on a note opens it in edit mode
The system SHALL detect when the user holds Ctrl (or ⌘ on macOS) and clicks on a note card or list item, and SHALL navigate to that note in edit mode instead of the default view/preview mode.

#### Scenario: Ctrl+Click on note card enters edit mode
- **WHEN** the user holds Ctrl and clicks on a note card
- **THEN** the app SHALL navigate to that note with edit mode active

#### Scenario: Meta+Click (macOS) on note card enters edit mode
- **WHEN** the user holds ⌘ (Meta key) and clicks on a note card on macOS
- **THEN** the app SHALL navigate to that note with edit mode active

#### Scenario: Plain click preserves default behavior
- **WHEN** the user clicks a note card without holding Ctrl or ⌘
- **THEN** the app SHALL open the note in its default view/preview mode (unchanged behavior)

### Requirement: Browser default Ctrl+Click behavior is suppressed
The system SHALL prevent the browser's default Ctrl+Click behavior (e.g., opening a new tab) when the user Ctrl+Clicks a note.

#### Scenario: No new tab opened on Ctrl+Click
- **WHEN** the user holds Ctrl and clicks on a note card that is rendered as an anchor element
- **THEN** the browser SHALL NOT open a new tab, and the app SHALL handle the navigation internally

### Requirement: Ctrl+Click works across all note list and card views
The system SHALL apply Ctrl+Click-to-edit behavior consistently in every view that displays clickable note elements (e.g., note list, card grid, search results).

#### Scenario: Ctrl+Click works in note list view
- **WHEN** the user Ctrl+Clicks a note in the list view
- **THEN** the note SHALL open in edit mode

#### Scenario: Ctrl+Click works in card grid view
- **WHEN** the user Ctrl+Clicks a note card in the grid/card view
- **THEN** the note SHALL open in edit mode

### Requirement: Hover tooltip hints at Ctrl+Click shortcut
The system SHALL display a tooltip on note cards/items indicating that Ctrl+Click opens the note in edit mode, to aid discoverability.

#### Scenario: Tooltip shown on hover
- **WHEN** the user hovers over a note card or list item
- **THEN** a tooltip SHALL appear indicating "Ctrl+Click to edit" (or equivalent localized text)
