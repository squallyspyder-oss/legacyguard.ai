import { AuthView } from '@neondatabase/neon-js/ui/react';
import './styles.css';

export function Auth() {
  return (
    <main className="page">
      <section className="hero" style={{ maxWidth: 520 }}>
        <p className="eyebrow">Acessar conta</p>
        <h1>Entrar ou criar conta</h1>
        <p className="lede">Use e-mail/senha, magic link ou provedores sociais configurados no Neon Auth.</p>
        <AuthView redirectTo="/account" />
      </section>
    </main>
  );
}
