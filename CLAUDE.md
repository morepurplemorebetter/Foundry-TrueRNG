# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrueRNG is a Foundry VTT module that replaces the built-in random number generator with true random numbers from random.org. The module integrates with Foundry's dice system by hijacking `CONFIG.Dice.randomUniform` and provides a caching mechanism to reduce API calls.

## Development Commands

- `npm run build` - Compiles TypeScript source files to JavaScript in the `dist/` directory
- `tsc` - Direct TypeScript compilation (equivalent to build)

No test suite, linting, or other development scripts are configured.

## Architecture

### Core Components

- **TrueRNG.ts** - Main module class that manages random number generation, caching, API integration, and Foundry VTT hooks
- **RandomAPI.ts** - HTTP client for random.org's JSON-RPC API with error handling and quota tracking
- **JsonRPC.ts** - JSON-RPC request/response wrapper classes for API communication
- **interfaces.ts** - TypeScript interfaces defining random.org API parameters and response structures
- **BrowserConfig.ts** - LocalStorage utility for persisting API keys across sessions

### Key Integration Points

- Hooks into Foundry's `CONFIG.Dice.randomUniform` during the 'init' hook to replace the default RNG
- Registers module settings for API key, cache size, update threshold, debug mode, and quick toggle
- Creates a quick toggle button in the chat controls area for GMs
- Maintains backward compatibility by preserving the original random function as fallback

### Data Flow

1. Module initializes and replaces Foundry's RNG function
2. When dice are rolled, `TrueRNG.GetRandomNumber()` is called
3. If cache is empty or API key missing, falls back to `Math.random()`
4. Random numbers are fetched from random.org in batches and cached locally
5. Numbers are consumed from cache using timestamp-based indexing for unpredictability
6. Cache is automatically refilled when it drops below the configured threshold

### Module Configuration

The module registers several Foundry VTT settings:
- `APIKEY` - Random.org developer API key (world scope)
- `MAXCACHEDNUMBERS` - Number of random numbers to cache (world scope, 5-200 range)
- `UPDATEPOINT` - Percentage threshold for cache refill (world scope, 1-100 range)
- `ENABLED` - Module on/off toggle (world scope)
- `QUICKTOGGLE` - Show/hide quick toggle button (client scope)
- `DEBUG` - Enable debug console output (client scope)

## Build Output

The TypeScript compiler outputs to `dist/truerng.js` which is the main script file referenced in `module.json`.