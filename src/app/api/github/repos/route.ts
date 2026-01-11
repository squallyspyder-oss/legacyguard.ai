import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Octokit } from 'octokit';

export async function GET() {
  console.log('[github/repos] Iniciando requisicao...');
  
  const session = await getServerSession(authOptions);
  console.log('[github/repos] Session:', JSON.stringify(session, null, 2));
  
  // @ts-expect-error - accessToken não existe no tipo Session padrão
  const accessToken = session?.accessToken as string | undefined;
  console.log('[github/repos] AccessToken presente:', Boolean(accessToken));

  if (!accessToken) {
    console.log('[github/repos] Nao autenticado - retornando 401');
    return NextResponse.json({ error: 'Não autenticado no GitHub' }, { status: 401 });
  }

  try {
    console.log('[github/repos] Criando Octokit e listando repos...');
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
      direction: 'desc',
    });

    console.log('[github/repos] Repos encontrados:', data.length);

    const repos = data.map((repo: { id: number; name: string; full_name: string; private: boolean; default_branch: string | undefined; html_url: string; clone_url: string | undefined; owner: { login: string } | null }) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      owner: repo.owner?.login,
    }));

    return NextResponse.json({ repos });
  } catch (error: any) {
    console.error('[github/repos] error', error?.message || error);
    return NextResponse.json({ error: 'Falha ao listar repositórios do GitHub' }, { status: 500 });
  }
}
