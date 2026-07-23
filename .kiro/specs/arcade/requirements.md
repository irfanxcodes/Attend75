# Requirements Document

## Introduction

The Arcade feature adds a new section to the Attend75 web application where students can play quick browser-based mini games (30–60 seconds) while checking their attendance. The goal is to increase user engagement, retention, and daily active users. The Arcade integrates open-source HTML5/JavaScript game engines (MIT, Apache 2.0, or BSD licensed) restyled to match Attend75's design language, with per-game leaderboards and a pluggable architecture that makes adding new games minimal effort.

## Glossary

- **Arcade_Module**: The top-level frontend section containing game selection, game play, and leaderboard views, accessible via the main navigation.
- **Game_Engine**: An open-source HTML5/JavaScript game implementation (permissive license) that provides core gameplay logic, stripped of external branding and wrapped as a React component.
- **Leaderboard_Service**: The backend service responsible for accepting score submissions, validating scores, and serving ranked player lists per game.
- **Game_Card**: A UI component displaying a game's thumbnail, title, description, personal high score, and a play button on the Arcade home screen.
- **Score_Submission**: A POST request from the frontend to the backend containing the player's score, game identifier, and session token after a game session ends.
- **Game_Score**: A database record storing a user's score for a specific game, including user_id, game_name, score value, and creation timestamp.
- **Dashboard_Banner**: An eye-catching promotional card rendered on the main Dashboard feed that links to the Arcade section.
- **Score_Validator**: Backend logic that rejects impossible scores, enforces rate limits, and prevents duplicate rapid submissions.

## Requirements

### Requirement 1: Arcade Navigation Entry

**User Story:** As a student, I want to access the Arcade from the main navigation, so that I can quickly find and play games without searching.

#### Acceptance Criteria

1. WHEN a user is authenticated, THE Arcade_Module SHALL display an "Arcade" item in the application's main navigation bar for all authenticated users regardless of subscription status, user role, or feature flags.
2. WHEN the user taps the Arcade navigation item, THE Arcade_Module SHALL navigate to the `/app/arcade` route and display the Arcade home screen.
3. THE Arcade_Module SHALL render the navigation item with an icon and label consistent with the existing Attend75 navigation style.

### Requirement 2: Dashboard Quick Access Banner

**User Story:** As a student, I want to see a banner on my Dashboard promoting the Arcade, so that I discover the feature and can jump into a game in one tap.

#### Acceptance Criteria

1. WHEN the Dashboard page loads, THE Dashboard_Banner SHALL render an eye-catching card in the main feed that links to the Arcade home screen.
2. WHEN the user taps the Dashboard_Banner, THE Arcade_Module SHALL navigate the user to the `/app/arcade` route.
3. THE Dashboard_Banner SHALL display a brief tagline, a visual illustration or icon, and a call-to-action button styled consistently with Attend75's card design system.

### Requirement 3: Arcade Home Screen

**User Story:** As a student, I want to browse available games on the Arcade home screen, so that I can choose which game to play.

#### Acceptance Criteria

1. THE Arcade_Module SHALL display a grid or list of Game_Card components on the Arcade home screen at `/app/arcade`.
2. WHEN a Game_Card is rendered, THE Game_Card SHALL display the game's thumbnail image, title, short description, the user's personal high score (or "No score yet"), and a "Play" button. These elements SHALL only render when the Game_Card container itself is rendered.
3. WHEN the user taps a Game_Card's "Play" button, THE Arcade_Module SHALL navigate to the game's dedicated route (e.g., `/app/arcade/flappy`).
4. THE Arcade_Module SHALL support responsive layout with mobile-first design, dark mode, and smooth card animations consistent with Attend75's design system.

### Requirement 4: Game Integration Architecture

**User Story:** As a developer, I want a pluggable game architecture, so that I can add new games with minimal effort.

#### Acceptance Criteria

1. THE Arcade_Module SHALL load each game as an independent React component that encapsulates the Game_Engine logic and renders inside a shared game layout wrapper.
2. THE Arcade_Module SHALL provide a shared GameLayout component that handles common UI elements including a back button, game title header, and score display area.
3. WHEN a new game is added, THE Arcade_Module SHALL require only a new React component file and a game registry entry to integrate the game into the Arcade home screen, routing, and leaderboard system.
4. THE Game_Engine SHALL run entirely client-side within the Attend75 application without opening external websites or requiring external network requests during gameplay.

### Requirement 5: Open-Source Game Integration Standards

**User Story:** As a developer, I want clear standards for integrating open-source games, so that the final result feels native to Attend75.

#### Acceptance Criteria

1. THE Game_Engine SHALL be sourced from repositories with MIT, Apache 2.0, or BSD licenses only.
2. WHEN integrating a Game_Engine, THE Arcade_Module SHALL remove all external branding, advertisements, analytics scripts, and unrelated UI elements from the source.
3. WHEN integrating a Game_Engine, THE Arcade_Module SHALL restyle the game visuals (colors, typography, spacing) to match Attend75's design system.
4. THE Game_Engine SHALL report the final score to the parent React component via a callback function when a game session ends.
5. THE Game_Engine SHALL support restart functionality without requiring a full page reload.

### Requirement 6: Score Submission API

**User Story:** As a student, I want my game scores recorded after each game, so that I can track my progress and compete on leaderboards.

#### Acceptance Criteria

1. WHEN a game session ends, THE Arcade_Module SHALL submit a Score_Submission to `POST /api/arcade/{game}/score` containing the session token, game identifier, and numeric score value.
2. WHEN the Leaderboard_Service receives a valid Score_Submission, THE Leaderboard_Service SHALL persist a Game_Score record with the user_id, game_name, score, and created_at timestamp.
3. WHEN the Leaderboard_Service receives a Score_Submission, THE Leaderboard_Service SHALL return a response containing the submitted score, the user's all-time personal best for that game, and the user's current rank on the leaderboard.
4. IF the Score_Submission contains an invalid or expired session token, THEN THE Leaderboard_Service SHALL return an HTTP 401 response with an error message.

### Requirement 7: Score Validation and Anti-Cheat

**User Story:** As a platform operator, I want basic score validation, so that the leaderboard remains fair and meaningful.

#### Acceptance Criteria

1. WHEN the Leaderboard_Service receives a Score_Submission, THE Score_Validator SHALL reject scores that exceed a configured maximum threshold per game and return an HTTP 422 response. IF a submission violates both the maximum threshold and the duplicate timing rule, THEN the HTTP 422 (threshold exceeded) response SHALL take priority.
2. WHEN the Leaderboard_Service receives multiple Score_Submissions from the same user for the same game within 5 seconds, THE Score_Validator SHALL reject the duplicate submission and return an HTTP 429 response, unless the submission was already rejected by the threshold check.
3. THE Score_Validator SHALL enforce a rate limit of a maximum of 60 score submissions per user per game per hour, returning an HTTP 429 response when exceeded.
4. THE Score_Validator SHALL reject Score_Submissions with non-positive score values and return an HTTP 422 response.

### Requirement 8: Leaderboard Retrieval API

**User Story:** As a student, I want to see the top players for each game, so that I can compete and measure my standing.

#### Acceptance Criteria

1. WHEN a `GET /api/arcade/{game}/leaderboard` request is received, THE Leaderboard_Service SHALL return the top 50 players ranked by highest score for the specified game.
2. THE Leaderboard_Service SHALL include for each leaderboard entry: rank position, username (display name), and highest score.
3. WHEN a valid session token is provided as a query parameter and the request results in a successful response, THE Leaderboard_Service SHALL additionally include the requesting user's rank and highest score in the response, even if the user is not in the top 50. User info SHALL NOT be included in error responses.
4. IF the specified game identifier does not match any registered game, THEN THE Leaderboard_Service SHALL always return an HTTP 404 response with an error message.

### Requirement 9: Leaderboard UI

**User Story:** As a student, I want to view a leaderboard for each game, so that I know where I stand among other players.

#### Acceptance Criteria

1. THE Arcade_Module SHALL display a leaderboard view accessible from each game's page and from the Arcade home screen.
2. WHEN the leaderboard view loads, THE Arcade_Module SHALL display ranked entries showing position number, username, and score, styled consistently with Attend75's list and card patterns.
3. WHEN the current user has a score on the leaderboard, THE Arcade_Module SHALL highlight the user's entry with a distinct visual indicator (e.g., background color or border), whether displayed in the main list or in the pinned footer row.
4. IF the current user's rank is outside the displayed top entries, THEN THE Arcade_Module SHALL show the user's rank and score in a pinned footer row below the leaderboard list.

### Requirement 10: Game Score Database Model

**User Story:** As a developer, I want a well-structured database table for game scores, so that leaderboard queries are efficient and the schema supports future features.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL store Game_Score records in a `game_scores` table with columns: id (primary key), user_id (foreign key to users), game_name (string), score (integer), and created_at (timestamp with timezone).
2. THE Leaderboard_Service SHALL maintain an index on (game_name, score DESC) to support efficient leaderboard queries.
3. THE Leaderboard_Service SHALL maintain an index on (user_id, game_name) to support efficient personal best lookups.
4. THE Leaderboard_Service SHALL store every score submission (full history), enabling future features like weekly resets and score trends.

### Requirement 11: Performance and Loading

**User Story:** As a student, I want games to load quickly and play smoothly, so that I have a good experience even on slower devices.

#### Acceptance Criteria

1. THE Game_Engine SHALL run entirely client-side with zero server communication during active gameplay (only score submission occurs after game end).
2. THE Arcade_Module SHALL lazy-load each game component so that the Arcade home screen loads without downloading all game assets upfront.
3. WHEN the Arcade home screen loads, THE Arcade_Module SHOULD render the game list within 1 second on a standard 4G connection. IF loading takes longer, THE Arcade_Module SHALL still display the game list upon completion rather than failing or timing out.
4. THE Arcade_Module SHALL ensure game assets (sprites, sounds) total less than 500KB per game to maintain fast load times on mobile networks.

### Requirement 12: Responsive Design and Theming

**User Story:** As a student, I want the Arcade to look and feel like part of Attend75, so that the experience is cohesive regardless of my device or theme preference.

#### Acceptance Criteria

1. THE Arcade_Module SHALL render correctly on all viewport widths from 320px and above (including ultra-wide displays beyond 1920px) using a mobile-first responsive layout.
2. THE Arcade_Module SHALL support the application's dark mode theme, adjusting all Arcade UI elements (cards, backgrounds, text, borders) accordingly.
3. THE Arcade_Module SHALL use Attend75's existing color palette, typography scale, spacing system, and border radius conventions.
4. THE Game_Engine SHALL scale its canvas or play area to fit the available viewport width while maintaining correct aspect ratio.

### Requirement 13: Initial Game — Flappy Bird Clone

**User Story:** As a student, I want to play a Flappy Bird-style game in the Arcade, so that I have a fun, quick game available on launch day.

#### Acceptance Criteria

1. THE Arcade_Module SHALL include a Flappy Bird-style game accessible at `/app/arcade/flappy` as the initial launch game.
2. WHEN the user taps or clicks the screen, THE Game_Engine SHALL make the bird character jump, and the bird SHALL fall due to simulated gravity when no input is given.
3. WHEN the bird collides with a pipe obstacle, the ground, or exits the defined play area boundaries, THE Game_Engine SHALL end the game session and report the final score (number of pipes passed) to the Arcade_Module.
4. THE Game_Engine SHALL display the current score during gameplay and the final score on the game-over screen with a "Play Again" button.
5. WHEN the user taps "Play Again," THE Game_Engine SHALL reset the game state and begin a new session without a full page reload.

### Requirement 14: Routing Structure

**User Story:** As a developer, I want a clear routing structure for the Arcade, so that navigation is predictable and deep-linking works.

#### Acceptance Criteria

1. THE Arcade_Module SHALL register routes under the authenticated `/app` route prefix: `/app/arcade` for the home screen and `/app/arcade/{game_slug}` for individual games.
2. WHEN a user navigates directly to `/app/arcade/{game_slug}` via URL, THE Arcade_Module SHALL load and display the specified game if the game_slug matches a registered game.
3. IF a user navigates to `/app/arcade/{game_slug}` with an unregistered game_slug, THEN THE Arcade_Module SHALL redirect to `/app/arcade` and display the Arcade home screen.
4. THE Arcade_Module SHALL support browser back/forward navigation between the Arcade home screen and individual game pages without state loss.

### Requirement 15: Gameplay Quality

**User Story:** As a student, I want the game to feel smooth and responsive, so that I enjoy playing without lag, glitches, or inconsistent behavior across devices.

#### Acceptance Criteria

1. THE Game_Engine SHALL maintain smooth gameplay with a target frame rate of 60 FPS on supported devices and degrade gracefully on lower-performance devices. Graceful degradation MAY result in non-smooth gameplay as long as the game remains playable and functional.
2. THE Game_Engine SHALL calculate movement, gravity, and collision detection using delta time rather than frame count to ensure consistent gameplay across different refresh rates.
3. THE Game_Engine SHALL preload all required assets (sprites, sounds, fonts) before gameplay begins.
4. THE Game_Engine SHALL perform no network requests or blocking operations during active gameplay. WHEN the game is paused (e.g., due to focus loss), network requests ARE permitted during the paused state.
5. THE Game_Engine SHALL automatically pause when the browser tab or application loses focus and resume when focus returns.
6. THE Game_Engine SHALL process user input within the next animation frame after touch, click, or keyboard input.
7. THE Game_Engine SHALL preserve gameplay state during viewport resizing or device rotation while maintaining the correct aspect ratio.
8. THE Game_Engine SHALL clean up animation frames, timers, and event listeners whenever the game restarts or unmounts to prevent memory leaks.

### Requirement 16: Extensibility for Future Features

**User Story:** As a product owner, I want the Arcade architecture to support future engagement features, so that we can evolve the system without major rewrites.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL design the Game_Score schema to support future time-windowed queries (weekly resets, monthly tournaments) by storing individual timestamps per score.
2. THE Arcade_Module SHALL structure its frontend component hierarchy to accommodate future additions (achievement badges, daily challenges, XP counters) as sibling components within the shared GameLayout without modifying existing game components.
3. THE Leaderboard_Service API response format SHALL include a metadata field reserved for future extensions (e.g., tournament info, seasonal event context) without breaking existing clients.
