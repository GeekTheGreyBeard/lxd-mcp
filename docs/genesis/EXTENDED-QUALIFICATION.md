# Extended disposable qualification

2026-11-11. Existing Genesis LXD 5.21 cluster, `genesis-mcp-eval` project only.
Harness: `scripts/extended-live-regression.mjs`. Uses an authenticated temporary MCP listener on loopback and the existing trusted temporary Unix-socket tunnel. No persistent service or integration is installed.

## Scope and evidence

- Actual MCP `create_instance` succeeded for a uniquely named Ubuntu 24.04 container and virtual machine, using the official Ubuntu simplestreams source. Both were created stopped with one CPU and memory limits of 512 MiB / 1 GiB respectively. Actual MCP `get_instance` verified the type.
- A second run also passed actual MCP VM start, Running-state check and stop. This does not establish guest-agent readiness, service health or networking qualification.
- Image publication is raw LXD API fixture preparation because the MCP does not expose image import/publication. Only the new disposable container is published; shared cached distro images must not be deleted.
- Project creation/deletion is not an exposed MCP feature, so it is not claimed or emulated as MCP coverage.
- Detailed transient results live outside the repository to avoid publishing private cluster inventory.

## Verified final results

- First extended run: 15/15 MCP checks passed, including container/VM create/get/delete, alias create/get/list/delete, image get/delete and expected not-found checks after deletion.
- Second extended run: 18/18 checks passed, adding VM start/state/stop. Both new instances, the new alias and the uniquely published image were deleted; subsequent MCP reads confirmed the instances and image absent.
- Separate positive `list_images` check passed, returning the container and VM image rows in the scoped project. Its initial test assertion incorrectly expected a JSON key instead of the tool's formatted text; corrected assertion passed. The maintained harness now includes this check, so future runs contain 19 checks.
- Image publication took about 99 seconds in the final run and completed successfully. No timed-out operation was retried.
- Temporary result records: `/tmp/genesis-mcp-extended.json`, `/tmp/genesis-mcp-list-images.json`. They are not publication artifacts and contain local resource identifiers.
- Existing `eval-container` / `eval-vm` fixtures and other workloads were not modified by this extended harness. All creations were uniquely named with the `extended-` prefix.

## Additional transport regression

Wait-request failures retain the operation ID and explicitly state that the outcome is unknown and must be inspected before retrying. The new regression test passes (23 transport regressions total). This change is in the shared API integration commit, not the harness commit.
