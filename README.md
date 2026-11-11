> **Genesis hardening fork:** See [qualification and limits](docs/genesis/QUALIFICATION.md) for the tested surface and current restrictions. This is trusted cluster-administration software, not an isolation boundary for untrusted agents.

# LXD MCP Server

A Model Context Protocol (MCP) server for managing LXD containers and virtual machines. Enable AI assistants to interact with LXD through a standardized interface for container lifecycle management, image operations, and server monitoring.

## Prerequisites

- **LXD**: Daemon must be installed and running on the host
- **Node.js**: Version 20 or higher
- **Socket Access**: Server must run on the LXD host with access to the LXD Unix socket

## Installation

Choose one of the following methods to install and run the LXD MCP Server.

### Run as systemd service (recommended)

This is the recommended method for production use. The service runs automatically on boot and handles logging and auto-restart.

```bash
# Install the server globally
npm install -g lxd-mcp

# Copy the service file to systemd directory
sudo cp lxd-mcp.service /etc/systemd/system/

# Reload systemd to pick up the new service
sudo systemctl daemon-reload

# Start the service
sudo systemctl start lxd-mcp

# Enable auto-start on boot
sudo systemctl enable lxd-mcp
```

### Run manually

If you prefer to run the server manually (for development or testing):

```bash
# Install globally
npm install -g lxd-mcp

# Run with default settings
lxd-mcp --port 3000

# Or run directly without installing
npx lxd-mcp --port 3000
```

> ⚠️ **Important: LXD Group Membership Required**
>
> When running manually (not as a systemd service), your user **must be a member of the `lxd` group** to access the LXD Unix socket. Without this, you'll get a "LXD socket not found" error.
>
> **To add your user to the LXD group:**
> ```bash
> sudo usermod -a -G lxd $USER
> ```
>
> **Important:** You must log out and log back in (or run `newgrp lxd`) for group changes to take effect.

## Agent Configuration

The LXD MCP Server exposes an HTTP endpoint at `/mcp`. Configure your AI agent to connect to it as a remote MCP server.

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

### Claude Desktop and Claude Code

Claude supports remote MCP servers via the Connectors UI. Go to **Settings > Connectors** in [claude.ai](https://claude.ai/settings/connectors) to add your server:

1. Enter your MCP server URL: `http://localhost:3000/mcp`
2. For authentication, configure OAuth or API key in the advanced settings

Alternatively, use the CLI command (Claude Code only):
```bash
claude mcp add --transport http lxd http://localhost:3000/mcp --env ACCESS_TOKEN="your-token"
```

### Cursor

Add to your `~/.cursor/mcp.json`:

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

**Note:** Replace `http://localhost:3000/mcp` with your server's actual URL if running remotely.

## Example Prompts

Once configured, try asking your agent:

- "List all running LXD containers"
- "Create a new Ubuntu 22.04 container called web-server"
- "Start the test-container and run apt-get update inside it"
- "Show me the server resources (CPU, memory, disk)"
- "Create a profile for web server with 2 CPU cores and 4GB memory"

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LXD_SOCKET_PATH` | `/var/snap/lxd/common/lxd/unix.socket` | Path to LXD Unix socket |
| `ACCESS_TOKEN` | required | Bearer token required for every deployment, including loopback |
| `HOST` | `127.0.0.1` | HTTP bind address; keep access inside the management network |
| `LXD_PROJECTS` | (all) | Comma-separated list of allowed projects |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `error` |
| `PORT` | `3000` | Server HTTP port |

## Security

**Important**: Access to the configured LXD Unix socket grants administrative authority. A deliberately configured temporary SSH socket forward can also be used for qualification; do not expose it publicly.

- Set `ACCESS_TOKEN`; startup fails without authentication, including on loopback.
- Use `LXD_PROJECTS` to restrict access to specific projects
- See [docs/security.md](docs/security.md) for detailed security guidance

## Documentation

- [Tools Reference](docs/tools.md) - All MCP tool definitions and parameters
- [Configuration](docs/configuration.md) - Environment variables, CLI flags, socket paths
- [Security](docs/security.md) - Token setup, project restriction, best practices
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [API Reference](docs/api.md) - LXD API endpoints used by this server

## License

MIT License - see the LICENSE file for details.
