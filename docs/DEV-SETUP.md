# Development Environment Setup

## Prerequisites
1. Node.js v18+
2. Python 3.9+
3. pnpm
4. Git
5. VS Code (recommended)

## Initial Setup
1. Clone and Dependencies
   ```bash
   git clone <repository-url>
   cd A-UI
   pnpm install
   cd server
   poetry install
   ```

2. Environment Configuration
   - Copy `.env.example` to `.env`
   - Set up vector database credentials
   - Configure API keys if needed
   - Set development server ports

## Required VS Code Extensions
1. Core Development
   - ESLint
   - Prettier
   - TypeScript and JavaScript Language Features
   - Python

2. Testing
   - Jest Runner
   - Test Explorer UI
   - Coverage Gutters

3. Recommended
   - GitLens
   - Error Lens
   - Import Cost

## Project Structure
- `/app` - Main application code
- `/server` - Backend services
- `/src` - Core UI components
- `/tests` - Test suites
- `/sprint` - Sprint planning and tracking
- `/epics` - Epic definitions and tasks
- `/work-items` - Feature specifications

## Development Workflow
1. Branch Strategy
   - main: production-ready code
   - develop: integration branch
   - feature/*: new features
   - fix/*: bug fixes

2. Local Development
   ```bash
   # Frontend
   pnpm dev

   # Backend
   cd server
   poetry run python -m app
   ```

3. Testing
   ```bash
   # Unit tests
   pnpm test

   # E2E tests
   pnpm test:e2e
   ```

## Code Standards
1. TypeScript
   - Strict mode enabled
   - Functional components
   - Use TypeScript features

2. Python
   - Type hints required
   - Black formatting
   - Pylint compliance

3. Testing
   - Unit tests for new components
   - Integration tests for features
   - Maintain coverage requirements

## Getting Started
1. Check current sprint in `/sprint/SPRINT-PLANNING.md`
2. Review active tasks in `/sprint/DAILY-TRACKER.md`
3. Set up your development environment
4. Start with a small task from current sprint