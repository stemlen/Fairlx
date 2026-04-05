#!/bin/bash

# ==============================================================================
# Fairlx GitHub Config Cleaner
# 
# Usage: ./scripts/ci/github-cleanup.sh [.env.local] [--all] [--dry-run] [--repo=owner/repo]
# 
# Options:
#   --all       Delete all secrets and variables from the repository.
#   --dry-run   Show what would be deleted without actually deleting it.
#   --repo=X    Specify the repository (default: auto-detected).


# # Preview what would be deleted (safe)
# ./scripts/ci/github-cleanup.sh --dry-run

# # Delete secrets/variables from .env.local
# ./scripts/ci/github-cleanup.sh

# # Wipe all secrets and variables in the repository
# ./scripts/ci/github-cleanup.sh --all


# ==============================================================================

ENV_FILE=""
DRY_RUN=false
ALL_MODE=false
TARGET_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --all) ALL_MODE=true ;;
        --dry-run) DRY_RUN=true ;;
        --repo=*) TARGET_REPO="${1#*=}" ;;
        *) 
            if [[ -z "$ENV_FILE" && ! "$1" =~ ^-- ]]; then
                ENV_FILE="$1"
            fi
            ;;
    esac
    shift
done

# Default to .env.local if not in ALL_MODE and no file specified
if [ "$ALL_MODE" = false ] && [ -z "$ENV_FILE" ]; then
    ENV_FILE=".env.local"
fi

if [ -z "$TARGET_REPO" ]; then
    echo "❌ Error: Could not detect GitHub repository. Please run inside a git repo or use --repo=owner/repo"
    exit 1
fi

echo "📦 Target Repository: $TARGET_REPO"

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN: No changes will be applied."
fi

if [ "$ALL_MODE" = true ]; then
    echo "🗑️  Mode: Repository-wide cleanup (Deleting ALL secrets and variables)"
    SECRETS=$(gh secret list --repo "$TARGET_REPO" --json name -q '.[].name' 2>/dev/null)
    VARS=$(gh variable list --repo "$TARGET_REPO" --json name -q '.[].name' 2>/dev/null)
else
    if [ ! -f "$ENV_FILE" ]; then
        echo "❌ Error: File $ENV_FILE not found. If you want to delete all, use --all"
        exit 1
    fi
    echo "🗑️  Mode: File-based cleanup ($ENV_FILE)"
    # Extract keys from .env file
    SECRETS=$(grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | cut -d'=' -f1)
    VARS=$SECRETS
fi

# Cleanup Secrets
echo "--- Secrets ---"
if [ -z "$SECRETS" ]; then
    echo "No secrets found to delete."
else
    for key in $SECRETS; do
        if [ "$DRY_RUN" = true ]; then
            echo "🔍 [DRY RUN] Would delete secret: $key"
        else
            echo "🗑️ Deleting Secret: $key"
            gh secret delete "$key" --repo "$TARGET_REPO" 2>/dev/null || echo "⚠️ Secret $key not found."
        fi
    done
fi

# Cleanup Variables
echo "--- Variables ---"
if [ -z "$VARS" ]; then
    echo "No variables found to delete."
else
    for key in $VARS; do
        if [ "$DRY_RUN" = true ]; then
            echo "🔍 [DRY RUN] Would delete variable: $key"
        else
            echo "🗑️ Deleting Variable: $key"
            gh variable delete "$key" --repo "$TARGET_REPO" 2>/dev/null || echo "⚠️ Variable $key not found."
        fi
    done
fi

echo "✅ Cleanup complete!"
