# Streaming exec qualification, November 11, 2026

Production API and MCP tool now use `executeStreamingCommand`, never the historical recorded-output helper (retained for schema regression tests only). No unsafe opt-in mode exists.

## Mechanism
- `record-output: false`, `wait-for-websocket: true`, non-interactive exec.
- Connect control first, stdout/stderr second, stdin last as launch barrier. Missing channels fail before connecting; failed output channels prevent the stdin release.
- Bounded WebSocket messages (1 MiB), retained stdout+stderr at most 8 MiB, command timeout 1–120 seconds, bounded handshake and terminal-status observation.
- Deadline or output cap requests SIGKILL over the control channel. Report actual operation exit only after terminal status, never infer a kill from a timer or exit137.
- Output errors retain operation identity and verified exit; uncertain status reports null exit and `process_may_still_run: true`.
- No daemon-recorded exec logs. MCP description and response state termination scope is the exec command only.

## Evidence
Local Unix-socket tests cover launch order, output/exit7, deadline signal plus terminal exit137, aggregate cap, missing channels and output-channel failure before launch. Live LXD5.21.8 tests in disposable `genesis-mcp-eval/eval-container` demonstrated:
1. stdout `STREAM_OK`, stderr `STDERR_OK`, exact exit7.
2. `sleep 3; printf marker > /tmp/genesis-stream-marker-20261111`, with1s deadline: actual terminal exit137. Marker absent after3.5s (separate test exits0).
3. Fixed10MB output command: retained exactly8388608 bytes and reported cap. Command finished0 before signal, accurately preserved rather than claiming a kill.
4. Exec-output log listing unchanged across trials.
5. Public API wrapper returned `API_STREAM`, exit0. Container restored Stopped.

## Limits
This is administrator command execution for trusted platform agents, not a sandbox. A privileged command can deliberately consume resources or detach children. Verified terminal status proves the tracked command exited, not that every descendant has exited. Lost control/operation connectivity can prevent verified cleanup; return uncertainty, do not claim kill. A final WebSocket upgrade failure is conservatively treated as potentially launched. A daemon operation awaiting missing channels may remain until daemon timeout; no command is intentionally released. Handshake/cleanup overhead can exceed the requested command runtime deadline. Qualify other LXD versions separately.

The complete original live MCP harness was rerun after streaming wiring: **40/40 checks passed** (`/tmp/genesis-mcp-stream-final.json`, local evidence only). Harness stopped the disposable container and removed its temporary snapshot/profile.
