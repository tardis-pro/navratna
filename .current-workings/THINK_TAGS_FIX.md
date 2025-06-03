# Think Tags Parsing Fix

## Problem
The `<think>` tags were being displayed in the UI instead of being properly parsed and hidden. This was happening because:

1. The parsing logic only applied to messages with `type === 'thought'`
2. Regular response messages from LLMs could also contain `<think>` tags that needed to be parsed
3. The think tags and their content were being shown in the UI instead of being processed

## Root Cause
Looking at the screenshot, the message from "Bhai" contained:
```
<think> Okay, let's see. The user is asking about integrating the mission system with the event system...
```

This was a regular response message (not a thought message), but it contained think tags that should have been parsed and either hidden or shown separately based on the `showThinkTokens` setting.

## Solution

### 1. Enhanced Parsing Function
Replaced the simple `parseThoughtContent` function with a more comprehensive `parseMessageContent` function:

```typescript
// BEFORE: Only parsed content for thought messages
const parseThoughtContent = (content: string): string => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  return thinkMatch ? thinkMatch[1].trim() : content;
};

// AFTER: Parses all messages and handles think tags appropriately
const parseMessageContent = (content: string, messageType: string): { displayContent: string; thoughtContent?: string } => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  
  if (thinkMatch) {
    const thoughtContent = thinkMatch[1].trim();
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    if (messageType === 'thought') {
      return { displayContent: thoughtContent };
    } else {
      return { 
        displayContent: cleanContent || thoughtContent,
        thoughtContent: thoughtContent 
      };
    }
  }
  
  return { displayContent: content };
};
```

### 2. Updated Message Rendering
Modified the `renderMessage` function to use the new parsing logic:

```typescript
// BEFORE: Only parsed think tags for thought messages
const displayContent = message.type === 'thought' ? parseThoughtContent(message.content) : message.content;

// AFTER: Parse all messages for think tags
const { displayContent, thoughtContent } = parseMessageContent(message.content, message.type);
```

### 3. Added Thought Content Indicator
When `showThinkTokens` is enabled and a regular message contains hidden thought content, it's now displayed in a separate section:

```typescript
{showThinkTokens && thoughtContent && message.type !== 'thought' && (
  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
    <div className="flex items-center space-x-2 mb-2">
      <Brain className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Internal Reasoning:</span>
    </div>
    <div className="text-sm text-amber-700 dark:text-amber-300 italic">
      {thoughtContent}
    </div>
  </div>
)}
```

## How It Works Now

### For Regular Response Messages with Think Tags:
```
Input: "<think>Let me analyze this...</think>The answer is X because Y."
Output: 
- Main content: "The answer is X because Y."
- Thought content (if showThinkTokens=true): "Let me analyze this..." (shown in amber box)
```

### For Thought Messages:
```
Input: "<think>I need to consider...</think>"
Output:
- Main content: "I need to consider..." (shown in italic gray)
```

### For Regular Messages without Think Tags:
```
Input: "This is a regular message."
Output:
- Main content: "This is a regular message." (shown normally)
```

## Benefits

1. **Clean UI**: Think tags are no longer displayed as raw text
2. **Proper Separation**: Internal reasoning is visually separated from the main response
3. **Flexible Display**: Users can toggle think tokens visibility
4. **Better UX**: Clear distinction between agent's internal thoughts and their actual response
5. **Robust Parsing**: Handles think tags in any message type

## Visual Indicators

- **Regular messages**: Normal text styling
- **Thought messages**: Italic gray text with brain icon
- **Internal reasoning**: Amber-colored box with brain icon when think tokens are visible
- **Message types**: Different icons (MessageSquare vs Brain) to distinguish content types

## Files Modified

1. `src/components/DiscussionLog.tsx`
   - Enhanced `parseMessageContent` function
   - Updated message rendering logic
   - Added thought content indicator
   - Improved visual styling for different content types

2. `src/lib/DiscussionManager.ts`
   - Fixed linter error for persona expertise checking

## Testing

To verify the fix:
1. Start a discussion where LLMs generate responses with `<think>` tags
2. Check that think tags are not displayed as raw text
3. Toggle the "Show Think Tokens" setting to see internal reasoning
4. Verify that thought messages and regular messages are styled differently
5. Confirm that messages without think tags display normally 