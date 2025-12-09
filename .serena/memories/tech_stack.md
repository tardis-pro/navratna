# Technology Stack

## Core Technologies

- **Runtime**: Node.js 18+ with ES Modules
- **Language**: TypeScript (ES2022 target)
- **Package Manager**: pnpm with workspace support
- **Architecture**: Microservices with monorepo structure

## Backend Technologies

- **Framework**: Express.js 5.x with comprehensive middleware stack
- **Database**: TypeORM with PostgreSQL (primary), Neo4j (graph), Redis (cache)
- **Real-time**: WebSocket (socket.io) for agent discussions and live updates
- **Message Queue**: RabbitMQ for event-driven communication
- **Vector Database**: Qdrant for semantic search and embeddings
- **Validation**: Zod schemas for runtime validation
- **Security**: JWT, OAuth, MFA, RBAC, audit trails
- **Monitoring**: Prometheus metrics, comprehensive logging

## Frontend Technologies

- **Framework**: React 19.x with TypeScript
- **Build Tool**: Vite 6.x with SWC
- **UI Components**: Radix UI primitives with shadcn/ui
- **Styling**: Tailwind CSS with custom design system
- **State Management**: React Query (@tanstack/react-query)
- **Routing**: React Router DOM 7.x
- **Forms**: React Hook Form with Zod validation
- **Icons**: Heroicons, Lucide React

## Development Tools

- **TypeScript**: v5.8.3 with strict: false, composite builds
- **ESLint**: v9.x with TypeScript ESLint plugin
- **Testing**: Jest with TypeScript support (limited coverage currently)
- **Docker**: Multi-stage builds with hot reloading
- **CI/CD**: GitHub Actions with comprehensive PR checks
