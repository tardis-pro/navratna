# PNPM Catalogs Implementation

This document explains how we've implemented PNPM Catalogs to standardize dependency management across our monorepo.

## Overview

PNPM Catalogs allow us to define dependency versions once in `pnpm-workspace.yaml` and reference them across all packages using the `catalog:` protocol. This provides several benefits:

- **Maintain unique versions** - Ensures only one version of each dependency across the workspace
- **Easier upgrades** - Update dependency versions in one place
- **Fewer merge conflicts** - No need to update multiple `package.json` files
- **Better consistency** - Prevents version drift between packages

## Catalog Structure

We've organized our catalogs into four categories:

### 1. Default Catalog (`catalog:`)

Contains shared dependencies used across all packages:

```yaml
catalog:
  typescript: ^5.8.3
  zod: ^3.25.67
  eslint: ^9.29.0
  rimraf: ^6.0.1
  "@typescript-eslint/eslint-plugin": ^8.34.1
  "@typescript-eslint/parser": ^8.34.1
```

**Usage in package.json:**
```json
{
  "devDependencies": {
    "typescript": "catalog:",
    "eslint": "catalog:"
  }
}
```

### 2. Frontend Catalog (`catalog:frontend`)

Contains React ecosystem and frontend-specific dependencies:

```yaml
catalogs:
  frontend:
    react: ^19.1.0
    react-dom: ^19.1.0
    "@types/react": ^19.1.8
    "@radix-ui/react-dialog": ^1.1.14
    # ... other frontend deps
```

**Usage in package.json:**
```json
{
  "dependencies": {
    "react": "catalog:frontend",
    "react-dom": "catalog:frontend"
  }
}
```

### 3. Backend Catalog (`catalog:backend`)

Contains Express, Node.js, and backend-specific dependencies:

```yaml
catalogs:
  backend:
    express: ^5.1.0
    "@types/express": ^5.0.3
    typeorm: ^0.3.24
    "@types/node": ^22.18.2
    # ... other backend deps
```

**Usage in package.json:**
```json
{
  "dependencies": {
    "express": "catalog:backend",
    "typeorm": "catalog:backend"
  }
}
```

### 4. Dev Catalog (`catalog:dev`)

Contains development tools and testing dependencies:

```yaml
catalogs:
  dev:
    esbuild: ^0.24.2
    vite: ^6.0.7
    vitest: ^2.2.1
    prettier: ^3.4.2
    # ... other dev deps
```

**Usage in package.json:**
```json
{
  "devDependencies": {
    "vite": "catalog:dev",
    "vitest": "catalog:dev"
  }
}
```

## Migration Process

### Automated Migration

We've provided a migration script to automatically convert existing packages:

```bash
node scripts/migrate-to-catalogs.js
```

This script will:
1. Scan all `package.json` files in the monorepo
2. Replace hardcoded versions with catalog references
3. Show a summary of changes made

### Manual Migration

To manually convert a package:

1. **Identify dependencies** - Check which dependencies exist in our catalogs
2. **Replace versions** - Change version strings to catalog references
3. **Choose appropriate catalog** - Use the most specific catalog available

**Before:**
```json
{
  "dependencies": {
    "react": "^19.1.0",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

**After:**
```json
{
  "dependencies": {
    "react": "catalog:frontend",
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:"
  }
}
```

## Adding New Dependencies

### To an Existing Catalog

1. **Update `pnpm-workspace.yaml`:**
```yaml
catalogs:
  backend:
    # Add new dependency
    new-package: ^1.0.0
```

2. **Use in packages:**
```json
{
  "dependencies": {
    "new-package": "catalog:backend"
  }
}
```

### Create a New Catalog

For specialized dependency groups:

```yaml
catalogs:
  testing:
    jest: ^29.0.0
    "@testing-library/react": ^14.0.0
```

## Best Practices

### 1. Catalog Selection Priority

Choose catalogs in this order:
1. **Most specific** - `catalog:frontend`, `catalog:backend`, `catalog:dev`
2. **Default** - `catalog:` for shared dependencies
3. **Direct version** - Only for package-specific requirements

### 2. Version Management

- **Keep catalogs minimal** - Only include commonly used dependencies
- **Update strategically** - Test updates across all affected packages
- **Document breaking changes** - Note any API changes in commit messages

### 3. Workspace Dependencies

Always use `workspace:*` for internal packages:

```json
{
  "dependencies": {
    "@uaip/types": "workspace:*",
    "react": "catalog:frontend"
  }
}
```

## Troubleshooting

### Common Issues

1. **Dependency not found in catalog**
   - Add to appropriate catalog in `pnpm-workspace.yaml`
   - Or use direct version if package-specific

2. **Version conflicts**
   - Check if dependency exists in multiple catalogs
   - Use most specific catalog available

3. **Build failures after migration**
   - Run `pnpm install` to update lockfile
   - Check for peer dependency issues

### Debugging Commands

```bash
# Check catalog resolution
pnpm list --depth=0

# Verify workspace structure
pnpm list --workspace-packages

# Check for duplicate dependencies
pnpm list --depth=1 | grep -E "^├─|^└─" | sort | uniq -d
```

## Publishing

When publishing packages, PNPM automatically replaces `catalog:` references with actual version numbers, similar to how `workspace:` protocol works.

**Development (package.json):**
```json
{
  "dependencies": {
    "react": "catalog:frontend"
  }
}
```

**Published (npm registry):**
```json
{
  "dependencies": {
    "react": "^19.1.0"
  }
}
```

## Maintenance

### Regular Tasks

1. **Monthly dependency updates**
   - Update catalog versions in `pnpm-workspace.yaml`
   - Test across all packages
   - Update lockfile with `pnpm install`

2. **Quarterly catalog review**
   - Remove unused dependencies from catalogs
   - Consolidate similar dependencies
   - Review catalog organization

3. **Version alignment checks**
   - Ensure no packages bypass catalogs unnecessarily
   - Check for version drift in direct dependencies

### Update Workflow

1. **Update catalog versions:**
```yaml
catalog:
  typescript: ^5.9.0  # Updated from ^5.8.3
```

2. **Install updates:**
```bash
pnpm install
```

3. **Test across packages:**
```bash
pnpm build
pnpm test
```

4. **Commit changes:**
```bash
git add pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: update TypeScript to v5.9.0"
```

## Benefits Realized

With PNPM Catalogs implemented, we now have:

- ✅ **Consistent versions** across all packages
- ✅ **Simplified dependency management** 
- ✅ **Reduced merge conflicts** in package.json files
- ✅ **Easier upgrades** with single-point updates
- ✅ **Better overview** of all dependencies in one place
- ✅ **Automated migration** for future changes

This system significantly improves our monorepo's maintainability and reduces the overhead of dependency management across our growing number of packages. 