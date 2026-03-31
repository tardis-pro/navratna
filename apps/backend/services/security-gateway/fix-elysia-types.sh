#!/bin/bash

# Script to add type annotations to all Elysia handler files

HTTP_DIR="/home/pronit/workspace/tardis/navratna/backend/services/security-gateway/src/http"

# Add import statement to each .elysia.ts file
for file in "$HTTP_DIR"/*.elysia.ts; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")

        # Skip if already has the import
        if grep -q "import type.*elysia-context" "$file"; then
            echo "Skipping $filename - already has import"
            continue
        fi

        # Find the last import statement and add our import after it
        # Use sed to add the import after the last import line
        awk '
            /^import/ { lastImport=NR; line[NR]=$0; next }
            { line[NR]=$0 }
            END {
                for (i=1; i<=NR; i++) {
                    print line[i]
                    if (i == lastImport) {
                        print "import type { RequiredAuthContext, OptionalAuthContext } from '\''./types/elysia-context.js'\'';"
                    }
                }
            }
        ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"

        echo "Added import to $filename"
    fi
done

echo "Done adding imports!"
