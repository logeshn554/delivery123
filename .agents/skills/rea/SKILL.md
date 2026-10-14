---
name: rea
description: >-
  Reverse Engineer Anything (REA) by morluto. Use to inspect software artifacts,
  reverse-engineer application behavior, extract schemas/assets, and trace data flow.
---

# REA (Reverse Engineer Anything) Guide

REA is an MCP server and CLI utility designed for AI coding agents to inspect software, analyze native binaries, trace application behavior, and examine file formats without requiring the original source code.

Repository: `https://github.com/morluto/rea.git`
Package: `rea-agents`

## Configuration
REA is configured via `.agents/mcp_config.json`:
```json
{
  "mcpServers": {
    "rea": {
      "command": "npx",
      "args": ["-y", "rea-agents@latest", "mcp"]
    }
  }
}
```

## Setup & Diagnostic Commands
- **Interactive Setup**: `npx rea-agents setup`
- **Health Check & Diagnostics**: `npx rea-agents doctor`
- **Inspect Artifact**: `npx rea-agents analyze <artifact_path>`

## Usage Guidelines
1. Only invoke REA when an authorized application artifact (e.g. APK, bundle, binary, or schema) is explicitly provided by the user.
2. In the absence of an external artifact, rely on direct source code analysis, TypeScript definitions, and public design standards.
3. Keep reverse-engineered models aligned with AllGo's canonical architecture (PostgreSQL, Firebase, React 19, TypeScript, Capacitor).
