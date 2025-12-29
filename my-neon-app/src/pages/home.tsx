import { Link } from 'react-router-dom';
import './styles.css';

export function Home() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Neon Auth + React</p>
        <h1>Autenticação pronta para PG + RAG</h1>
        <p className="lede">
          Use o Neon Auth para gerenciar usuários, sessões e permissões com pgvector e Postgres.
        </p>
        <div className="actions">
          <Link className="btn primary" to="/auth/sign-in">
            Entrar ou criar conta
          </Link>
          <Link className="btn ghost" to="/account/settings">
            Minha conta
          </Link>
        </div>
      </section>
    </main>
  );
}
