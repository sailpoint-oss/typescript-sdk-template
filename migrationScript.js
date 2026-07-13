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
 *    • Collapses the old per-version API class names to the single
 *      un-versioned class that 2.0 exports (the versioned names no longer
 *      exist as exports):
 *        TransformsBetaApi    → TransformsApi
 *        AccountsV2024Api     → AccountsApi
 *        EntitlementsV2025Api → EntitlementsApi
 *      NERM classes (…NERMApi / …NERMV2025Api) are left untouched — they
 *      remain distinct top-level exports in 2.0.
 *    • Adds a version suffix to method calls/references made on an API
 *      instance, because 2.0 method names carry the version:
 *        api.listAccounts(   → api.listAccountsV1(
 *        api.listTransforms  → api.listTransformsV1   (method references too)
 *      Only variables assigned from `new XxxApi(...)` in the same file are
 *      touched, so ordinary JS (Map.set, regex.test, "".search, …) is safe.
 *      NERM instances are excluded — NERM methods are not versioned.
 *
 * The 2.0 classes are exported both at the top level (`AccountsApi`) and under
 * the `SailPoint` namespace (`SailPoint.AccountsApi`) — they are the same
 * object. This script keeps whichever form your code already uses; it does not
 * force the namespace form.
 *
 * After running, run `npm install` to pull in the new package version.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(process.argv[2] || '.');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt']);
const PKG       = 'sailpoint-api-client';

let scanned = 0;
let changed = 0;

// A SailPoint API class identifier, e.g. AccountsApi, TransformsBetaApi.
const API_CLASS_RE = /^[A-Z][A-Za-z0-9]*Api$/;
// NERM classes keep their versioned name (…NERMApi, …NERMV2025Api).
const NERM_CLASS_RE = /NERM(?:V\d{4})?Api$/;
// A versioned core class name to collapse: base + (Beta|V2024|…) + Api.
const VERSIONED_CLASS_RE = /\b([A-Z][A-Za-z0-9]*?)(?:Beta|V\d{4})Api\b/g;
// Method already carries a version suffix (idempotency guard).
const VERSIONED_METHOD_RE = /V\d+$/;
// Verb prefixes used by SailPoint API methods — only used to tell a method
// reference apart from a plain property access (e.g. `api.defaultHeaders`).
const API_VERB_RE = /^(list|get|create|update|delete|patch|put|post|submit|cancel|approve|reject|enable|disable|reset|search|send|import|export|download|upload|validate|test|run|generate|check|sync|refresh|complete|forward|acknowledge|bulk|set|invoke|unlock|lock)/;

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

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bumpPackageJson(text) {
    try {
        const pkg = JSON.parse(text);
        let bumped = false;
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (pkg[section] && pkg[section][PKG]) {
                pkg[section][PKG] = '^2.0.0';
                bumped = true;
            }
        }
        // Preserve 2-space indent + trailing newline.
        return bumped ? JSON.stringify(pkg, null, 2) + '\n' : text;
    } catch {
        // Not valid JSON — leave unchanged.
        return text;
    }
}

// Collapse versioned core class names to their un-versioned 2.0 equivalent,
// everywhere they appear (imports, `new`, type annotations, bare references).
// NERM classes are preserved.
function collapseClassNames(text) {
    return text.replace(VERSIONED_CLASS_RE, (match, base) => {
        if (/NERM$/.test(base)) return match; // e.g. DelegationsNERMV2025Api
        return `${base}Api`;
    });
}

// Remove duplicate named imports that collapsing may have produced, e.g.
//   import { AccountsApi, AccountsBetaApi } → import { AccountsApi, AccountsApi }
// becomes `import { AccountsApi }`.
function dedupeImports(text) {
    const importRe = new RegExp(
        `import(\\s+type)?\\s*\\{([^}]*)\\}\\s*from\\s*(["'])${escapeRe(PKG)}\\3`,
        'g'
    );
    return text.replace(importRe, (match, typeKw, names, quote) => {
        const seen = new Set();
        const kept = [];
        for (const raw of names.split(',')) {
            const name = raw.trim();
            if (!name) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            kept.push(name);
        }
        return `import${typeKw || ''} { ${kept.join(', ')} } from ${quote}${PKG}${quote}`;
    });
}

// Discover variables assigned from `new XxxApi(...)` (optionally namespaced as
// `new SailPoint.XxxApi(...)`). Returns a Set of variable names that are
// non-NERM API instances — the only variables whose methods we version.
function findApiInstanceVars(text) {
    const vars = new Set();
    const re = /(\w+)\s*=\s*new\s+(?:SailPoint\.)?([A-Z][A-Za-z0-9]*Api)\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const [, varName, className] = m;
        if (!API_CLASS_RE.test(className)) continue;
        if (NERM_CLASS_RE.test(className)) continue; // NERM methods are not versioned
        vars.add(varName);
    }
    return vars;
}

// Add the V1 version suffix to method calls and references made on a tracked
// API instance variable.
function versionApiMethods(text, vars) {
    if (vars.size === 0) return text;
    const alt = [...vars].map(escapeRe).join('|');

    let out = text;

    // Method calls: <var>.method( → <var>.methodV1(
    // Lookahead keeps the "(" (and any whitespace) out of the match.
    const callRe = new RegExp(`\\b(${alt})\\.([A-Za-z][A-Za-z0-9]*)(?=\\s*\\()`, 'g');
    out = out.replace(callRe, (match, varName, method) => {
        if (VERSIONED_METHOD_RE.test(method)) return match; // already versioned
        return `${varName}.${method}V1`;
    });

    // Method references (passed around, not called): <var>.method
    // Negative lookahead excludes calls (handled above). The verb check avoids
    // versioning plain property accesses such as `api.basePath`.
    const refRe = new RegExp(`\\b(${alt})\\.([A-Za-z][A-Za-z0-9]*)\\b(?!\\s*\\()`, 'g');
    out = out.replace(refRe, (match, varName, method) => {
        if (VERSIONED_METHOD_RE.test(method)) return match;
        if (!API_VERB_RE.test(method)) return match;
        return `${varName}.${method}V1`;
    });

    return out;
}

function applyReplacements(text, file) {
    if (path.basename(file) === 'package.json') {
        return bumpPackageJson(text);
    }

    let out = text;
    out = collapseClassNames(out);
    out = dedupeImports(out);
    out = versionApiMethods(out, findApiInstanceVars(out));
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

// Exported for tests; only runs the migration when invoked directly.
module.exports = { applyReplacements };

if (require.main === module) {
    console.log(`\nSailPoint typescript-sdk 1.x → 2.0 migration`);
    console.log(`Target: ${ROOT}\n`);

    walk(ROOT);

    console.log(`\n${changed} file(s) changed out of ${scanned} scanned.\n`);

    console.log(`Manual review required
══════════════════════
1. Version suffix (V1 vs V2)
   Method names now carry a version suffix; this script appends V1, which is
   correct for the vast majority of endpoints. A few operations also have a V2
   partition — e.g. provisioning policies (SourcesApi), workflow execution
   history, and access-request config. If you rely on those, change V1 → V2
   where appropriate.

2. Cross-file API instances
   Only methods called on a variable assigned from \`new XxxApi(...)\` in the
   SAME file are versioned. If you pass an API client between files/functions,
   add the version suffix on those calls manually.

3. Model / type names
   Only class names ending in \`Api\` are collapsed. Model types (e.g.
   \`SearchV2024\`, \`AccountV2025\`) are left as-is; verify any that changed or
   were removed in 2.0 against the TypeScript compiler output.

4. Run \`npm install\` to pull the new package version after applying this
   migration, then \`tsc --noEmit\` (or your build) to catch anything above.
`);
}
