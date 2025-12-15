#!/usr/bin/env python3
import re
import sys
from pathlib import Path

def add_type_to_handler(content):
    """Add type annotations to Elysia handler functions"""

    # Pattern to match async handler functions without type annotations
    # Matches: async ({ param1, param2, ... }) =>
    # Does not match if already has type annotation (: SomeType)
    pattern = r'async\s*\(\s*\{\s*([^}]+)\s*\}\s*\)\s*=>'

    def replace_handler(match):
        params = match.group(1).strip()
        # Check if params already have type annotation
        if ':' not in match.group(0):
            # Determine auth type based on presence of 'user' parameter
            if 'user' in params:
                return f'async ({{ {params} }}: RequiredAuthContext) =>'
            else:
                return f'async ({{ {params} }}: OptionalAuthContext) =>'
        return match.group(0)

    return re.sub(pattern, replace_handler, content)

def add_import_if_missing(content):
    """Add import statement if it doesn't exist"""

    if "import type" in content and "elysia-context" in content:
        return content  # Already has the import

    # Find the last import statement
    import_lines = []
    other_lines = []
    in_imports = True

    for line in content.split('\n'):
        if line.startswith('import '):
            import_lines.append(line)
        elif line.strip() and in_imports:
            in_imports = False
            # Add our import after all imports
            import_lines.append("import type { RequiredAuthContext, OptionalAuthContext } from './types/elysia-context.js';")
            other_lines.append(line)
        else:
            other_lines.append(line)

    return '\n'.join(import_lines + other_lines)

def main():
    http_dir = Path("/home/pronit/workspace/tardis/navratna/backend/services/security-gateway/src/http")

    # List of files to fix (excluding providers and auth which are already done)
    files_to_fix = [
        "knowledge.elysia.ts",
        "approval.elysia.ts",
        "security.elysia.ts",
        "oauth.elysia.ts",
        "audit.elysia.ts",
        "tool-preferences.elysia.ts",
        "contacts.elysia.ts",
        "persona.elysia.ts",
        "projects.elysia.ts",
    ]

    for filename in files_to_fix:
        filepath = http_dir / filename
        if not filepath.exists():
            print(f"Skipping {filename} - file not found")
            continue

        print(f"Processing {filename}...")

        with open(filepath, 'r') as f:
            content = f.read()

        # Add import
        content = add_import_if_missing(content)

        # Add type annotations to handlers
        content = add_type_to_handler(content)

        with open(filepath, 'w') as f:
            f.write(content)

        print(f"  ✓ Fixed {filename}")

    print("\nDone!")

if __name__ == "__main__":
    main()
