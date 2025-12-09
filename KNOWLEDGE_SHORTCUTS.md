# Knowledge Management Shortcuts & Global Upload

The Council of Nycea platform now includes global knowledge management capabilities with keyboard shortcuts for quick access and streamlined workflows.

## ✅ Global Upload System

### **Access Methods:**

- **Keyboard Shortcut**: `Ctrl+Shift+N` (or `Cmd+Shift+N` on Mac)
- **From any screen** - works system-wide

### **Upload Types:**

1. **Text Notes**: Create knowledge from typed content
   - Optional title field
   - Rich content textarea
   - Knowledge type selection (Factual, Procedural, Conceptual, etc.)
   - Custom tags

2. **File Upload**: Upload multiple files at once
   - Supports: `.txt`, `.md`, `.json`, `.csv`, `.js`, `.ts`, `.py`, `.java`, `.xml`, `.yml`, `.html`, `.css`, `.sql`, `.log`
   - **Auto-detection**: File type automatically determines knowledge type
   - **Auto-tagging**: Files get tagged with extension and content type
   - **Batch processing**: Upload multiple files simultaneously

### **Features:**

- **Progress tracking** with visual progress bar
- **Smart categorization** based on file type
- **Automatic metadata** generation
- **Tag management** with custom tags
- **Error handling** for individual files

## ✅ Knowledge Quick Access System

### **Access Methods:**

- **Keyboard Shortcut**: `Ctrl+K` (or `Cmd+K` on Mac)
- **From any screen** - global search and examination

### **Features:**

#### **Search & Filter:**

- **Real-time search** across all knowledge items
- **Content matching** searches within knowledge content
- **Tag filtering** and metadata search
- **Live results** as you type

#### **Quick Examination:**

- **Direct examination** - click any item to open in detailed view
- **Preview content** with truncated display
- **Metadata display** - type, confidence, tags, dates
- **Related items** suggestions

#### **Actions per Item:**

- **👁️ Examine** - Open in detailed atomic viewer
- **🔗 Open in Portal** - Navigate to Knowledge Portal with item selected

## ✅ Direct Knowledge Examination

### **Creating Shortcuts to Specific Knowledge:**

#### **Method 1: From Knowledge Shortcut Dialog**

1. Press `Ctrl+K` to open Knowledge Quick Access
2. Search for your item or browse the list
3. Click the **👁️ Examine** button
4. Knowledge opens in full-screen modal with atomic viewer

#### **Method 2: From Knowledge Portal**

1. Open Knowledge Portal application
2. Find your item in the list
3. Click the **👁️ (Eye)** action button
4. Switches to "Examine" tab with atomic viewer

#### **Method 3: Via Event System (For Developers)**

```typescript
// Trigger from anywhere in the application
window.dispatchEvent(
  new CustomEvent('openKnowledgePortal', {
    detail: { itemId: 'knowledge-item-id' },
  })
);
```

### **Atomic Knowledge Viewer Features:**

- **Full content display** with syntax highlighting
- **3 focused tabs**: Content, Related, Details
- **Clean interface** - no clutter, content-first
- **Related items** with enhanced previews
- **Key terms extraction** and analysis
- **Metadata only when needed** - hidden by default

## ✅ Global Keyboard Shortcuts

| Shortcut       | Action           | Description                          |
| -------------- | ---------------- | ------------------------------------ |
| `Ctrl+K`       | Knowledge Search | Open knowledge quick access dialog   |
| `Ctrl+Shift+N` | Global Upload    | Open upload dialog for files or text |
| `Alt+Space`    | Quick Actions    | Open applications menu               |
| `Ctrl+Shift+T` | Toggle Shortcuts | Show/hide shortcut bar               |
| `Escape`       | Close All        | Close dialogs and reset state        |

## ✅ Usage Examples

### **Daily Knowledge Capture:**

```
1. Reading an article → Ctrl+Shift+N → Paste content → Tag "research" → Upload
2. Code snippet → Ctrl+Shift+N → Upload .js file → Auto-tagged "js, code"
3. Meeting notes → Ctrl+Shift+N → Type notes → Tag "meeting, planning" → Save
```

### **Quick Knowledge Lookup:**

```
1. Need specific info → Ctrl+K → Search "API documentation" → Examine
2. Looking for code → Ctrl+K → Search "authentication" → Open in Portal
3. Find related items → Ctrl+K → Select item → View related knowledge
```

### **Creating Knowledge Shortcuts:**

```
1. Important reference → Ctrl+K → Find item → Note the ID
2. Create bookmark → Ctrl+Shift+N → Add "Shortcut to [ItemTitle]" → Link to ID
3. Quick access → Ctrl+K → Search "shortcut" → Direct examination
```

## ✅ Integration with Existing Features

### **Seamless Portal Integration:**

- **Knowledge Portal**: All uploaded items appear in the list view
- **Discussion System**: Knowledge items can be discussed via the "Discuss" action
- **Agent Chat**: Agents can access uploaded knowledge during conversations
- **Artifact Generation**: Knowledge can be used to generate documents, code, etc.

### **Multi-Modal Support:**

- **Desktop Upload**: System-wide upload capability
- **Portal Upload**: Removed to avoid duplication - use global system
- **Drag & Drop**: Still available in Knowledge Portal for convenience
- **File Management**: Upload once, access everywhere

### **Knowledge Examination Modes:**

- **Quick Preview**: In shortcut dialog for fast browsing
- **Portal View**: List view with 5 actions (copy, download, discuss, edit, delete)
- **Atomic Examination**: Full-screen detailed view with analysis
- **Graph Visualization**: Relationship mapping and connections

## ✅ Best Practices

### **Effective Tagging:**

- Use **consistent naming** conventions
- Include **project names**, **domains**, **priority levels**
- Add **temporal tags** like "2024-q1", "weekly-review"
- Use **hierarchical tags** like "coding.javascript.react"

### **Knowledge Organization:**

- **Regular uploads** for better searchability
- **Descriptive content** rather than just file names
- **Cross-reference** related items in content
- **Clean up** outdated knowledge periodically

### **Shortcut Efficiency:**

- **Memorize shortcuts** for daily workflows
- **Search patterns** - use specific terms for better results
- **Examine frequently** - build familiarity with atomic viewer
- **Create mental maps** of your knowledge structure

The global upload and shortcut system transforms knowledge management from a portal-specific activity into a seamless, system-wide capability accessible from anywhere in the platform.
