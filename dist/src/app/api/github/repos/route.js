"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const next_auth_1 = require("next-auth");
const octokit_1 = require("octokit");
async function GET() {
    const session = await (0, next_auth_1.getServerSession)();
    // @ts-ignore
    const accessToken = session === null || session === void 0 ? void 0 : session.accessToken;
    if (!accessToken) {
        return server_1.NextResponse.json({ error: 'Não autenticado no GitHub' }, { status: 401 });
    }
    try {
        const octokit = new octokit_1.Octokit({ auth: accessToken });
        const { data } = await octokit.rest.repos.listForAuthenticatedUser({
            per_page: 100,
            sort: 'updated',
            direction: 'desc',
        });
        const repos = data.map((repo) => {
            var _a;
            return ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                private: repo.private,
                defaultBranch: repo.default_branch,
                htmlUrl: repo.html_url,
                cloneUrl: repo.clone_url,
                owner: (_a = repo.owner) === null || _a === void 0 ? void 0 : _a.login,
            });
        });
        return server_1.NextResponse.json({ repos });
    }
    catch (error) {
        console.error('[github/repos] error', (error === null || error === void 0 ? void 0 : error.message) || error);
        return server_1.NextResponse.json({ error: 'Falha ao listar repositórios do GitHub' }, { status: 500 });
    }
}
