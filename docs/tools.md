# LXD MCP Tools Reference

This document provides complete documentation for all MCP tools provided by the LXD MCP Server.

## Instance Tools

### list_instances

List all LXD instances (containers and virtual machines) with optional pagination and filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project` | string | No | LXD project name |
| `limit` | number | No | Maximum number of instances (default: 100, max: 500) |
| `offset` | number | No | Number of instances to skip |
| `filter` | string | No | OData filter expression (e.g., `'status eq "Running"'`, `'type eq "container"'`) |

**Example - List all:**
```json
{}
```

**Example - Pagination:**
```json
{ "limit": 10, "offset": 0 }
```

**Example - Filter by status:**
```json
{ "filter": "status eq \"Running\"" }
```

**Example - Filter by type:**
```json
{ "filter": "type eq \"container\"" }
```

**Response includes pagination metadata:**
```json
{
  "content": [...],
  "pagination": { "total": 25, "hasMore": true }
}
```

---

### create_instance

Create a new LXD instance from a remote image.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Name for the new instance |
| `image` | string | Yes | Image to use (e.g., "alpine/3.20", "ubuntu/22.04", "debian/12") |
| `remote` | string | No | Remote image server: "images" (default), "ubuntu", "ubuntu-daily", or full URL |
| `type` | string | No | Instance type: "container" or "virtual-machine" (default: container) |
| `project` | string | No | LXD project name |
| `config` | object | No | Instance configuration (e.g., `{"limits.cpu": "2", "limits.memory": "2GiB"}`) |
| `start` | boolean | No | Start instance after creation (default: true) |

**Example:**
```json
{
  "name": "web-server",
  "image": "ubuntu/22.04",
  "type": "container",
  "config": {
    "limits.cpu": "2",
    "limits.memory": "4GiB"
  },
  "start": true
}
```

---

### get_instance

Get detailed information about a specific LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server", "project": "default" }
```

---

### get_instance_state

Get runtime state of an instance (CPU, memory, disk, network).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server" }
```

---

### start_instance

Start a stopped LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server" }
```

---

### stop_instance

Stop a running LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server" }
```

---

### restart_instance

Restart an LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server" }
```

---

### delete_instance

Delete an LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |
| `autoStop` | boolean | No | Automatically stop instance before deletion (default: false) |
| `force` | boolean | No | Force delete a running instance (default: false) |

**Example:**
```json
{ "name": "web-server" }
```

**Example with autoStop:**
```json
{ "name": "web-server", "autoStop": true }
```

**Example with force (delete running instance):**
```json
{ "name": "web-server", "force": true }
```

---

### list_snapshots

List all snapshots for an instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `project` | string | No | LXD project name |
| `limit` | number | No | Maximum number of snapshots (default: 100, max: 500) |
| `offset` | number | No | Number of snapshots to skip |

**Example:**
```json
{ "name": "web-server" }
```

**Example - Pagination:**
```json
{ "name": "web-server", "limit": 5, "offset": 0 }
```

---

### create_snapshot

Create a snapshot of an instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `snapshot_name` | string | Yes | Name for the new snapshot |
| `stateful` | boolean | No | Include runtime state in snapshot (default: false) |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "name": "web-server",
  "snapshot_name": "pre-update",
  "stateful": false
}
```

---

### restore_snapshot

Restore an instance from a snapshot.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Instance name |
| `snapshot_name` | string | Yes | Snapshot name to restore |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "name": "web-server",
  "snapshot_name": "pre-update"
}
```

---

### exec_command

Execute a shell command inside a running LXD container. Commands are automatically wrapped in `/bin/sh -c`.

**Note:** This tool only works with **containers**, not virtual machines.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `container` | string | Yes | Container name |
| `command` | string | Yes | Command to execute |
| `user` | number | No | Run as specific UID (e.g., 0 for root) |
| `group` | number | No | Run as specific GID (e.g., 0 for root) |
| `cwd` | string | No | Working directory (default: /) |
| `env` | object | No | Environment variables as JSON object |
| `timeoutMs` | number | No | Timeout in milliseconds (default: 30000, min: 1000, max: 120000) |
| `project` | string | No | LXD project name |

**Example - Run as root:**
```json
{
  "container": "web-server",
  "command": "apt-get update && apt-get install -y nginx"
}
```

**Example - Run as specific user:**
```json
{
  "container": "web-server",
  "command": "whoami",
  "user": 1000,
  "group": 1000
}
```

**Example - With environment variables:**
```json
{
  "container": "web-server",
  "command": "echo $MY_VAR",
  "env": { "MY_VAR": "hello world" }
}
```

**Response:**
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "nginx installed\n",
  "stderr": "",
  "timedOut": false
}
```

**Error - Container not running:**
```json
{
  "success": false,
  "error": "Instance \"web-server\" is not running (current state: Stopped)."
}
```

**Error - VM not supported:**
```json
{
  "success": false,
  "error": "Instance \"my-vm\" is a virtual machine. Command execution is only supported for containers."
}
```

---

## Image Tools

### list_images

List all LXD images with optional pagination and filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project` | string | No | LXD project name |
| `limit` | number | No | Maximum number of images (default: 100, max: 500) |
| `offset` | number | No | Number of images to skip |
| `filter` | string | No | OData filter expression |

**Example:**
```json
{ "filter": "type eq \"container\"" }
```

**Example - Filter public images:**
```json
{ "filter": "public eq true" }
```

---

### get_image

Get detailed information about a specific LXD image.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `fingerprint` | string | Yes | Image fingerprint or alias |

**Example:**
```json
{ "fingerprint": "alpine/3.20" }
```

---

### delete_image

Delete an LXD image.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `fingerprint` | string | Yes | Image fingerprint |

**Example:**
```json
{ "fingerprint": "abc123def456" }
```

---

### list_aliases

List all LXD image aliases.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Maximum number of aliases (default: 100, max: 500) |
| `offset` | number | No | Number of aliases to skip |

**Example:**
```json
{}
```

---

### get_alias

Get information about a specific image alias.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Alias name |

**Example:**
```json
{ "name": "ubuntu/22.04" }
```

---

### create_alias

Create a new image alias.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Alias name |
| `description` | string | Yes | Alias description |
| `target` | string | Yes | Target image fingerprint |

**Example:**
```json
{
  "name": "my-ubuntu-22.04",
  "description": "Ubuntu 22.04 LTS",
  "target": "abc123def456"
}
```

---

### delete_alias

Delete an image alias.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Alias name |

**Example:**
```json
{ "name": "my-ubuntu-22.04" }
```

---

## Server Tools

### get_server_info

Get information about the LXD server.

**Parameters:** None

**Example:**
```json
{}
```

---

### get_server_resources

Get hardware resources of the LXD server (CPU, memory, GPU, network, storage).

**Parameters:** None

**Example:**
```json
{}
```

---

### get_cluster_info

Get information about the LXD cluster (if clustering is enabled).

**Parameters:** None

**Example:**
```json
{}
```

---

### list_projects

List all LXD projects with optional pagination and filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Maximum number of projects (default: 100, max: 500) |
| `offset` | number | No | Number of projects to skip |
| `filter` | string | No | OData filter expression |

**Example:**
```json
{ "filter": "name eq \"default\"" }
```

---

### get_project

Get detailed information about a specific LXD project.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Project name |

**Example:**
```json
{ "name": "default" }
```

---

## Profile Tools

LXD profiles are reusable configurations that can be applied to instances. They contain instance configuration options (CPU, memory, etc.), devices (network interfaces, disk mounts, GPUs, etc.), and device-specific configurations.

### list_profiles

List all LXD profiles with optional pagination and filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project` | string | No | LXD project name |
| `limit` | number | No | Maximum number of profiles (default: 100, max: 500) |
| `offset` | number | No | Number of profiles to skip |
| `filter` | string | No | OData filter expression |

**Example:**
```json
{ "project": "default" }
```

---

### get_profile

Get detailed information about a specific LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server", "project": "default" }
```

---

### create_profile

Create a new LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `description` | string | No | Profile description |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "name": "web-server",
  "description": "Profile for web server instances"
}
```

---

### delete_profile

Delete an LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `project` | string | No | LXD project name |

**Example:**
```json
{ "name": "web-server" }
```

---

### set_profile_config

Set configuration options for an LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `config` | object | Yes | Configuration key-value pairs |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "name": "web-server",
  "config": {
    "limits.cpu": "2",
    "limits.memory": "4GiB"
  }
}
```

---

### add_profile_device

Add a device to an LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `device_name` | string | Yes | Device name |
| `device_type` | string | Yes | Device type (e.g., "nic", "disk", "gpu", "proxy", "usb") |
| `device_config` | object | Yes | Device configuration key-value pairs |
| `project` | string | No | LXD project name |

**Example - Add network interface:**
```json
{
  "name": "web-server",
  "device_name": "eth0",
  "device_type": "nic",
  "device_config": {
    "network": "lxdbr0",
    "ipv4.address": "auto"
  }
}
```

**Example - Add disk:**
```json
{
  "name": "web-server",
  "device_name": "data",
  "device_type": "disk",
  "device_config": {
    "path": "/data",
    "source": "/mnt/data"
  }
}
```

---

### remove_profile_device

Remove a device from an LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `device_name` | string | Yes | Device name to remove |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "name": "web-server",
  "device_name": "eth0"
}
```

---

### set_profile_device

Set configuration options for a device in an LXD profile.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Profile name |
| `device_name` | string | Yes | Device name |
| `device_config` | object | Yes | Device configuration key-value pairs |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "name": "web-server",
  "device_name": "eth0",
  "device_config": {
    "ipv4.address": "192.168.1.100"
  }
}
```

---

### add_profile_to_instance

Apply a profile to an LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `instance_name` | string | Yes | Instance name |
| `profile_name` | string | Yes | Profile name to add |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "instance_name": "web-container",
  "profile_name": "web-server"
}
```

---

### remove_profile_from_instance

Remove a profile from an LXD instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `instance_name` | string | Yes | Instance name |
| `profile_name` | string | Yes | Profile name to remove |
| `project` | string | No | LXD project name |

**Example:**
```json
{
  "instance_name": "web-container",
  "profile_name": "web-server"
}
```

---

## Pagination and Filtering

All list operations support pagination and filtering.

### Pagination Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | number | 100 | 500 | Maximum number of items to return |
| `offset` | number | 0 | - | Number of items to skip |

### Filtering

The server supports **OData filter expressions**:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `status eq "Running"` |
| `ne` | Not equals | `status ne "Stopped"` |
| `and` | Logical AND | `status eq "Running" and type eq "container"` |
| `or` | Logical OR | `type eq "container" or type eq "virtual-machine"` |

**Filter examples:**
```json
{ "filter": "status eq \"Running\"" }
{ "filter": "type eq \"container\"" }
{ "filter": "status eq \"Running\" and type eq \"container\"" }
```

**Note:** Filtering is NOT supported on `list_snapshots` and `list_aliases` (use pagination only).
