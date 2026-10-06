import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

// The destination is the operator's, never the repository's: no host, user or path is committed.
// Precedence is command line, then environment, then the local untracked deploy/target.json.
function parseArguments(argv) {
  const options = {};
  const positional = [];
  const take = (index, flag) => {
    const value = argv[index];
    if (value === undefined || value.startsWith('-')) throw new Error(`${flag} needs a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--target') options.sshTarget = take(++i, argument);
    else if (argument === '--dir') options.remoteDirectory = take(++i, argument);
    else if (argument === '--url') options.url = take(++i, argument);
    else if (argument === '--port') options.port = Number(take(++i, argument));
    else if (argument.startsWith('-')) throw new Error(`Unknown option ${argument}`);
    else positional.push(argument);
  }
  if (positional.length > 1) throw new Error('Pass a single destination, as user@hostname');
  if (positional.length === 1 && options.sshTarget === undefined) options.sshTarget = positional[0];
  return options;
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const MISSING_TARGET = `No deployment destination.

Pass one:            npm.cmd run deploy -- you@your-vm
Or set it once:      copy deploy/target.example.json to deploy/target.json and edit it
Or use the env:      DERETH_DEPLOY_TARGET=you@your-vm npm.cmd run deploy

deploy/target.json is untracked on purpose, so no host or account is committed.
Options: --target user@host, --dir /home/user/path, --url http://host:3000, --port 3000.`;

async function main() {
  const runtime = JSON.parse(await readFile(join(root, 'deploy/runtime.json'), 'utf8'));
  const configured = await readJsonIfPresent(join(root, 'deploy/target.json'));
  const passed = parseArguments(process.argv.slice(2));
  const fromEnvironment = {
    sshTarget: process.env.DERETH_DEPLOY_TARGET,
    remoteDirectory: process.env.DERETH_DEPLOY_DIR,
    url: process.env.DERETH_DEPLOY_URL,
    port: process.env.DERETH_DEPLOY_PORT ? Number(process.env.DERETH_DEPLOY_PORT) : undefined,
  };
  const choose = (key) => passed[key] ?? fromEnvironment[key] ?? configured?.[key];

  const sshTarget = choose('sshTarget');
  if (!sshTarget) throw new Error(MISSING_TARGET);
  if (!/^[a-z_][a-z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(sshTarget))
    throw new Error(`Destination must be user@hostname, not ${JSON.stringify(sshTarget)}`);
  const username = sshTarget.split('@')[0];
  const hostname = sshTarget.split('@')[1];
  // Everything else falls out of the destination unless it is given explicitly.
  const port = choose('port') ?? 3000;
  const target = {
    sshTarget,
    port,
    remoteDirectory: choose('remoteDirectory') ?? `/home/${username}/dereth.network`,
    url: choose('url') ?? `http://${hostname}:${port}`,
    ...runtime,
  };
  if (
    !new RegExp(`^/home/${username}/[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$`).test(
      target.remoteDirectory,
    ) ||
    target.remoteDirectory.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('remoteDirectory must be a project directory under the SSH user home');
  if (!Number.isInteger(target.port) || target.port < 1024 || target.port > 65535)
    throw new Error('port must be an unprivileged TCP port (1024–65535)');
  if (!/^24\.\d+\.\d+$/.test(target.nodeVersion) || !/^[a-f0-9]{64}$/.test(target.nodeSha256))
    throw new Error('A pinned Node 24 version and its Linux x64 tar.gz SHA-256 are required');
  const baseUrl = new URL(target.url);
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password)
    throw new Error('url must be an HTTP(S) URL without credentials');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this command through npm: npm.cmd run deploy');

  // npm can prepend Git's Unix tools to PATH on Windows. Use Windows OpenSSH/tar
  // explicitly, and a relative archive path so drive letters cannot look like hosts.
  const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  const ssh = process.platform === 'win32' ? join(system32, 'OpenSSH', 'ssh.exe') : 'ssh';
  const scp = process.platform === 'win32' ? join(system32, 'OpenSSH', 'scp.exe') : 'scp';
  const tar = process.platform === 'win32' ? join(system32, 'tar.exe') : 'tar';
  const sshOptions = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];
  console.log(`Deploying to ${target.sshTarget} (${target.url})`);
  await run(ssh, [...sshOptions, target.sshTarget, 'true']);
  await run(process.execPath, [npmCli, 'run', 'build']);

  const release = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(3).toString('hex')}`;
  const output = join(root, 'artifacts', 'deploy');
  await mkdir(output, { recursive: true });
  const archive = join(output, `${release}.tar.gz`);
  await run(tar, [
    '-czf',
    relative(root, archive),
    'dist',
    'server.mjs',
    'deploy/activate.sh',
    'deploy/check-release.mjs',
  ]);
  const checksum = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  const incoming = `${target.remoteDirectory}/.incoming`;
  const remoteArchive = `${incoming}/${release}.tar.gz`;
  const bootstrap = `${incoming}/${release}`;
  await run(ssh, [...sshOptions, target.sshTarget, `mkdir -p ${quote(bootstrap)}`]);
  await run(scp, [...sshOptions, relative(root, archive), `${target.sshTarget}:${remoteArchive}`]);
  const args = [
    target.remoteDirectory,
    release,
    checksum,
    target.nodeVersion,
    target.nodeSha256,
    target.port,
  ];
  const activate = [
    `printf '%s  %s\\n' ${quote(checksum)} ${quote(remoteArchive)} | sha256sum --check --status`,
    `tar -xmzf ${quote(remoteArchive)} -C ${quote(bootstrap)} deploy/activate.sh`,
    `bash ${quote(`${bootstrap}/deploy/activate.sh`)} ${args.map(quote).join(' ')}`,
  ].join(' && ');
  await run(ssh, [...sshOptions, target.sshTarget, `bash -o pipefail -c ${quote(activate)}`]);

  // Check from Windows as well as from the VM, so LAN/firewall problems surface here.
  const response = await fetch(new URL('/healthz', baseUrl), {
    signal: AbortSignal.timeout(10000),
  });
  const health = await response.json();
  if (!response.ok || health.status !== 'ok' || health.release !== release)
    throw new Error(
      `The VM activated ${release}, but the LAN health check did not return that release`,
    );
  const page = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
  const html = page.ok ? await page.text() : '';
  if (!html.includes('<title>Dereth Network</title>'))
    throw new Error('The server is healthy, but the webpage did not pass the LAN check');
  // A page whose stylesheet 404s still has its title but renders as nothing.
  const stylesheet = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  if (!stylesheet || !(await fetch(new URL(stylesheet, baseUrl))).ok)
    throw new Error('The webpage loaded over the LAN, but its stylesheet did not');
  await writeFile(
    join(output, 'last-deploy.json'),
    JSON.stringify({ release, ...target, deployedAt: new Date().toISOString() }, null, 2) + '\n',
  );
  console.log(
    `\nDeployed ${release}\nOpen ${target.url}\nLogs: ssh ${target.sshTarget} 'journalctl --user -u dereth-network -n 50'`,
  );
}

main().catch((error) => {
  console.error(`\nDeploy failed: ${error.message}`);
  process.exitCode = 1;
});
