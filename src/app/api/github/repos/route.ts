import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Octokit } from 'octokit';

export async function GET() {
  const session = await getServerSession();
  // @ts-ignore
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ error: 'Não autenticado no GitHub' }, { status: 401 });
  }

  try {
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
      direction: 'desc',
    });

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
