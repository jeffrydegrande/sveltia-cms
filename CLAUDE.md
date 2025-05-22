# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sveltia CMS is a Git-based lightweight headless CMS developed as a modern replacement for Netlify CMS and Decap CMS. It's built with Svelte and focuses on improved UX, performance, and internationalization (i18n) support.

## Development Commands

### Installation

```bash
pnpm install
```

### Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Watch for changes and rebuild
pnpm build:watch

# Preview production build
pnpm preview
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test src/lib/services/utils/file.spec.js
```

### Code Quality

```bash
# Run all checks
pnpm check

# Specific checks
pnpm check:audit     # Audit dependencies
pnpm check:cspell    # Check spelling
pnpm check:svelte    # Check Svelte components
pnpm check:prettier  # Check formatting
pnpm check:eslint    # Check code quality
pnpm check:stylelint # Check CSS style

# Format code
pnpm format
```

## Architecture

### Project Structure

- `src/lib/` - Main source code
  - `assets/` - Static assets like logos
  - `components/` - Svelte components organized by feature
  - `locales/` - Internationalization files
  - `services/` - Core business logic
    - `app/` - Application state and initialization
    - `assets/` - Asset management
    - `backends/` - Git backend implementations (GitHub, GitLab, etc.)
    - `common/` - Shared utilities
    - `config/` - Configuration loading and management
    - `contents/` - Content management
    - `integrations/` - Third-party service integrations
    - `search/` - Search functionality
    - `user/` - User authentication and preferences
    - `utils/` - Utility functions
  - `types/` - TypeScript type definitions

### Core Concepts

1. **Backend Services**: The CMS supports multiple Git backends (GitHub, GitLab, local), implementing a consistent interface for each. Backend services handle authentication, file operations, and commits.

2. **Content Management**: The system manages different content types, fields, and widgets, supporting various file formats (YAML, TOML, JSON, Markdown).

3. **Asset Management**: Handles media files, including optimization, preview, and integration with external libraries.

4. **Internationalization**: Built-in support for multiple languages with DeepL translation integration.

### Application Flow

1. The application initializes in `main.js`, which sets up the CMS and provides compatibility with Netlify/Decap CMS.

2. The configuration is loaded from `config.yml` or from a provided JavaScript object.

3. Authentication is handled by the selected backend service.

4. Content is loaded from the Git repository, parsed, and managed through Svelte stores.

5. Changes are committed back to the Git repository when users save or publish.

## Testing

Tests are written using Vitest and follow a `.spec.js` naming convention. Tests are primarily focused on utility functions and core business logic.

## Build System

The project uses Vite for both development and building:

- `vite.config.js` defines build configuration
- Build process generates IIFE and ES modules
- TypeScript declarations are generated from JSDoc comments

## Important Workflows

1. When adding new features, ensure compatibility with existing Netlify/Decap CMS configurations
2. For UI components, follow the existing patterns in the components directory
3. When modifying backend services, maintain the consistent interface across all backends
4. Add tests for new utility functions and business logic
