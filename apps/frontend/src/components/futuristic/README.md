# Futuristic Portal System

A neural-themed portal workspace that transforms your React components into draggable, resizable windows with real-time data integration.

## 🚀 Features

### Portal Management
- **Drag & Drop**: Move portals by dragging their headers
- **Resize**: Hover near edges/corners to see resize handles
- **Minimize/Maximize**: Use header buttons to control portal size
- **Close**: Red X button removes portals
- **Auto-positioning**: New portals cascade to avoid overlap

### Real Data Integration
- **DiscussionControlsPortal**: Shows actual agent count, message count, participants, and connection status
- **AgentSelectorPortal**: Displays real agents from AgentContext with their models and status
- **IntelligencePanelPortal**: Analyzes real messages and generates insights from actual discussion data
- **SettingsPortal**: Manages real application settings (placeholder for future features)

## 🎯 Usage

### Basic Implementation
```tsx
import { PortalWorkspace } from './components/futuristic/PortalWorkspace';

function App() {
  return <PortalWorkspace />;
}
```

### Individual Portal Usage
```tsx
import { Portal } from './components/futuristic/Portal';
import { DiscussionControlsPortal } from './components/futuristic/portals/DiscussionControlsPortal';

function MyComponent() {
  return (
    <Portal
      id="discussion-controls"
      type="communication"
      title="Discussion Controls"
      onClose={() => console.log('Portal closed')}
    >
      <DiscussionControlsPortal />
    </Portal>
  );
}
```

## 🔧 Portal Types & Styling

Each portal type has unique neural styling:
- **agent**: Blue/cyan gradients for AI agents
- **tool**: Purple/pink gradients for tools and utilities  
- **data**: Emerald/teal gradients for data displays
- **analysis**: Orange/red gradients for analytics
- **communication**: Indigo/violet gradients for messaging

## 📊 Data Sources

### DiscussionControlsPortal
- Uses `useDiscussion()` hook for real discussion state
- Shows actual agent count, message count, participants
- Displays connection status and errors
- Provides real start/stop/reset functionality

### AgentSelectorPortal
- Uses `useAgents()` hook for real agent management
- Shows actual agent models and providers
- Enables real agent creation/deletion
- Integrates with backend API

### IntelligencePanelPortal
- Analyzes real messages from `useDiscussion()`
- Generates insights based on actual agent data
- Calculates metrics from real discussion activity
- Shows contextual analysis of conversations

## 🎨 Customization

### Portal Props
```tsx
interface PortalProps {
  id: string;
  type: 'agent' | 'tool' | 'data' | 'analysis' | 'communication';
  title: string;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  onClose?: () => void;
  onMaximize?: () => void;
  onMinimize?: () => void;
}
```

### Neural Effects
- Pulse animations on active portals
- Gradient backgrounds with type-specific colors
- Hover effects and transitions
- Glass morphism with backdrop blur

## 🔌 Context Integration

The portal system integrates with:
- **AgentContext**: Real agent management and state
- **DiscussionContext**: Live discussion data and controls
- **AuthContext**: User authentication (where applicable)

## 🚀 Getting Started

1. Ensure you have the required contexts set up:
   ```tsx
   <AgentProvider>
     <DiscussionProvider>
       <PortalWorkspace />
     </DiscussionProvider>
   </AgentProvider>
   ```

2. The portal launcher appears on the left side - click icons to toggle portals

3. Drag headers to move, hover edges to resize, use buttons to control

4. All data is live and connected to your actual application state!

## 🎭 Neural Theming

The portal system uses a consistent neural/futuristic theme:
- Dark glass morphism backgrounds
- Animated gradient borders
- Pulse effects and neural activity indicators
- Holographic accents and glow effects
- Smooth spring animations powered by Framer Motion

Perfect for AI applications, cognitive interfaces, and futuristic dashboards! 