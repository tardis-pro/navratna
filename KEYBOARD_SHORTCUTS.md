# 🎹 Council of Nycea - Keyboard Shortcuts Reference

## 🌐 Global Knowledge Management

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+K` | **Knowledge Search** | Open universal knowledge search dialog |
| `Ctrl+Shift+N` | **Global Upload** | Add knowledge (text or files) from anywhere |
| `Ctrl+B` | **Mini Browser** | Open mini browser portal |

## 🖥️ Desktop & Navigation

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Alt+Space` | **Quick Actions** | Open applications menu |
| `Ctrl+Shift+T` | **Toggle Shortcuts** | Show/hide shortcut bar |
| `Escape` | **Close All** | Close dialogs and reset state |

## 💬 Chat & Communication

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+Enter` | **Send Message** | Send chat message (in chat inputs) |
| `Ctrl+/` | **Agent Actions** | Open agent action menu (in chat) |

## 📝 Knowledge Portal Actions

### List View (Per Item)
- **📋 Copy** - Copy content to clipboard
- **📥 Download** - Download as text file
- **💬 Discuss** - Start multi-agent discussion  
- **✏️ Edit** - Modify knowledge item
- **🗑️ Delete** - Remove from knowledge base
- **👁️ Examine** - Open in atomic viewer

### Navigation
- **List Tab** - Minimal list view with actions
- **Graph Tab** - Knowledge graph visualization
- **Examine Tab** - Atomic detailed view

## 🔍 Knowledge Search & Examination

### Quick Access (`Ctrl+K`)
- **Real-time search** across all knowledge
- **Enter** - Search with current query
- **↑↓ Arrow keys** - Navigate results
- **Enter** - Examine selected item
- **Escape** - Close dialog

### Direct Examination Methods
1. **Via Quick Access**: `Ctrl+K` → Search → Click 👁️ Examine
2. **Via Portal**: Knowledge Portal → List → Click 👁️ Eye button
3. **Via Events**: `window.dispatchEvent(new CustomEvent('openKnowledgePortal', { detail: { itemId } }))`

## 📤 Global Upload (`Ctrl+Shift+N`)

### Text Note Mode
- **Title field** (optional) - Quick reference name
- **Content area** - Rich text content
- **Type selector** - Knowledge categorization
- **Tags field** - Comma-separated tags

### File Upload Mode  
- **Multiple file selection** - Batch upload support
- **Auto-categorization** - Smart type detection
- **Auto-tagging** - Extension and content-based tags
- **Supported formats**: `.txt`, `.md`, `.json`, `.csv`, `.js`, `.ts`, `.py`, `.java`, `.xml`, `.yml`, `.html`, `.css`, `.sql`, `.log`

## 🎯 Workflow Examples

### Daily Knowledge Capture
```
Reading article → Ctrl+Shift+N → Paste content → Tag → Upload
Code discovery → Ctrl+Shift+N → Paste code → Auto-tagged
Meeting notes → Ctrl+Shift+N → Type notes → Tag with date → Save
```

### Lightning Fast Lookup
```
Need info → Ctrl+K → Search term → Results appear → Examine
Reference check → Ctrl+K → Partial search → Browse results → Open
Documentation → Ctrl+K → "API docs" → Direct examination
```

### Knowledge Organization
```
Multiple files → Ctrl+Shift+N → Select files → Auto-processed
Related items → Ctrl+K → Search → Examine → View related
Cross-reference → Upload → Tag consistently → Search by tags
```

## 🔄 Integration Shortcuts

### Mini Browser → Knowledge
```
Mini Browser → Screenshot → Auto-saved to knowledge base
Tagged with "screenshot, web-capture" + custom tags
Access via Ctrl+K search like any knowledge item
```

### Discussion Integration
```
Ctrl+K → Find knowledge → Discuss button → Auto-context
Agents receive full knowledge context for discussions
```

### Agent Enhancement
```
Chat with agent → Agent accesses relevant knowledge automatically
Real-time knowledge integration during conversations
```

## 🚀 Power User Tips

### Keyboard-Only Workflows
- `Ctrl+K` → Type → Arrow keys → Enter → Examine → Esc → Close
- `Ctrl+Shift+N` → Type → Tab through fields → Enter → Save
- `Alt+Space` → Arrow keys → Enter → Open app

### Tagging Strategies  
- **Temporal tags**: `2024-q1`, `weekly-review`, `meeting-notes`
- **Project tags**: `project-alpha`, `feature-auth`, `bug-fix`
- **Priority tags**: `important`, `reference`, `shortcut`, `frequent`
- **Type tags**: `code`, `docs`, `research`, `template`

### Search Optimization
- **Specific terms** for exact matches
- **Partial words** for broader results  
- **Tag searches** for categorized results
- **Content searches** for text within items

## 📖 Quick Reference Card

**Most Used:**
- `Ctrl+K` - Knowledge Search
- `Ctrl+Shift+N` - Add Knowledge  
- `Alt+Space` - Quick Actions
- `Escape` - Close Everything

**Knowledge Actions:**
- 📋 Copy | 📥 Download | 💬 Discuss | ✏️ Edit | 🗑️ Delete | 👁️ Examine

**Upload Types:**
- Text Notes | File Upload | Auto-categorization | Batch Processing

**Examination:**
- Quick Preview | Portal List | Atomic Viewer | Graph Visualization

---

*Press `Alt+Space` and look for "Shortcuts" to see this reference in-app!*