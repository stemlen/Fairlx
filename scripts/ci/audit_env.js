// Usage : node ./scripts/ci/audit_env.js

const fs = require('fs');

const deployYml = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const envLocal = fs.readFileSync('.env.local', 'utf8');

// Extraction for deploy.yml: Find all ${{ secrets.NAME }} and ${{ vars.NAME }}
const workflowMatches = deployYml.matchAll(/\$\{\{\s+(secrets|vars)\.([A-Z0-9_]+)\s+\}\}/g);
const requiredKeys = new Set();
for (const match of workflowMatches) {
    requiredKeys.add(match[2]);
}

// Extraction for .env.local: Find all lines starting with NAME=VALUE
const envLines = envLocal.split('\n');
const providedKeys = new Set();
for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 1) {
            providedKeys.add(parts[0].trim());
        }
    }
}

const missingKeys = [...requiredKeys].filter(key => !providedKeys.has(key));

console.log('--- AUDIT RESULTS ---');
if (missingKeys.length === 0) {
    console.log('✅ ALL OK: Everything in deploy.yml is present in .env.local');
} else {
    console.log('❌ MISSING in .env.local:');
    missingKeys.forEach(key => console.log(`- ${key}`));
}