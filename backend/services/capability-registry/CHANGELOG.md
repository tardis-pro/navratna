# Changelog

All notable changes to the Capability Registry service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-06-24

### Added
- Event Runner integration with sandboxed execution engine
- Real-time event streaming architecture
- Multi-tool workflow orchestration
- Cross-service integration with Discussion Orchestration and Agent Intelligence
- Neo4j graph-based tool relationships
- Redis-powered event streaming
- Security levels and approval workflows
- Prometheus metrics and health monitoring
- Community tool sharing with GitHub integration

### Changed
- Complete architecture redesign with Event Runner at core
- Enhanced security model with Firecracker isolation
- Improved performance with hybrid PostgreSQL + Neo4j architecture
- Updated API endpoints for better consistency
- Enhanced WebSocket support for real-time updates

### Security
- Implemented Firecracker-based micro-VM isolation
- Added security level validation and approval workflows
- Enhanced audit logging and monitoring
- Implemented rate limiting and resource constraints
- Added comprehensive security documentation

## [0.2.0] - 2024-05-15

### Added
- Basic tool registration and management
- Simple tool execution capabilities
- Initial PostgreSQL schema
- Basic API endpoints
- Authentication middleware

### Changed
- Updated database schema
- Improved error handling
- Enhanced logging

### Fixed
- Connection pool management
- Error response formatting
- Request validation

## [0.1.0] - 2024-04-01

### Added
- Initial service setup
- Basic project structure
- Development environment configuration
- Base API endpoints
- Simple tool management

# Migration Guides

## Upgrading to 1.0.0

### Event Runner Integration
- All tool executions now use the Event Runner engine
- Updated execution endpoints with new response format
- Added WebSocket support for real-time updates

### Database Changes
- New Neo4j graph database requirement
- Redis requirement for event streaming
- Updated PostgreSQL schema

### Security Updates
- New security level system
- Approval workflow for restricted tools
- Enhanced authentication requirements

### API Changes
- New event streaming endpoints
- Updated execution response format
- Added workflow orchestration endpoints

### Configuration Updates
Required environment variables:
```bash
# New in 1.0.0
NEO4J_URI=bolt://localhost:7687
REDIS_URL=redis://localhost:6379
ENABLE_APPROVAL_WORKFLOW=true
EVENT_RUNNER_CONFIG=path/to/config
```

### Client Updates
- WebSocket client integration required for real-time updates
- Updated security level handling
- New workflow orchestration patterns

For detailed migration instructions, see the [Migration Guide](./docs/migrations/1.0.0.md).