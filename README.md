# SailPoint TypeScript SDK Template

A template project for the [SailPoint TypeScript SDK](https://developer.sailpoint.com/docs/tools/sdk/typescript/). It is initialized using the [SailPoint CLI](https://developer.sailpoint.com/docs/tools/cli) and provides working examples of common Identity Security Cloud API calls using the TypeScript SDK.

## Prerequisites

- **Node.js** ([download](https://nodejs.org/en/download))
- **SailPoint CLI** installed and configured ([installation guide](https://developer.sailpoint.com/docs/tools/cli))
- A SailPoint Identity Security Cloud tenant
- A **Personal Access Token (PAT)** with a client ID and client secret ([creating a PAT](https://developer.sailpoint.com/docs/api/authentication#personal-access-tokens))

## Getting Started

### 1. Create the project

Use the SailPoint CLI to create a new project from this template:

```bash
sail sdk init typescript ts-example
```

### 2. Navigate into the project

```bash
cd ts-example
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure the SDK

The SDK needs credentials to authenticate with your SailPoint tenant. Generate a `config.json` file using the CLI:

```bash
sail sdk init config
```

If you have multiple environments configured in the CLI, specify which one to use:

```bash
sail sdk init config --env devrel
```

This creates a `config.json` in the project directory:

```json
{
  "ClientId": "your-client-id",
  "ClientSecret": "your-client-secret",
  "BaseURL": "https://[tenant].api.identitynow.com"
}
```

You can also use environment variables (`SAIL_BASE_URL`, `SAIL_CLIENT_ID`, `SAIL_CLIENT_SECRET`) instead of a config file.

> **Tip:** Add `config.json` to your `.gitignore` so credentials are not committed to version control.

### 5. Run the project

```bash
npm start
```

To build then run: `npm run build` then `node build/index.js`.

## What's Included

The starter `src/index.ts` file demonstrates common SDK operations:

| Topic           | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| Configuration   | Initialize the API configuration (requests a token using your credentials) |
| `TransformsApi` | Call `listTransforms()` to fetch transforms from your tenant               |

Edit `src/index.ts` to call other SailPoint APIs.

## Customization

- **Change the API** — swap `TransformsApi` for another API such as `AccountsApi` or `SourcesApi`.
- **Change the method** — swap `listTransforms()` for other methods on the API client.
- See the [Getting Started guide](https://developer.sailpoint.com/docs/tools/sdk/typescript/getting-started) for more examples.

## Resources

- [TypeScript SDK Documentation](https://developer.sailpoint.com/docs/tools/sdk/typescript/)
- [TypeScript SDK Getting Started Guide](https://developer.sailpoint.com/docs/tools/sdk/typescript/getting-started)
- [SailPoint CLI Documentation](https://developer.sailpoint.com/docs/tools/cli)
- [Identity Security Cloud API Reference](https://developer.sailpoint.com/docs/api/)
- [SailPoint Developer Community](https://developer.sailpoint.com/discuss)
