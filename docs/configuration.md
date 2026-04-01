# Configuration Guide

This document provides detailed configuration options for the LXD MCP Server.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server host address (use `127.0.0.1` for localhost-only) |
| `PORT` | `3000` | Server HTTP port |
| `LXD_SOCKET_PATH` | `/var/snap/lxd/common/lxd/unix.socket` | Path to LXD Unix socket |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `error` |
| `ACCESS_TOKEN` | (none) | Bearer token for API authentication (optional but recommended) |
| `LXD_PROJECTS` | (none) | Comma-separated list of allowed projects (optional) |

### Setting Environment Variables

**Linux/macOS:**
```bash
export LXD_SOCKET_PATH=/var/snap/lxd/common/lxd/unix.socket
export ACCESS_TOKEN=your-secret-token
export LXD_PROJECTS=dev,staging
export LOG_LEVEL=debug
```

**Windows (PowerShell):**
```powershell
$env:LXD_SOCKET_PATH = "/var/snap/lxd/common/lxd/unix.socket"
$env:ACCESS_TOKEN = "your-secret-token"
```

**In .env file:**
```bash
# Copy example and customize
cp .env.example .env
```

---

## CLI Flags

The server supports the following command-line flags:

```bash
npm start -- [options]

Options:
  --port <number>     Server port (default: 3000)
  --projects <list>   Comma-separated list of allowed projects
  --socket <path>    LXD socket path (overrides LXD_SOCKET_PATH)
  --host <address>   Server host (default: 0.0.0.0)
  --log-level <level> Logging level: debug, info, error
```

### Examples

```bash
# Basic usage
npm start

# With custom port
npm start -- --port 8080

# With project restriction
npm start -- --projects=dev,staging

# Combine options
npm start -- --port 3000 --projects=dev --log-level=debug
```

---

## LXD Socket Paths

Different LXD installations use different socket paths:

### Snap Installation
```
/var/snap/lxd/common/lxd/unix.socket
```
Used when LXD is installed via Snap package manager.

### System Installation (Debian/Ubuntu)
```
/var/lib/lxd/unix.socket
```
Used when LXD is installed via apt/dpkg.

### Arch Linux
```
/var/lib/lxd/unix.socket
```

### Custom Installation
For custom LXD installations, the socket path is typically:
```
/var/lib/lxd/unix.socket
```

---

## Socket Auto-Detection

The server attempts to auto-detect the LXD socket path if not explicitly configured. It checks these locations in order:

1. `/var/snap/lxd/common/lxd/unix.socket` (Snap)
2. `/var/lib/lxd/unix.socket` (System)
3. `/run/lxd/unix.socket` (Alternative)

If no socket is found, the server will fail to start with a clear error message.

To explicitly set the socket path:

```bash
# Via environment variable
export LXD_SOCKET_PATH=/custom/path/unix.socket

# Via CLI flag
npm start -- --socket=/custom/path/unix.socket
```

---

## Project Namespacing

The LXD MCP Server supports **project-based access control** to restrict which LXD projects can be accessed. This is useful for multi-tenant or multi-project environments.

### Server-Side Configuration

Use the `--projects` flag to restrict server access to specific LXD projects:

```bash
# Restrict to a single project
npm start -- --projects=dev

# Restrict to multiple projects (comma-separated)
npm start -- --projects=dev,staging
```

**When project restriction is enabled:**
- All operations are filtered to only affect allowed projects
- Access to disallowed projects is blocked with a clear error message
- The `project` parameter becomes **required** for all instance/image operations

**Error Messages:**

```
Project "prod" is not allowed. Allowed projects: dev, staging
```

```
Project is required. Server is restricted to: dev, staging
```

### Client-Side Configuration (LXDMCPClient)

The `LXDMCPClient` class provides client-side project restriction:

```typescript
import { LXDMCPClient } from 'lxd-mcp';

// Single project - auto-injected
const client = new LXDMCPClient({
  serverUrl: 'http://localhost:3000',
  projects: ['dev'],  // Automatically adds project to all requests
});

// Multiple projects - requires explicit project in each request
const client = new LXDMCPClient({
  serverUrl: 'http://localhost:3000',
  projects: ['dev', 'staging'],
});
```

**Access Control Logic:**

Access is only granted if: `requested_project ∈ (server_allowed ∩ client_allowed)`

---

## Logging Configuration

### Log Levels

| Level | Description |
|-------|-------------|
| `debug` | Most verbose - includes all HTTP requests/responses |
| `info` | Default - includes operation summaries |
| `error` | Only errors and critical messages |

### Example Log Output

**debug level:**
```
[DEBUG] LXDClient: GET /1.0/instances
[DEBUG] LXDClient: Response 200 OK
[INFO] create_instance: Creating instance "web-server" from ubuntu/22.04
[INFO] create_instance: Instance "web-server" created successfully
```

**info level:**
```
[INFO] create_instance: Creating instance "web-server" from ubuntu/22.04
[INFO] create_instance: Instance "web-server" created successfully
```

---

## Network Configuration

### Server Binding

| Host Value | Binding |
|------------|---------|
| `0.0.0.0` | All interfaces (default) |
| `127.0.0.1` | Localhost only |
| `192.168.x.x` | Specific network interface |

**Recommendation:** Use `127.0.0.1` when the MCP client runs on the same machine. Use `0.0.0.0` when clients connect from other machines (with authentication enabled).

### Port Configuration

Default port is `3000`. To use a different port:

```bash
# Via environment
export PORT=8080
npm start

# Via CLI
npm start -- --port 8080
```

---

## Advanced Configuration

### Authentication

See [docs/security.md](security.md) for detailed authentication setup.

### Multiple Server Instances

Run multiple instances with different project restrictions:

```bash
# Terminal 1: Development instance
npm start -- --port 3000 --projects=dev

# Terminal 2: Production instance  
npm start -- --port 3001 --projects=prod
```

### Development Mode

Use auto-reload during development:

```bash
npm run dev
```

This runs the server with TypeScript watch mode, automatically recompiling on file changes.
