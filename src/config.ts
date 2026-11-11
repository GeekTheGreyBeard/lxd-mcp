/** Fail-closed startup configuration. No credentials are logged here. */
export function parseConfig(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const projectArg = args.find(arg => arg.startsWith('--projects='));
  const rawProjects = projectArg ? projectArg.slice('--projects='.length) : env.LXD_PROJECTS;
  const allowedProjects = rawProjects === undefined ? [] : [...new Set(rawProjects.split(',').map(p => p.trim()))];
  if (rawProjects !== undefined && (allowedProjects.length === 0 || allowedProjects.some(p => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(p) || p === '.' || p === '..'))) {
    throw new Error('Project restrictions must be a nonempty comma-separated list of valid project names');
  }
  const host = env.HOST || '127.0.0.1';
  const portText = env.PORT || '3000';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const accessToken = env.ACCESS_TOKEN || '';
  if (!accessToken.trim()) throw new Error('ACCESS_TOKEN is required, including on loopback');
  return { host, port, allowedProjects, accessToken, logLevel: env.LOG_LEVEL || 'info' };
}
