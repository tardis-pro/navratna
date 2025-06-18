# Council of Nycea - Unified Monorepo

A full-stack TypeScript monorepo for the Council of Nycea platform, combining frontend and backend services with shared packages.

## 🏗️ Monorepo Structure

```
council-of-nycea/
├── apps/
│   └── frontend/                 # React frontend application
├── packages/
│   ├── shared-types/            # Shared TypeScript types (frontend + backend)
│   └── shared-utils/            # Shared utilities (frontend + backend)
├── backend/
│   ├── services/                # Backend microservices
│   │   ├── agent-intelligence/
│   │   ├── artifact-service/
│   │   ├── capability-registry/
│   │   ├── discussion-orchestration/
│   │   ├── llm-service/
│   │   ├── orchestration-pipeline/
│   │   └── security-gateway/
│   └── shared/                  # Backend-specific shared packages
│       ├── config/
│       ├── llm-service/
│       ├── middleware/
│       ├── services/
│       ├── types/              # Backend-specific types
│       └── utils/              # Backend-specific utilities
└── database/                   # Database schemas and migrations
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation
```bash
# Install all dependencies
pnpm install

# Build shared packages first
pnpm build:shared

# Build all packages
pnpm build
```

### Development

#### Local Development (No Docker)
```bash
# Start both frontend and backend in development mode
pnpm dev

# Start only frontend
pnpm dev:frontend

# Start only backend
pnpm dev:backend
```

#### Docker Development with Hot Reloading (Recommended)
```bash
# Start entire development environment with hot reloading
./dev-start.sh

# Start in detached mode (background)
./dev-start.sh --detached

# View logs for specific service
docker-compose logs -f frontend
docker-compose logs -f agent-intelligence

# Stop all services
docker-compose down
```

**Hot Reloading Features:**
- 🔥 **Frontend**: Vite HMR with instant updates
- ⚡ **Backend**: Nodemon with TypeScript compilation
- 📦 **Shared Packages**: Auto-rebuild on changes
- 🔄 **Live Reload**: Changes reflect immediately
- 🌐 **Unified Access**: Everything accessible via http://localhost:8081

## 📦 Shared Packages

### `@council/shared-types`
Shared TypeScript types used by both frontend and backend:
- Agent types
- API interfaces
- Common data structures
- Validation schemas

### `@council/shared-utils`
Shared utilities used by both frontend and backend:
- Logging utilities
- Error handling
- Common helper functions
- Validation utilities

## 🎯 Import Patterns

### Frontend Imports
```typescript
// Shared packages
import { AgentType } from '@council/shared-types';
import { logger } from '@council/shared-utils';

// Local imports
import { Component } from '@/components/Component';
```

### Backend Imports
```typescript
// Shared packages (monorepo-wide)
import { AgentType } from '@council/shared-types';
import { logger } from '@council/shared-utils';

// Backend shared packages
import { DatabaseService } from '@uaip/shared-services';
import { Operation } from '@uaip/types';

// Local imports
import { config } from '@/config';
```

## 🔧 Available Scripts

### Root Level
- `pnpm dev` - Start both frontend and backend
- `pnpm build` - Build all packages
- `pnpm build:shared` - Build only shared packages
- `pnpm build:frontend` - Build only frontend
- `pnpm build:backend` - Build only backend
- `pnpm lint` - Lint all packages
- `pnpm clean` - Clean all build artifacts

### Frontend (`apps/frontend`)
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build

### Backend (`backend/`)
- `pnpm dev` - Start all services in development
- `pnpm build-shared` - Build shared packages
- `pnpm build-services` - Build all services
- `pnpm dev:minimal` - Start minimal services (agent + capability)

## 🏛️ Architecture

### Frontend Architecture
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** with shadcn/ui components
- **React Query** for data fetching
- **Socket.IO** for real-time communication

### Backend Architecture
- **Microservices** architecture
- **TypeScript** with ESM modules
- **Express.js** for REST APIs
- **TypeORM** for database management
- **Socket.IO** for real-time features
- **PostgreSQL** with Neo4j for knowledge graphs

### Shared Infrastructure
- **TypeScript Project References** for incremental builds
- **PNPM Workspaces** for dependency management
- **Unified ESLint** configuration
- **Consistent TypeScript** configuration

## 🔄 Build Process

The monorepo uses TypeScript project references for efficient incremental builds:

1. **Shared Packages** (`packages/*`) - Built first
2. **Backend Shared** (`backend/shared/*`) - Built second
3. **Backend Services** (`backend/services/*`) - Built third
4. **Frontend** (`apps/frontend`) - Built last

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Test specific artifacts
pnpm test:artifacts
pnpm test:artifacts:prd
pnpm test:artifacts:code
```

## 🚀 Deployment

### Development
```bash
# Start all services
pnpm dev
```

### Production
```bash
# Build all packages
pnpm build

# Start production servers
cd apps/frontend && pnpm preview
cd backend && pnpm start
```

## 🔧 Configuration

### Environment Variables
- Frontend: See `apps/frontend/.env.example`
- Backend: See `backend/.env.example`

### TypeScript Configuration
- Root: `tsconfig.json` - Project references
- Frontend: `apps/frontend/tsconfig.json`
- Backend: `backend/tsconfig.json`
- Shared: Individual `tsconfig.json` per package

## 📚 Documentation

- [Backend Integration Guide](backend/docs/01_Backend_Integration.md)
- [Knowledge Graph Integration](backend/docs/02_Knowledge_Graph_Integration.md)
- [LLM Service Implementation](LLM_SERVICE_IMPLEMENTATION_SUMMARY.md)
- [Development Setup](backend/DEV_SETUP.md)

## 🤝 Contributing

1. Install dependencies: `pnpm install`
2. Build shared packages: `pnpm build:shared`
3. Start development: `pnpm dev`
4. Make your changes
5. Run tests: `pnpm test`
6. Submit a pull request

## 🔍 Troubleshooting

### Build Issues
```bash
# Clean all build artifacts
pnpm clean

# Rebuild shared packages
pnpm build:shared

# Rebuild everything
pnpm build
```

### Import Resolution Issues
1. Check TypeScript path mappings in `tsconfig.json`
2. Verify package references in `package.json`
3. Ensure shared packages are built
4. Check Vite alias configuration (frontend)

### Development Server Issues
```bash
# Check if all services are running
pnpm dev

# Start services individually
pnpm dev:frontend
pnpm dev:backend
```

## 📄 License

MIT License - see LICENSE file for details
