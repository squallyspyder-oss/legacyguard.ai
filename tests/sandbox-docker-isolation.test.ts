import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getSandboxCapabilities, runSandbox } from '../src/lib/sandbox';

// Verifica se o sandbox realmente usa Docker, respeita FS readonly e bloqueia rede.
describe('sandbox docker isolation', () => {
  it('usa metodo docker e bloqueia escrita em FS readonly', async () => {
    const caps = await getSandboxCapabilities();
    if (!caps.docker) {
      // Ambiente sem Docker disponível: marcar como ignorado para não falhar a suite.
      expect.skip('Docker indisponível no ambiente de teste');
    }

    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-sbx-docker-'));
    await fs.writeFile(path.join(repo, 'file.txt'), 'orig');

    const result = await runSandbox({
      enabled: true,
      repoPath: repo,
      command: "sh -c 'echo mutated > file.txt'",
      useDocker: true,
      isolationProfile: 'strict',
      fsPolicy: 'readwrite',
      snapshotOnFail: true,
      timeoutMs: 120_000,
    });

    expect(result.method).toBe('docker');
    expect(result.success).toBe(false);
    expect(result.stderr.toLowerCase()).toMatch(/permission denied|read-only/);

    const content = await fs.readFile(path.join(repo, 'file.txt'), 'utf-8');
    expect(content).toBe('orig');
  });

  it('bloqueia rede com network=none', async () => {
    const caps = await getSandboxCapabilities();
    if (!caps.docker) {
      expect.skip('Docker indisponível no ambiente de teste');
    }

    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-sbx-net-'));
    // Usa nslookup; com network=none deve falhar para resolver DNS sem tocar em disco.
    const result = await runSandbox({
      enabled: true,
      repoPath: repo,
      command: "sh -c 'nslookup example.com'",
      useDocker: true,
      isolationProfile: 'strict',
      snapshotOnFail: false,
      timeoutMs: 60_000,
    });

    expect(result.method).toBe('docker');
    expect(result.success).toBe(false);
    expect((result.stderr || '').toLowerCase()).toMatch(/(network|connect|resolve|unreachable|refused|timed)/);
  });

  it('permite leitura em readonly e retorna sucesso', async () => {
    const caps = await getSandboxCapabilities();
    if (!caps.docker) {
      expect.skip('Docker indisponível no ambiente de teste');
    }

    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-sbx-ro-'));
    await fs.writeFile(path.join(repo, 'file.txt'), 'orig');
    await fs.chmod(repo, 0o755);
    await fs.chmod(path.join(repo, 'file.txt'), 0o644);

    const result = await runSandbox({
      enabled: true,
      repoPath: repo,
      harnessCommands: {
        run: ['ls /workspace', 'cat /workspace/file.txt'],
        workdir: '/tmp',
      },
      useDocker: true,
      isolationProfile: 'strict',
      fsPolicy: 'readwrite',
      snapshotOnFail: false,
      timeoutMs: 60_000,
    });

    expect(result.method).toBe('docker');
    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(repo, 'file.txt'), 'utf-8');
    expect(content).toBe('orig');
  });
});
