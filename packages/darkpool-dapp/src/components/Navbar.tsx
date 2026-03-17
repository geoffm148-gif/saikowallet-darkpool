import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const { pathname } = useLocation();

  const links = [
    { to: '/deposit',  label: 'DARKPOOL',    match: ['/deposit', '/withdraw'] },
    { to: '/pools',    label: 'TOKEN POOLS', match: ['/pools'] },
    { to: '/claim',    label: 'CLAIM',       match: ['/claim'] },
  ];

  return (
    <nav className="border-b border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-1 no-underline shrink-0">
          <span className="font-anton text-red text-xl tracking-wider">SAIKO</span>
          <span className="font-anton text-white text-xl tracking-wider ml-1">DARK POOLS</span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(({ to, label, match }) => {
            const active = match.includes(pathname);
            return (
              <Link
                key={to}
                to={to}
                className={`font-anton text-sm tracking-wider no-underline transition-colors relative ${
                  active ? 'text-red' : 'text-muted hover:text-white'
                }`}
              >
                {label}
                {active && (
                  <span className="absolute -bottom-[21px] left-0 right-0 h-px bg-red" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <ConnectButton chainStatus="none" showBalance={false} accountStatus="address" />
      </div>

      {/* DarkPool sub-nav — shown on /deposit and /withdraw */}
      {(pathname === '/deposit' || pathname === '/withdraw') && (
        <div className="border-t border-border bg-bg">
          <div className="max-w-6xl mx-auto px-6 flex gap-0">
            <Link
              to="/deposit"
              className={`font-anton text-xs tracking-widest px-5 py-2.5 no-underline transition-colors border-b-2 ${
                pathname === '/deposit'
                  ? 'text-white border-red'
                  : 'text-muted hover:text-white border-transparent'
              }`}
            >
              DEPOSIT
            </Link>
            <Link
              to="/withdraw"
              className={`font-anton text-xs tracking-widest px-5 py-2.5 no-underline transition-colors border-b-2 ${
                pathname === '/withdraw'
                  ? 'text-white border-red'
                  : 'text-muted hover:text-white border-transparent'
              }`}
            >
              WITHDRAW
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
