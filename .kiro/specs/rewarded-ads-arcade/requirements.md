# Requirements Document

## Introduction

The Rewarded Ads system is a monetization module for the Attend75 arcade. It gives players a voluntary option to watch a short rewarded advertisement after losing a game in order to continue their run — keeping lives, score, or progress intact. The system is designed as a reusable, provider-agnostic layer so every current and future arcade game can adopt it without duplicating ad logic. A mock provider is included so development and testing work independently of any real ad network. Analytics events are emitted at every meaningful step of the ad lifecycle so the team can measure engagement and optimize the experience over time.

## Glossary

- **AdManager**: The central singleton module responsible for orchestrating ad requests, provider delegation, and analytics emission.
- **AdProvider**: An interface (contract) that every concrete ad-network implementation must satisfy.
- **MockProvider**: A built-in AdProvider implementation that simulates ad loading and playback deterministically, used in development and testing.
- **RewardedAd**: A specific ad unit type where a reward is conditionally granted only after the user voluntarily watches the full advertisement.
- **Reward**: The in-game benefit granted upon successful ad completion (e.g., an extra life, a continue token, score preservation).
- **AdEvent**: A structured analytics event emitted by the AdManager at each lifecycle stage.
- **Analytics**: The subsystem that receives and forwards AdEvents to backend or third-party tracking.
- **GameOverOverlay**: The UI component rendered inside GameLayout when a game ends, which may present the Continue option.
- **GameLayout**: The existing shared wrapper component (`src/components/arcade/GameLayout.jsx`) used by all arcade games.
- **GameBridge**: The postMessage-based communication protocol between iframe-based games and the React shell.
- **Provider**: A concrete implementation of AdProvider for a specific ad network (e.g., Google AdMob, mock).
- **Continue Flow**: The sequence: player dies → game-over overlay shown → player taps "Continue (Watch Ad)" → ad loads and plays → reward granted → game resumes.

---

## Requirements

### Requirement 1: Reusable Ad Module Architecture

**User Story:** As a developer, I want a single, self-contained ad module that any arcade game can import, so that I never need to duplicate ad logic when adding new games.

#### Acceptance Criteria

1. THE AdManager SHALL expose a stable public API that games consume without importing any provider-specific code.
2. THE AdManager SHALL delegate all ad network operations to the active AdProvider through a defined interface.
3. WHEN a new AdProvider implementation is registered, THE AdManager SHALL use it for all subsequent ad requests without changes to game code.
4. THE AdManager SHALL be importable as a singleton from a single module path (e.g., `src/ads/AdManager`).
5. THE Ad Module SHALL be organized into the following directory structure: `src/ads/` containing `AdManager`, `RewardedAd`, `Analytics`, `providers/MockProvider`, `providers/index`, and `types`.

### Requirement 2: Provider Interface Contract

**User Story:** As a developer, I want a clear interface that all ad providers must implement, so that switching or adding ad networks requires only a new provider file.

#### Acceptance Criteria

1. THE Ad Module SHALL define an AdProvider interface specifying at minimum: `load(adUnitId: string): Promise<void>`, `show(): Promise<AdResult>`, and `isReady(): boolean`.
2. WHEN a provider's `load` method is called, THE Provider SHALL prepare the ad unit for display without showing it to the user.
3. WHEN a provider's `show` method is called, THE Provider SHALL display the ad and resolve with an AdResult indicating completion, skip, or failure.
4. IF a provider's `show` method is called before `load` has completed successfully, THEN THE Provider SHALL resolve with an AdResult of type `not_ready`.
5. THE Ad Module SHALL define an AdResult type with the following outcome variants: `completed`, `skipped`, `failed`, `not_ready`.

### Requirement 3: MockProvider for Development and Testing

**User Story:** As a developer, I want a mock ad provider that simulates realistic ad behavior, so that I can build and test the full rewarded-ad flow without a live ad network.

#### Acceptance Criteria

1. THE MockProvider SHALL implement the AdProvider interface in full.
2. WHEN `load` is called on the MockProvider, THE MockProvider SHALL resolve after a configurable simulated delay (default: 500 ms).
3. WHEN `show` is called on the MockProvider with the default configuration, THE MockProvider SHALL resolve with outcome `completed` after a configurable simulated viewing duration (default: 3000 ms).
4. WHERE the MockProvider is configured with `forceOutcome: 'skipped'`, THE MockProvider SHALL resolve with outcome `skipped`.
5. WHERE the MockProvider is configured with `forceOutcome: 'failed'`, THE MockProvider SHALL resolve with outcome `failed`.
6. THE MockProvider SHALL emit the same AdEvents that a real provider would emit, so that analytics can be validated in tests.

### Requirement 4: Rewarded Ad Lifecycle

**User Story:** As a player, I want the "Continue" option to work reliably, so that my reward is only granted when I have actually watched the full advertisement.

#### Acceptance Criteria

1. WHEN a rewarded ad request is initiated, THE AdManager SHALL emit an `ad_requested` event before calling the provider's `load` method.
2. WHEN the provider resolves `load` successfully, THE AdManager SHALL emit an `ad_loaded` event.
3. IF the provider rejects `load`, THEN THE AdManager SHALL emit an `ad_failed` event with the error reason.
4. WHEN the provider begins displaying the ad, THE AdManager SHALL emit an `ad_started` event.
5. WHEN the provider resolves `show` with outcome `completed`, THE AdManager SHALL emit `ad_completed` and then `reward_granted` events, and SHALL return an AdResult with outcome `completed`.
6. WHEN the provider resolves `show` with outcome `skipped`, THE AdManager SHALL emit `ad_completed` and then `reward_declined` events, and SHALL return an AdResult with outcome `skipped`.
7. IF the provider resolves `show` with outcome `failed` or `not_ready`, THEN THE AdManager SHALL emit `ad_failed` and SHALL return an AdResult with the corresponding outcome.
8. THE AdManager SHALL never grant a reward unless the provider returns outcome `completed`.

### Requirement 5: Voluntary Continue Flow in GameOverOverlay

**User Story:** As a player, I want the option to watch an ad to continue my game after dying, so that I can recover from a difficult run without feeling forced.

#### Acceptance Criteria

1. WHEN the GameOverOverlay is displayed, THE GameOverOverlay SHALL present a "Continue (Watch Ad)" button alongside the existing "Play Again" button.
2. THE GameOverOverlay SHALL clearly communicate the reward that will be granted (e.g., "Continue your run — watch a short ad").
3. WHEN the player taps "Continue (Watch Ad)", THE GameOverOverlay SHALL display a loading indicator until the ad is ready.
4. IF the ad fails to load within 8 seconds, THEN THE GameOverOverlay SHALL hide the loading indicator and display an error message stating the ad is unavailable, without removing the "Play Again" option.
5. WHEN the player taps "Continue (Watch Ad)", THE AdManager SHALL emit a `reward_offered` event.
6. WHEN the player taps "Continue (Watch Ad)" and the ad loads successfully, THE AdManager SHALL emit a `reward_accepted` event before showing the ad.
7. WHEN the ad completes and the reward is granted, THE GameOverOverlay SHALL close and THE GameLayout SHALL invoke a `onContinue` callback to resume the game.
8. THE GameOverOverlay SHALL allow the player to dismiss the ad offer at any time before the ad starts without penalty.

### Requirement 6: Game Independence from Ad Logic

**User Story:** As a developer integrating a new game, I want ad logic to live entirely outside the game component, so that my game code does not reference any ad APIs.

#### Acceptance Criteria

1. THE GameLayout SHALL be the sole component responsible for requesting and orchestrating the rewarded ad flow on behalf of any game.
2. WHEN a game component calls `onGameEnd`, THE GameLayout SHALL determine whether the Continue option is available and manage the AdManager interaction.
3. THE game component contract (props: `onGameEnd`, `onScoreUpdate`, `onRestart`, `isActive`) SHALL remain unchanged for games that do not opt into the Continue feature.
4. WHERE a game opts into the Continue feature, THE GameLayout SHALL accept a `supportsRewarded` boolean prop (default: `false`) to enable the "Continue (Watch Ad)" button.
5. WHEN `supportsRewarded` is `false`, THE GameOverOverlay SHALL not display any ad-related UI elements.

### Requirement 7: Analytics Event Emission

**User Story:** As a product owner, I want every significant monetization event to be captured, so that I can measure engagement and optimize the ad experience.

#### Acceptance Criteria

1. THE Analytics module SHALL accept AdEvents and forward them to a configurable backend endpoint via HTTP POST.
2. THE Analytics module SHALL support batching events and flushing them at a configurable interval (default: 5 seconds) or when the batch reaches a configurable size (default: 10 events).
3. IF an analytics POST request fails, THEN THE Analytics module SHALL retain the events in a local queue and retry on the next flush cycle.
4. THE Analytics module SHALL emit the following event types: `ad_requested`, `ad_loaded`, `ad_failed`, `ad_started`, `ad_completed`, `reward_offered`, `reward_accepted`, `reward_granted`, `reward_declined`.
5. WHEN an AdEvent is emitted, THE AdEvent SHALL include: `eventType`, `gameSlug`, `adUnitId`, `timestamp` (ISO 8601), and `sessionId`.
6. THE Analytics module SHALL be independently replaceable without affecting the AdManager or provider logic.

### Requirement 8: Testability and Mock Behavior Validation

**User Story:** As a developer, I want to be able to run the complete rewarded-ad flow in a test environment without any real ad network dependency, so that CI pipelines pass and development is frictionless.

#### Acceptance Criteria

1. THE AdManager SHALL accept a provider via dependency injection at initialization time so tests can supply the MockProvider directly.
2. WHEN the MockProvider is active, THE entire Continue Flow SHALL complete — including all analytics events — without any network requests to ad networks.
3. THE MockProvider SHALL expose a `getEventLog(): AdEvent[]` method that returns all events emitted during a test session, enabling assertion-based testing.
4. THE AdManager SHALL expose an `isProviderReady(): boolean` method so tests can assert provider state without triggering side effects.
5. FOR ALL valid combinations of MockProvider `forceOutcome` values (`completed`, `skipped`, `failed`), the Analytics module SHALL record exactly the events prescribed in Requirement 4 for that outcome.

### Requirement 9: Ad Frequency and User Experience Guardrails

**User Story:** As a player, I want ads to feel fair and infrequent enough that they do not disrupt my enjoyment of the arcade.

#### Acceptance Criteria

1. THE AdManager SHALL enforce a minimum interval of 120 seconds between consecutive rewarded ad shows for a given game session.
2. WHEN the minimum interval has not elapsed since the last rewarded ad, THE GameOverOverlay SHALL hide the "Continue (Watch Ad)" button and SHALL display only the standard "Play Again" option.
3. THE AdManager SHALL limit rewarded ad shows to a maximum of 3 per game session per game.
4. WHEN the session maximum has been reached, THE GameOverOverlay SHALL hide the "Continue (Watch Ad)" button for the remainder of that game session.
5. THE GameOverOverlay SHALL never display any ad-related UI until the AdManager confirms that a rewarded ad is available via `isReady()`.
