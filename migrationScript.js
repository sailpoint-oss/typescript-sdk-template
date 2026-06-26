#!/usr/bin/env node
/**
 * Migration script: sailpoint-api-client 1.x → 2.0
 *
 * Run from any directory:
 *   node migrationScript.js [target-directory]
 *
 * If no target directory is supplied the script processes the current
 * working directory recursively.
 *
 * What this script changes
 * ────────────────────────
 *  package.json
 *    • Bumps sailpoint-api-client to ^2.0.0
 *
 *  *.ts / *.js files
 *    • Renames Beta and V2025 API class references to their versioned
 *      equivalents via the SailPoint namespace
 *        TransformsBetaApi       → SailPoint.TransformsApi
 *        GovernanceGroupsBetaApi → SailPoint.GovernanceGroupsApi
 *        EntitlementsV2025Api    → SailPoint.EntitlementsApi
 *        (and all other *BetaApi / *V2025Api classes)
 *    • Adds the V1 suffix to unversioned API method calls
 *        api.listAccounts(   → api.listAccountsV1(
 *        api.listTransforms  → api.listTransformsV1   (method references too)
 *
 * After running, run `npm install` to pull in the new package version.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(process.argv[2] || '.');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt']);

let scanned = 0;
let changed = 0;

// Verb prefixes used by SailPoint API methods (camelCase).
const API_VERB_RE = /^(list|get|create|update|delete|patch|submit|cancel|approve|reject|enable|disable|reset|search|send|import|export|download|upload|validate|test|run|generate|check|sync|refresh|complete|forward|acknowledge|bulk|set|invoke)/;

// ─── helpers ─────────────────────────────────────────────────────────────────

function walk(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(full);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'].includes(ext) || entry.name === 'package.json') {
                processFile(full);
            }
        }
    }
}

function stripBetaOrVersion(name) {
    // XxxBetaApi → XxxApi, XxxV2025Api → XxxApi
    return name.replace(/(?:Beta|V\d{4})Api$/, 'Api');
}

function applyReplacements(text, file) {
    const base = path.basename(file);
    let out = text;

    // ── package.json ──────────────────────────────────────────────────────────
    if (base === 'package.json') {
        try {
            const pkg = JSON.parse(out);
            let bumped = false;

            for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
                if (pkg[section] && pkg[section]['sailpoint-api-client']) {
                    pkg[section]['sailpoint-api-client'] = '^2.0.0';
                    bumped = true;
                }
            }

            if (bumped) {
                // Preserve formatting (2-space indent)
                out = JSON.stringify(pkg, null, 2) + '\n';
            }
        } catch {
            // Not valid JSON, fall through unchanged
        }
        return out;
    }

    // ── TypeScript / JavaScript source files ──────────────────────────────────

    // 1. Rename *BetaApi and *V2025Api class usages.
    //    new TransformsBetaApi(cfg) → new SailPoint.TransformsApi(cfg)
    //    new EntitlementsV2025Api(cfg) → new SailPoint.EntitlementsApi(cfg)
    //
    //    This handles both `new XxxBetaApi(` and bare references like
    //    `XxxBetaApi` in import lists.
    out = out.replace(
        /\bnew ([A-Z][a-zA-Z]+(?:Beta|V\d{4})Api)\b/g,
        (_, cls) => `new SailPoint.${stripBetaOrVersion(cls)}`
    );

    // Remove Beta/V2025 Api classes from named imports since they are now
    // accessed via the SailPoint namespace.
    // e.g. import { TransformsBetaApi, Configuration } from "sailpoint-api-client"
    //   →  import { Configuration } from "sailpoint-api-client"
    out = out.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']sailpoint-api-client["']/g,
        (match, imports) => {
            const cleaned = imports
                .split(',')
                .map(s => s.trim())
                .filter(s => !s.match(/^[A-Z][a-zA-Z]+(?:Beta|V\d{4})Api$/))
                .join(', ');
            return `import { ${cleaned} } from "sailpoint-api-client"`;
        }
    );

    // 2. Add V1 suffix to unversioned API method calls.
    //    Handles both call expressions (.method() ) and method references
    //    (.method without immediate parenthesis, e.g. passed to Paginator.paginate).
    //
    //    Pattern: .camelCaseVerb[...rest]  where it is not already versioned.

    // Method calls: .listAccounts( → .listAccountsV1(
    out = out.replace(
        /\.([a-z][a-zA-Z]*)(\()/g,
        (match, method, paren) => {
            if (/V\d+$/.test(method)) return match;
            if (!API_VERB_RE.test(method)) return match;
            // Exclude Paginator helpers
            if (/^(paginate|paginateSearchApi|paginateGenerator|paginateSearchApiGenerator)$/.test(method)) return match;
            return `.${method}V1${paren}`;
        }
    );

    // Method references: api.listAccounts, → api.listAccountsV1,
    // (not followed by '(' – those were already handled above)
    out = out.replace(
        /(\bapi\.)([a-z][a-zA-Z]*)(?!\(|V\d)/g,
        (match, prefix, method) => {
            if (/V\d+$/.test(method)) return match;
            if (!API_VERB_RE.test(method)) return match;
            if (/^(paginate|paginateSearchApi|paginateGenerator|paginateSearchApiGenerator)$/.test(method)) return match;
            return `${prefix}${method}V1`;
        }
    );

    return out;
}

function processFile(file) {
    scanned++;
    let original;
    try {
        original = fs.readFileSync(file, 'utf8');
    } catch {
        return;
    }

    const updated = applyReplacements(original, file);

    if (updated !== original) {
        fs.writeFileSync(file, updated, 'utf8');
        console.log(`  updated  ${path.relative(ROOT, file)}`);
        changed++;
    }
}

// ─── main ────────────────────────────────────────────────────────────────────

console.log(`\nSailPoint typescript-sdk 1.x → 2.0 migration`);
console.log(`Target: ${ROOT}\n`);

walk(ROOT);

console.log(`\n${changed} file(s) changed out of ${scanned} scanned.\n`);

console.log(`Manual review required
══════════════════════
1. SailPoint namespace import
   If your code did not previously import \`SailPoint\` from sailpoint-api-client,
   add it to your import statement:
     import { SailPoint, Configuration, Paginator } from "sailpoint-api-client"

2. Beta/V2025 API class imports
   Imports of *BetaApi and *V2025Api classes have been removed from the
   import list (they are now accessed via SailPoint.XxxApi).
   Verify your import statements still include everything else you need.

3. Type references (model types)
   If you used types like \`Search\`, \`Account\`, etc. from the old package,
   they remain available but some beta-only types may have moved.
   Check any TypeScript type errors after running the migration.

4. Paginator method signatures
   \`Paginator.paginate\` now expects versioned method references:
     Paginator.paginate(api, api.listAccountsV1, { limit: 100 }, 1000)
   Verify any paginator calls were updated correctly.

5. Run \`npm install\` to pull the new package version after applying this migration.
`);
