# Genesis fork qualification

This fork originates from edgeseek/lxd-mcp v1.1.0, upstream commit
289005d066aee894bba24f51ea04aa5b9b2902f3 (MIT license retained).

It is being hardened for platform-managed projects on a private management
network. Network isolation does not replace authentication or correct operation
results. The service must not be exposed publicly. A locally forwarded LXD
socket remains an administrative capability and must be treated accordingly.

## Qualification gates

- Validate names and project selection, including query/fragment/path attacks.
- Apply configured project scope consistently to images and aliases.
- Parse real LXD operation metadata, exec exit codes and recorded output.
- Await mutation completion and report failures/timeouts honestly.
- Handle project-qualified collection URLs and report cluster status accurately.
- Use bounded, authenticated event streaming with valid WebSocket framing.
- Require authentication, default to loopback, and avoid sensitive request logs.
- Run dependency audit, build, unit regression and disposable live-cluster tests.

## Compatibility scope

Live evidence from the original evaluation concerns LXD 5.21.8 on Ubuntu 24.04.
This is not qualification of the proposed future LXD 6.10 / Ubuntu 26.04 stack.
No production deployment is authorized by passing tests alone.

## Live test harness

`scripts/live-regression.mjs` uses an existing dedicated disposable project and
fixtures. It changes configuration, runs commands, manages snapshots/profiles,
and starts/stops the fixtures. Never point it at a production project. Set
`LXD_SOCKET_PATH`, `TEST_PROJECT`, and optionally `TEST_RESULTS`. It binds a
short-lived MCP service to loopback and generates an in-memory authentication
token. Do not commit raw local result files containing site inventory.

Full upstream `npm test` includes integration suites requiring a live socket;
run `npx vitest run test/unit` for isolated unit coverage. Do not interpret
unavailable integration prerequisites as completed integration coverage.

## Trust and operational limits
This is a cluster-administration tool for trusted agents on the management network, not a tenant isolation boundary. Project allowlists prevent accidental routing outside scope, but LXD projects with shared images/profiles, unrestricted devices and configuration, and administrator commands can cross that conceptual boundary. Do not expose it to untrusted agents. Authentication is still required on loopback and the management network.

Recorded exec output is accumulated by LXD on the daemon. The client bounds retrieval, but a timed-out command may continue running and recording output; it is not killed merely because this tool timed out. This remains a production qualification blocker for unattended arbitrary execution. No claim of safe untrusted command execution is made. Resource aliases containing slashes are intentionally rejected by the hardened path validator.

This work does not install a persistent service or integrate the management-server build. Live testing is against LXD 5.21, not a qualification of LXD 6.10.

## November 11 hardening verification
- TypeScript build succeeds.
- Complete unit suite: 224 tests across 15 files pass, including real local Unix-socket transport tests (run with reviewed socket permission).
- Dependency audit: zero known vulnerabilities after lockfile/tsx refresh and maintained ws transport installation.
- Live harness exercises forty checks against disposable genesis-mcp-eval fixtures, covering cluster reporting, env project restrictions, injection rejection, instance lifecycle, exec exit/output and timeout honesty, event stream, config/file/log tools, profiles and snapshots.
- This is NOT all-tool qualification: VM create/delete, image import/delete and project create/delete have not been live-tested in this fix pass. No changes were made to existing user workloads.
- Temporary local SSH socket forwarding used the existing trusted genesis1 connection; no persistent credentials or services were deployed.
