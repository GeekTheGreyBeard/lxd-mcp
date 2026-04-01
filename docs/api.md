# API Reference

This document provides reference information about the LXD API endpoints used by the LXD MCP Server.

---

## Overview

The LXD MCP Server communicates with LXD using the LXD REST API over a Unix socket. The server acts as an MCP wrapper around LXD's native API, exposing LXD functionality through MCP tools.

---

## LXD API Endpoints

### Instance Endpoints

| MCP Tool | LXD API Endpoint | Method |
|----------|-----------------|--------|
| `list_instances` | `/1.0/instances` | GET |
| `create_instance` | `/1.0/instances` | POST |
| `get_instance` | `/1.0/instances/{name}` | GET |
| `get_instance_state` | `/1.0/instances/{name}/state` | GET |
| `start_instance` | `/1.0/instances/{name}/state` | PUT |
| `stop_instance` | `/1.0/instances/{name}/state` | PUT |
| `restart_instance` | `/1.0/instances/{name}/state` | PUT |
| `delete_instance` | `/1.0/instances/{name}` | DELETE |
| `list_snapshots` | `/1.0/instances/{name}/snapshots` | GET |
| `create_snapshot` | `/1.0/instances/{name}/snapshots` | POST |
| `restore_snapshot` | `/1.0/instances/{name}/snapshots/{name}` | POST |

### Image Endpoints

| MCP Tool | LXD API Endpoint | Method |
|----------|-----------------|--------|
| `list_images` | `/1.0/images` | GET |
| `get_image` | `/1.0/images/{fingerprint}` | GET |
| `delete_image` | `/1.0/images/{fingerprint}` | DELETE |
| `list_aliases` | `/1.0/images/aliases` | GET |
| `get_alias` | `/1.0/images/aliases/{name}` | GET |
| `create_alias` | `/1.0/images/aliases` | POST |
| `delete_alias` | `/1.0/images/aliases/{name}` | DELETE |

### Server Endpoints

| MCP Tool | LXD API Endpoint | Method |
|----------|-----------------|--------|
| `get_server_info` | `/1.0/` | GET |
| `get_server_resources` | `/1.0/resources` | GET |
| `get_cluster_info` | `/1.0/cluster` | GET |

### Project Endpoints

| MCP Tool | LXD API Endpoint | Method |
|----------|-----------------|--------|
| `list_projects` | `/1.0/projects` | GET |
| `get_project` | `/1.0/projects/{name}` | GET |

### Profile Endpoints

| MCP Tool | LXD API Endpoint | Method |
|----------|-----------------|--------|
| `list_profiles` | `/1.0/profiles` | GET |
| `get_profile` | `/1.0/profiles/{name}` | GET |
| `create_profile` | `/1.0/profiles` | POST |
| `delete_profile` | `/1.0/profiles/{name}` | DELETE |
| `update_profile` | `/1.0/profiles/{name}` | PUT |
| `add_profile_device` | `/1.0/profiles/{name}` | PUT |
| `remove_profile_device` | `/1.0/profiles/{name}` | PUT |
| `add_profile_to_instance` | `/1.0/instances/{name}` | PUT |
| `remove_profile_from_instance` | `/1.0/instances/{name}` | PUT |

### Exec Endpoints

| MCP Tool | LXD API Endpoint | Method |
|----------|-----------------|--------|
| `exec_command` | `/1.0/instances/{name}/exec` | POST |

---

## API Response Format

LXD returns JSON responses with a consistent structure:

### Success Response
```json
{
  "type": "sync",
  "status": "Success",
  "status_code": 200,
  "metadata": { ... }
}
```

### Error Response
```json
{
  "type": "error",
  "error": "Error message",
  "error_code": 404
}
```

---

## Pagination

The LXD API supports pagination through query parameters:

| Parameter | Description |
|-----------|-------------|
| `limit` | Maximum items to return |
| `offset` | Number of items to skip |
| `recursion` | Recursion depth for nested resources |

**Example:**
```
GET /1.0/instances?limit=10&offset=0
```

---

## Filtering

The LXD API supports OData-style filtering:

| Operator | Description |
|----------|-------------|
| `eq` | Equals |
| `ne` | Not equals |
| `and` | Logical AND |
| `or` | Logical OR |

**Example:**
```
GET /1.0/instances?filter=status%20eq%20%22Running%22
```

---

## Operation Async

Some LXD operations are asynchronous. The server handles this by:
1. Initiating the operation
2. Polling the operation status
3. Waiting for completion or failure

Operations that require this pattern:
- Instance creation
- Instance start/stop/restart
- Instance deletion
- Snapshot creation/restore
- Image operations

---

## Official LXD API Documentation

For complete API reference, see the official LXD documentation:

**LXD REST API:** https://linuxcontainers.org/lxd/docs/main/reference/api/

This includes:
- Complete endpoint reference
- Request/response formats
- Operation details
- Error codes
- Clustering API
- Storage API
- Network API

---

## Version Compatibility

| LXD MCP Server Version | LXD API Version | Minimum LXD Version |
|------------------------|-----------------|---------------------|
| 1.x | 1.0 | LXD 5.0+ |

The server uses the LXD 1.0 API which is stable and backward compatible.

---

## Related Documentation

- [Tools Reference](tools.md) - MCP tool definitions
- [Configuration](configuration.md) - Environment variables and CLI
- [Troubleshooting](troubleshooting.md) - Common issues
