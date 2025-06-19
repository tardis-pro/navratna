# 🚀 UAIP Portal System - Live Setup Guide

The Portal System is a sophisticated, real-time workspace for managing AI agents, model providers, and system intelligence. This guide will help you make it fully operational.

## 🎯 Current Status

✅ **Fully Implemented Components:**
- `PortalWorkspace` - Main portal management interface
- `AgentSelectorPortal` - Agent creation and management
- `SettingsPortal` - Model provider configuration
- `ChatPortal` - Real-time agent communication
- `IntelligencePanelPortal` - Live system insights
- `DiscussionControlsPortal` - Discussion orchestration

✅ **Advanced Features:**
- Window management (minimize, maximize, drag, resize)
- Real-time status indicators
- Live system monitoring
- Z-index management for overlapping portals
- Portal spawning and destruction
- Dynamic portal types (spawner, monitor)

## 🛠️ Quick Start

### 1. Backend Services Required

Ensure these backend services are running:

```bash
# Start the backend services
cd backend/services

# Agent Intelligence Service
cd agent-intelligence
npm run dev

# LLM Service
cd ../llm-service  
npm run dev

# Capability Registry
cd ../capability-registry
npm run dev

# Security Gateway
cd ../security-gateway
npm run dev

# Discussion Orchestration
cd ../discussion-orchestration
npm run dev
```

### 2. Frontend Setup

```bash
# In the frontend directory
cd apps/frontend

# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

### 3. Access the Portal System

1. Navigate to your frontend URL (typically `http://localhost:3000`)
2. Go to the Portal Workspace (add route or component)
3. Start spawning portals using the left sidebar

## 🎮 Portal System Features

### Core Portal Types

1. **Agent Selector Portal** (`agents`)
   - Create new AI agents
   - Configure agent personalities
   - Assign models to agents
   - Real-time agent status

2. **Settings Portal** (`settings`)
   - Configure model providers (OpenAI, Ollama, LLM Studio)
   - Test provider connections
   - Manage API keys and configurations
   - View provider statistics

3. **Chat Portal** (`chat`)
   - Direct communication with agents
   - Conversation history
   - Real-time responses
   - Memory-enhanced interactions

4. **Intelligence Panel** (`intelligence`)
   - Live system metrics
   - Decision analytics
   - Cognitive insights
   - Performance monitoring

5. **Discussion Controls** (`discussion`)
   - Multi-agent discussions
   - Turn-based conversations
   - Discussion orchestration
   - Real-time collaboration

6. **Agent Spawner** (`spawner`)
   - Quick agent creation
   - Batch agent operations
   - Template-based spawning

7. **System Monitor** (`monitor`)
   - Real-time system health
   - Resource usage
   - Connection status
   - Performance metrics

### Portal Management

- **Drag & Drop**: Click and drag portal headers to move
- **Resize**: Drag corners to resize portals
- **Minimize**: Click minimize button to collapse to taskbar
- **Maximize**: Click maximize or double-click header to fullscreen
- **Focus Management**: Click portals to bring to front
- **Close**: X button to destroy portals

## 🔧 Configuration

### Environment Variables

Create `.env` file in frontend root:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001

# Feature Flags
VITE_ENABLE_PORTAL_SYSTEM=true
VITE_ENABLE_REAL_TIME=true
VITE_ENABLE_ADVANCED_FEATURES=true

# Development
VITE_DEBUG_MODE=true
```

### API Endpoints Required

The portal system expects these backend endpoints:

```
# Agent Management
GET    /api/agents
POST   /api/agents
PUT    /api/agents/:id
DELETE /api/agents/:id
POST   /api/agents/:id/chat

# Model Providers
GET    /api/user-llm/providers
POST   /api/user-llm/providers
PUT    /api/user-llm/providers/:id
GET    /api/user-llm/models

# Discussions
GET    /api/discussions
POST   /api/discussions
PUT    /api/discussions/:id/start
PUT    /api/discussions/:id/end

# Capabilities
GET    /api/capabilities
POST   /api/capabilities/execute

# Personas
GET    /api/personas
POST   /api/personas
```

## 🚀 Making It "Live"

### 1. Real-Time Features

The system includes:
- Live status indicators (online/degraded/offline)
- Real-time connection counters
- Dynamic portal status updates
- Animated system health indicators

### 2. Enhanced Interactions

- **Portal Spawning**: Click portal buttons to create instances
- **Multi-Portal Management**: Run multiple portals simultaneously
- **Context Switching**: Each portal maintains independent state
- **Resource Monitoring**: Live tracking of system resources

### 3. Advanced Workflows

```typescript
// Example: Spawn multiple portals programmatically
const spawnAgentWorkflow = () => {
  // 1. Open agent selector
  createPortal('agents');
  
  // 2. Open settings for model configuration
  createPortal('settings');
  
  // 3. Open intelligence panel for monitoring
  createPortal('intelligence');
  
  // 4. Open chat for testing
  createPortal('chat');
};
```

## 🎨 Customization

### Portal Themes

Portals automatically theme based on type:
- **Agent**: Blue gradient (AI consciousness)
- **Tool**: Purple gradient (capabilities)
- **Analysis**: Orange gradient (insights)
- **Communication**: Indigo gradient (messaging)

### Adding New Portal Types

1. Define in `PORTAL_CONFIGS`:
```typescript
newPortalType: {
  title: 'Custom Portal',
  component: CustomPortalComponent,
  defaultSize: { width: 500, height: 600 },
  type: 'custom' as const,
  icon: CustomIcon
}
```

2. Create the portal component:
```typescript
export const CustomPortalComponent: React.FC<{mode?: string}> = ({ mode }) => {
  // Portal implementation
  return <div>Custom Portal Content</div>;
};
```

## 🐛 Troubleshooting

### Common Issues

1. **Portals Not Loading**
   - Check backend services are running
   - Verify API endpoints are accessible
   - Check browser console for errors

2. **Model Providers Not Working**
   - Ensure provider services (Ollama, etc.) are running
   - Check API keys and configurations
   - Test provider connections in Settings portal

3. **Agent Creation Failing**
   - Verify models are available
   - Check persona selection
   - Ensure backend agent service is running

4. **Real-Time Features Not Working**
   - Check WebSocket connections
   - Verify environment variables
   - Ensure discussion orchestration service is running

### Debug Mode

Enable debug mode for detailed logging:
```typescript
// In browser console
localStorage.setItem('portal-debug', 'true');
```

## 🎯 Production Deployment

### Performance Optimizations

1. **Portal Virtualization**: Only render visible portals
2. **State Management**: Efficient context updates
3. **Memory Management**: Cleanup on portal destruction
4. **Network Optimization**: Debounced API calls

### Security Considerations

1. **API Authentication**: Secure all backend endpoints
2. **Input Validation**: Sanitize all user inputs
3. **Rate Limiting**: Prevent API abuse
4. **Error Handling**: Graceful failure modes

## 🎉 Success Metrics

When fully operational, you should see:
- ✅ System status: ONLINE (green indicator)
- ✅ Multiple active connections
- ✅ Responsive portal creation/destruction
- ✅ Real-time agent communication
- ✅ Live model provider status
- ✅ Dynamic system monitoring

## 🔮 Future Enhancements

Planned features:
- Portal templates and presets
- Collaborative portal sharing
- Advanced portal layouts
- Plugin system for custom portals
- AI-assisted portal management
- Cross-portal data synchronization

---

**The Portal System is now LIVE! 🎊**

Create your first portal by clicking the sidebar buttons and start exploring the future of AI agent management. 