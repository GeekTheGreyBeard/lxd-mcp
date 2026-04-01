# Security Guide

This document provides comprehensive security guidance for the LXD MCP Server.

## Overview

The LXD MCP Server provides access to LXD containers and virtual machines. Due to the nature of LXD (which requires elevated privileges), security considerations are important:

- The server must run on the LXD host with socket access
- LXD operations typically require root or LXD group membership
- Network exposure should be minimized

---

## ACCESS_TOKEN Setup

The server supports **bearer token authentication** to protect the `/mcp` endpoints from unauthorized access.

### Generating a Token

Generate a strong, random token:

```bash
# Using openssl
openssl rand -hex 32

# Using pwgen
pwgen -s 32 1

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Server-Side Configuration

**Environment Variable:**
```bash
export ACCESS_TOKEN=your-generated-token-here
npm start
```

**.env file:**
```bash
ACCESS_TOKEN=your-generated-token-here
```

**CLI:**
```bash
ACCESS_TOKEN=your-token npm start -- --port 3000
```

### Client Configuration

Include the authorization header in your MCP client:

**OpenCode:**
```json
{
  "mcp": {
    "servers": {
      "lxd": {
        "type": "remote",
        "url": "http://localhost:3000/mcp",
        "enabled": true,
        "headers": {
          "Authorization": "Bearer {env:ACCESS_TOKEN}"
        }
      }
    }
  }
}
```

**Claude Desktop / Claude Code:**
Add via Settings > Connectors at [claude.ai/settings/connectors](https://claude.ai/settings/connectors), or use the CLI:
```bash
claude mcp add --transport http lxd http://localhost:3000/mcp --env ACCESS_TOKEN="your-token"
```

**Cursor:**
```json
{
  "mcpServers": {
    "lxd": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-access-token"
      }
    }
  }
}
```

### HTTP Transport Clients

```typescript
const transport = new StreamableHTTPClientTransport({
  url: new URL('http://localhost:3000/mcp'),
  requestOptions: {
    headers: {
      'Authorization': 'Bearer your-generated-token-here'
    }
  }
});
```

### Behavior

When `ACCESS_TOKEN` is configured:
- All `/mcp` requests require `Authorization: Bearer <token>` header
- Requests without a valid token receive `401 Unauthorized`
- The `/health` endpoint remains accessible without authentication

---

## Project Restriction

Use the `--projects` flag to restrict server access to specific LXD projects:

```bash
# Restrict to single project
npm start -- --projects=dev

# Restrict to multiple projects
npm start -- --projects=dev,staging
```

**When enabled:**
- All operations are filtered to only affect allowed projects
- The `project` parameter becomes **required** for all operations
- Access to disallowed projects is blocked with clear error messages

### Example Error Messages

```
Project "prod" is not allowed. Allowed projects: dev, staging
```

```
Project is required. Server is restricted to: dev, staging
```

---

## Network Exposure

### Recommendations

1. **Local Access Only**: Run with `HOST=127.0.0.1` when the MCP client runs on the same machine

2. **Authentication**: Always enable `ACCESS_TOKEN` when exposing on a network

3. **Trusted Networks**: Only expose on trusted networks - avoid public internet exposure

4. **Firewall Rules**: If remote access is needed, use firewall rules to restrict IP ranges

### Network Configuration Examples

**Localhost only (recommended for most cases):**
```bash
export HOST=127.0.0.1
export PORT=3000
npm start
```

**Specific network interface:**
```bash
export HOST=192.168.1.100
npm start
```

**All interfaces (with authentication):**
```bash
export HOST=0.0.0.0
export ACCESS_TOKEN=your-token
npm start
```

---

## Security Best Practices

### 1. Token Management

- **Use strong tokens**: Generate random tokens (32+ characters)
- **Never commit tokens**: Use environment variables, never hardcode
- **Rotate periodically**: Change tokens regularly
- **Use different tokens**: Different environments should use different tokens

### 2. Access Control

- **Enable project restriction**: Use `--projects` to limit access scope
- **Least privilege**: Only grant access to projects that need it
- **Client-side validation**: Use `LXDMCPClient` with `projects` config

### 3. Network Security

- **Minimize exposure**: Use localhost binding when possible
- **Enable authentication**: Always use ACCESS_TOKEN on networks
- **Firewall rules**: Restrict source IP addresses
- **Monitor access**: Review logs for suspicious activity

### 4. LXD Socket Access

- **Use LXD group**: Add users to the `lxd` group instead of running as root
- **Socket permissions**: Ensure proper socket file permissions
- **Audit access**: Monitor who can access the LXD socket

---

## Authentication for MCP Clients

### Claude Desktop

Claude supports remote MCP servers via the Connectors UI. Go to **Settings > Connectors** in [claude.ai](https://claude.ai/settings/connectors) to add your server:

1. Enter your MCP server URL: `http://localhost:3000/mcp`
2. For authentication, configure OAuth or API key in the advanced settings

Alternatively, use the CLI command (Claude Code only):
```bash
claude mcp add --transport http lxd http://localhost:3000/mcp --env ACCESS_TOKEN="your-token"
```

### Cursor

```json
{
  "mcpServers": {
    "lxd": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-access-token"
      }
    }
  }
}
```

### OpenCode

```json
{
  "mcp": {
    "servers": {
      "lxd": {
        "type": "remote",
        "url": "http://localhost:3000/mcp",
        "enabled": true,
        "headers": {
          "Authorization": "Bearer {env:ACCESS_TOKEN}"
        }
      }
    }
  }
}
```

### Testing Authentication

```bash
# Without token (should return 401)
curl -X POST http://localhost:3000/mcp

# With invalid token (should return 401)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer wrong-token"

# With valid token (should succeed)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-secret-token"

# Health endpoint (always accessible)
curl http://localhost:3000/health
```

---

## Defense in Depth

The server provides multiple layers of security:

1. **Network layer**: Bind address controls who can connect
2. **Authentication layer**: ACCESS_TOKEN verifies client identity
3. **Project layer**: --projects restricts which LXD projects are accessible
4. **LXD layer**: Socket permissions and user groups control LXD access

Each layer can operate independently, providing protection even if one layer is misconfigured.

---

## Related Documentation

- [Configuration](configuration.md) - Environment variables and CLI flags
- [Troubleshooting](troubleshooting.md) - Common security issues
