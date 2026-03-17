import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Landing } from './pages/Landing';
import { Deposit } from './pages/Deposit';
import { Withdraw } from './pages/Withdraw';
import { Claim } from './pages/Claim';
import { Pools } from './pages/Pools';

function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-6">
      <div className="font-anton text-8xl text-red">404</div>
      <div className="font-anton text-2xl text-white tracking-wider">PAGE NOT FOUND</div>
      <p className="text-muted font-body text-sm">This page doesn't exist. You may have followed a bad link.</p>
      <Link to="/" className="btn-red px-8 py-3 text-sm no-underline inline-block">BACK TO HOME</Link>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/deposit" element={<Deposit />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/claim" element={<Claim />} />
          <Route path="/pools" element={<Pools />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
