# UAIP Artifact Service

An intelligent AI-powered microservice that generates, validates, and manages software artifacts from natural language conversations.

## Features

- **Conversation Analysis**: Advanced pattern recognition and phase detection
- **Multi-Modal Generation**: Code, tests, documentation, and PRDs
- **Quality Validation**: Syntax, security, and quality scoring
- **Complete Traceability**: Full audit trail from conversation to artifact

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start in development mode
npm run dev

# Start in production mode
npm start
```

### Health Check

```bash
curl http://localhost:3004/health
```

## API Endpoints

### 1. Analyze Conversation

Analyze a conversation to detect artifact generation opportunities.

```bash
POST /api/v1/artifacts/analyze
```

**Request:**
```json
{
  "context": {
    "conversationId": "conv-123",
    "messages": [
      {
        "id": "msg-1",
        "content": "Can you generate a TypeScript function to validate email addresses?",
        "timestamp": "2024-12-04T10:00:00Z",
        "author": "user-1",
        "role": "user"
      }
    ],
    "participants": [
      {
        "id": "user-1",
        "name": "John Doe",
        "role": "developer"
      }
    ]
  },
  "options": {
    "includeConfidence": true,
    "analysisDepth": "deep"
  }
}
```

**Response:**
```json
{
  "triggers": [
    {
      "type": "pattern",
      "confidence": 0.9,
      "artifactType": "code-diff",
      "context": "Can you generate a TypeScript function...",
      "detectedAt": "2024-12-04T10:00:00Z"
    }
  ],
  "phase": {
    "current": "implementation",
    "confidence": 0.8,
    "suggestedActions": ["Generate code artifact", "Create tests"]
  },
  "summary": {
    "keyPoints": ["Email validation function needed"],
    "decisions": [],
    "actionItems": [],
    "participants": ["user-1"]
  },
  "suggestions": ["Generate TypeScript code", "Add input validation"],
  "confidence": 0.85,
  "processingTime": 150
}
```

### 2. Generate Artifact

Generate an artifact from conversation context.

```bash
POST /api/v1/artifacts/generate
```

**Request:**
```json
{
  "type": "code-diff",
  "context": {
    "conversationId": "conv-123",
    "messages": [
      {
        "id": "msg-1",
        "content": "Create a TypeScript function to validate email addresses",
        "timestamp": "2024-12-04T10:00:00Z",
        "author": "user-1",
        "role": "user"
      }
    ],
    "participants": [
      {
        "id": "user-1",
        "name": "John Doe",
        "role": "developer"
      }
    ]
  },
  "parameters": {
    "language": "typescript",
    "style": "functional",
    "complexity": "simple"
  }
}
```

**Response:**
```json
{
  "result": {
    "success": true,
    "artifact": {
      "type": "code-diff",
      "content": "// Generated code based on conversation context\nexport function generatedFunction() {\n  // TODO: Implement based on requirements\n  console.log('Generated function placeholder');\n  return 'placeholder';\n}",
      "metadata": {
        "id": "artifact-123",
        "title": "Email Validation Function",
        "description": "TypeScript function for email validation",
        "language": "typescript",
        "estimatedEffort": "low",
        "tags": ["code", "generated", "typescript"]
      },
      "traceability": {
        "conversationId": "conv-123",
        "generatedBy": "user-1",
        "generatedAt": "2024-12-04T10:00:00Z",
        "generator": "code-diff",
        "confidence": 0.8,
        "sourceMessages": ["msg-1"]
      }
    },
    "errors": [],
    "warnings": [],
    "confidence": 0.8
  },
  "metadata": {
    "processingTime": 2500,
    "generatorUsed": "code-diff",
    "fallbackUsed": false
  },
  "suggestions": []
}
```

### 3. Get Available Types

Get information about available artifact generators.

```bash
GET /api/v1/artifacts/types
```

**Response:**
```json
{
  "types": [
    {
      "type": "code-diff",
      "description": "code-diff artifact generator",
      "available": true,
      "capabilities": ["generation", "validation"],
      "requirements": ["conversation context"],
      "supportedLanguages": ["typescript", "javascript", "python"],
      "supportedFrameworks": ["react", "express", "fastapi"]
    }
  ],
  "generators": {
    "code-diff": {
      "status": "active",
      "version": "1.0.0",
      "capabilities": ["generation", "validation"],
      "lastUpdated": "2024-12-04T10:00:00Z",
      "performance": {
        "averageResponseTime": 5000,
        "successRate": 0.95,
        "totalGenerations": 0
      }
    }
  },
  "systemStatus": {
    "overallHealth": "healthy",
    "activeGenerators": 4,
    "totalGenerations": 0,
    "successRate": 0.95
  }
}
```

### 4. Validate Artifact

Validate an artifact for quality, security, and compliance.

```bash
POST /api/v1/artifacts/validate
```

### 5. Service Status

Get comprehensive service health and performance metrics.

```bash
GET /api/v1/artifacts/status
```

## Supported Artifact Types

- **code-diff**: Code generation and refactoring
- **test**: Test suite generation
- **prd**: Product Requirements Documents
- **documentation**: Technical documentation

## Configuration

The service uses the following configuration:

- **Port**: 3004 (configurable via `config.services.artifactService.port`)
- **Environment**: Development/Production modes
- **Logging**: Structured logging via shared utils

## Development

### Project Structure

```
src/
├── ArtifactFactory.ts          # Core orchestration
├── interfaces/                 # Service contracts
├── generators/                 # Artifact generators
│   ├── CodeGenerator.ts
│   ├── TestGenerator.ts
│   ├── PRDGenerator.ts
│   └── DocumentationGenerator.ts
├── analysis/
│   └── ConversationAnalyzer.ts # Conversation analysis
├── security/
│   └── SecurityManager.ts      # Security validation
├── validation/
│   └── ArtifactValidator.ts    # Quality validation
├── routes/                     # REST API endpoints
├── services/
│   └── llm/                    # LLM integration
└── types/
    └── artifact.ts             # Type definitions
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

## Integration

This service integrates with:

- **Orchestration Pipeline**: For capability registration and operation handling
- **Security Gateway**: For authentication and authorization
- **Shared Services**: For database, logging, and configuration
- **LLM Services**: For AI-powered generation (placeholder implementation)

## Monitoring

The service provides comprehensive monitoring through:

- Health check endpoint (`/health`)
- Status endpoint (`/api/v1/artifacts/status`)
- Structured logging
- Performance metrics
- Error tracking

## Security

- Input validation using Zod schemas
- Security scanning of generated artifacts
- Audit logging for all operations
- Rate limiting and CORS protection
- Helmet.js security headers

## Future Enhancements

- Real LLM integration (OpenAI, Anthropic, local models)
- Advanced code analysis and quality scoring
- Template system for customizable artifacts
- Real-time collaboration features
- Enhanced security scanning
- Performance optimization with caching

## License

MIT License - see LICENSE file for details. 