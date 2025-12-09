# UI Component System

## Overview

The UAIP frontend implements a comprehensive component system using React with TypeScript, featuring a futuristic design system and progressive disclosure patterns.

## Core Components

### Agent Components

#### Agent Card

```typescript
interface AgentCardProps {
  agent: Agent;
  status: AgentStatus;
  metrics: AgentMetrics;
  onSelect: (agentId: string) => void;
  className?: string;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  status,
  metrics,
  onSelect
}) => {
  return (
    <Card className="agent-card">
      <AgentAvatar agent={agent} status={status} />
      <AgentInfo agent={agent} metrics={metrics} />
      <AgentActions onSelect={() => onSelect(agent.id)} />
    </Card>
  );
};
```

#### Agent Manager

```typescript
const AgentManager: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>();

  useEffect(() => {
    loadAgents();
  }, []);

  return (
    <div className="agent-manager">
      <AgentList
        agents={agents}
        selectedId={selectedAgent}
        onSelect={setSelectedAgent}
      />
      {selectedAgent && (
        <AgentDetails
          agentId={selectedAgent}
          onClose={() => setSelectedAgent(undefined)}
        />
      )}
    </div>
  );
};
```

### Discussion Components

#### Discussion Log

```typescript
interface DiscussionLogProps {
  discussionId: string;
  messages: Message[];
  participants: Participant[];
  onReply: (messageId: string) => void;
}

const DiscussionLog: React.FC<DiscussionLogProps> = ({
  discussionId,
  messages,
  participants
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="discussion-log">
      {messages.map(message => (
        <MessageItem
          key={message.id}
          message={message}
          participant={getParticipant(message.senderId, participants)}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};
```

#### Message Composer

```typescript
interface MessageComposerProps {
  discussionId: string;
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
}

const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  disabled
}) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;

    setSubmitting(true);
    try {
      await onSend(content);
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="message-composer">
      <TextField
        value={content}
        onChange={e => setContent(e.target.value)}
        disabled={disabled || isSubmitting}
        placeholder="Type your message..."
      />
      <Button
        onClick={handleSubmit}
        disabled={!content.trim() || disabled || isSubmitting}
      >
        Send
      </Button>
    </div>
  );
};
```

### Portal Components

#### Portal Layout

```typescript
interface PortalLayoutProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const PortalLayout: React.FC<PortalLayoutProps> = ({
  title,
  actions,
  children
}) => {
  return (
    <div className="portal-layout">
      <PortalHeader title={title} actions={actions} />
      <div className="portal-content">{children}</div>
      <PortalFooter />
    </div>
  );
};
```

#### Portal Grid

```typescript
interface PortalGridProps {
  items: PortalItem[];
  layout: GridLayout;
  onItemClick: (itemId: string) => void;
}

const PortalGrid: React.FC<PortalGridProps> = ({
  items,
  layout,
  onItemClick
}) => {
  return (
    <div className={`portal-grid layout-${layout}`}>
      {items.map(item => (
        <PortalItem
          key={item.id}
          item={item}
          onClick={() => onItemClick(item.id)}
        />
      ))}
    </div>
  );
};
```

## Design System

### Theme Configuration

```typescript
interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      disabled: string;
    };
  };
  spacing: {
    unit: number;
    sizes: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
  };
  typography: {
    fontFamily: string;
    fontSizes: {
      body: string;
      heading: string;
      caption: string;
    };
    lineHeights: {
      body: number;
      heading: number;
      caption: number;
    };
  };
}
```

### Animation System

```typescript
const animations = {
  fadeIn: keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
  `,
  slideIn: keyframes`
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  `,
  pulse: keyframes`
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  `,
};

const AnimatedComponent = styled.div<{ isVisible: boolean }>`
  opacity: ${(props) => (props.isVisible ? 1 : 0)};
  animation: ${(props) => (props.isVisible ? animations.fadeIn : 'none')} 0.3s ease;
`;
```

## Hooks and Utilities

### Custom Hooks

```typescript
// Manage WebSocket connections
const useWebSocket = (url: string) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('error');
    setSocket(ws);

    return () => ws.close();
  }, [url]);

  return { socket, status };
};

// Handle real-time updates
const useRealtimeUpdates = (discussionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const socket = useWebSocket(`/api/discussions/${discussionId}/ws`);

  useEffect(() => {
    if (!socket) return;

    socket.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setMessages((prev) => [...prev, update]);
    };
  }, [socket, discussionId]);

  return messages;
};
```

### Component Utilities

```typescript
// Progressive loading
const withProgressiveLoading = <P extends object>(
  Component: React.ComponentType<P>,
  loadingConfig: LoadingConfig
) => {
  return (props: P) => {
    const [isLoaded, setLoaded] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => setLoaded(true), loadingConfig.delay);
      return () => clearTimeout(timer);
    }, []);

    return isLoaded ? <Component {...props} /> : <LoadingPlaceholder />;
  };
};

// Error boundary
class ComponentErrorBoundary extends React.Component<
  { fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

## Best Practices

### Component Design

1. Single Responsibility
2. Proper TypeScript types
3. Error handling
4. Loading states
5. Accessibility

### Performance

1. Memoization
2. Code splitting
3. Lazy loading
4. Virtual scrolling
5. Debouncing/throttling

### State Management

1. Component state
2. Context API
3. Props drilling
4. State updates
5. Side effects
