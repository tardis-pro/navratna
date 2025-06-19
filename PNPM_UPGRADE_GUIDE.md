# PNPM Upgrade Guide for Catalogs Support

## Current Issue

You're currently running PNPM v8.15.0, but **PNPM Catalogs require PNPM v9.0.0 or higher**.

The error you're seeing:
```
ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER @types/node@catalog:frontend isn't supported by any available resolver.
```

This happens because the `catalog:` protocol is not recognized in PNPM v8.x.

## Solution 1: Upgrade PNPM (Recommended)

### Global Upgrade
```bash
# Using npm
npm install -g pnpm@latest

# Using corepack (recommended)
corepack enable
corepack prepare pnpm@latest --activate

# Verify the upgrade
pnpm --version  # Should show 9.x or higher
```

### After upgrading, install dependencies:
```bash
pnpm install
```

## Solution 2: Use .nvmrc and package.json engines (Team consistency)

Create a `.nvmrc` file to specify Node version and update package.json:

**.nvmrc:**
```
20.18.0
```

**package.json (root):**
```json
{
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

Then team members can use:
```bash
corepack enable
pnpm install
```

## Solution 3: Temporary Fallback (Current PNPM v8)

If you can't upgrade immediately, I can revert the catalog changes and create a dependency management script instead:

```bash
# Revert to hardcoded versions
git checkout HEAD~1 -- pnpm-workspace.yaml packages/ apps/frontend/package.json backend/services/orchestration-pipeline/package.json

# Use the migration script to sync versions instead
node scripts/sync-versions.js
```

## Benefits of Upgrading to PNPM v9+

1. **Catalogs support** - Centralized dependency management
2. **Better performance** - Improved resolution algorithms
3. **Enhanced security** - Better lockfile validation
4. **New features** - Latest workspace improvements

## Migration Steps (After PNPM Upgrade)

1. **Upgrade PNPM:**
```bash
npm install -g pnpm@latest
pnpm --version  # Verify 9.x+
```

2. **Install dependencies:**
```bash
pnpm install
```

3. **Verify catalogs work:**
```bash
pnpm list --depth=0
```

4. **Run migration script for remaining packages:**
```bash
node scripts/migrate-to-catalogs.js
```

## Troubleshooting

### If you see cache issues after upgrade:
```bash
pnpm store prune
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

### If team members have different PNPM versions:
Add to your CI/CD and README:
```bash
# Check PNPM version
pnpm --version

# If < 9.0.0, upgrade:
corepack enable
corepack prepare pnpm@latest --activate
```

## Alternative: Version Sync Script (No Catalogs)

If catalogs aren't suitable for your workflow, I can create a script that:
1. Maintains a central version registry
2. Automatically syncs versions across packages
3. Validates version consistency
4. Works with any PNPM version

Would you like me to create this alternative approach?

## Recommendation

**Upgrade to PNPM v9+** for the best developer experience. The catalog system will significantly improve your monorepo's dependency management. 