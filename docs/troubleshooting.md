# Troubleshooting Guide

This document covers common issues and solutions for the LXD MCP Server.

---

## Server Won't Start

### Issue: LXD Not Available

**Symptoms:**
```
Error: LXD not available
connect ECONNREFUSED
```

**Solution:**
1. Verify LXD is running:
   ```bash
   lxc list
   ```
2. Start LXD if not running:
   ```bash
   # Snap
   sudo snap start lxd
   
   # System
   sudo systemctl start lxd
   ```

### Issue: Socket Path Not Found

**Symptoms:**
```
Error: LXD socket not found at /path/to/socket
```

**Solution:**
1. Find the correct socket path:
   ```bash
   # Check for snap installation
   ls -la /var/snap/lxd/common/lxd/unix.socket
   
   # Check for system installation
   ls -la /var/lib/lxd/unix.socket
   
   # Check for running LXD
   sudo lxc info
   ```
2. Set the correct path:
   ```bash
   export LXD_SOCKET_PATH=/correct/path/unix.socket
   ```

### Issue: Port Already in Use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
1. Find what's using the port:
   ```bash
   lsof -ti:3000
   ```
2. Kill the process or use a different port:
   ```bash
   # Kill the process
   kill -9 $(lsof -ti:3000)
   
   # Or use a different port
   npm start -- --port 3001
   ```

### Issue: Permission Denied

**Symptoms:**
```
Error: EACCES: permission denied
```

**Solution:**
1. Add your user to the LXD group:
   ```bash
   sudo usermod -a -G lxd $USER
   ```
2. Log out and log back in for group changes to take effect
3. Alternatively, run with appropriate permissions

---

## Connection Issues

### Issue: MCP Client Can't Connect

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solution:**
1. Verify server is running:
   ```bash
   curl http://localhost:3000/health
   ```
2. Check server logs for errors
3. Verify correct port in client configuration

### Issue: Wrong Endpoint

**Symptoms:**
```
Error: MCP endpoint not found
```

**Solution:**
The MCP endpoint is at `/mcp`, not `/`. Ensure your client is configured to use:
```
http://localhost:3000/mcp
```

### Issue: Network Firewall

**Symptoms:**
```
Error: Connection timed out
```

**Solution:**
1. Check firewall rules:
   ```bash
   # iptables
   sudo iptables -L
   
   # ufw
   sudo ufw status
   ```
2. Allow the port if needed:
   ```bash
   sudo ufw allow 3000/tcp
   ```

---

## LXD Socket Access Problems

### Issue: Socket File Doesn't Exist

**Symptoms:**
```
Error: ENOENT: no such file or directory
```

**Solution:**
1. Verify LXD is properly initialized:
   ```bash
   sudo lxd init
   ```
2. Check LXD socket location:
   ```bash
   lxc info | grep -i socket
   ```

### Issue: Socket Permission Denied

**Symptoms:**
```
Error: EACCES: permission denied /var/snap/lxd/common/lxd/unix.socket
```

**Solution:**
1. Check socket permissions:
   ```bash
   ls -la /var/snap/lxd/common/lxd/unix.socket
   ```
2. Add user to LXD group:
   ```bash
   sudo usermod -a -G lxd $USER
   newgrp lxd
   ```
3. Verify group membership:
   ```bash
   groups $USER
   ```

### Issue: Running Without Proper Group

**Symptoms:**
Server works for root but not for regular user.

**Solution:**
1. Check if user is in LXD group:
   ```bash
   groups | grep lxd
   ```
2. If not, add and restart:
   ```bash
   sudo usermod -a -G lxd $USER
   # Log out and back in
   ```

---

## Common Error Messages

### "Instance already running"

**Cause:** Trying to start an instance that's already running.

**Solution:**
- Use `restart_instance` instead, or
- Ignore the error

### "Instance already stopped"

**Cause:** Trying to stop an instance that's already stopped.

**Solution:**
- Use `start_instance` instead, or
- Ignore the error

### "VM not supported"

**Cause:** Tried to use `exec_command` on a virtual machine.

**Solution:**
- Command execution only works with containers, not VMs
- Use containers when you need to execute commands
- For VMs, connect via SSH or console instead

### "Project not allowed"

**Cause:** Server is restricted to specific projects.

**Solution:**
- Specify the project in your request
- Check which projects are allowed:
  ```bash
  npm start -- --projects  # shows allowed projects
  ```

### "Project is required"

**Cause:** Server is in scoped mode but project wasn't specified.

**Solution:**
- Add `project` parameter to your request
- Or configure server without project restrictions

### "Image not found"

**Cause:** Image alias or fingerprint doesn't exist.

**Solution:**
- List available images:
  ```bash
  lxc image list
  ```
- Use the correct alias or fingerprint

---

## Authentication Errors

### "401 Unauthorized"

**Cause:** Missing or invalid ACCESS_TOKEN.

**Solution:**
1. Ensure ACCESS_TOKEN is set:
   ```bash
   export ACCESS_TOKEN=your-token
   ```
2. Verify token matches server configuration
3. Include in client config

### "Token validation failed"

**Cause:** Token doesn't match.

**Solution:**
- Regenerate token and update client configuration
- Check for typos in token

---

## Performance Issues

### Slow Response Times

**Possible causes:**
- Large number of instances/images
- Network latency
- LXD server load

**Solutions:**
1. Use filtering to reduce results:
   ```json
   { "filter": "status eq \"Running\"" }
   ```
2. Use pagination:
   ```json
   { "limit": 10, "offset": 0 }
   ```
3. Increase logging to debug to identify bottlenecks

---

## Getting Help

If you're still experiencing issues:

1. **Enable debug logging:**
   ```bash
   export LOG_LEVEL=debug
   npm start
   ```

2. **Check LXD status:**
   ```bash
   lxc info
   lxc list
   ```

3. **Review server logs** for detailed error messages

4. **Open an issue** on the project repository with:
   - Error message
   - Steps to reproduce
   - Your environment (OS, LXD version, Node.js version)
