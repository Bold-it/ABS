'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const menuItems = [
  { name: 'Home', path: '/', icon: '🏠' },
  { name: 'Students', path: '/students', icon: '🎓' },
  { name: 'Mounted Courses', path: '/courses', icon: '📚' },
  { name: 'Audit Logs', path: '/audit-logs', icon: '📜' },
  { name: 'Job Queue', path: '/jobs', icon: '⚙️' },
  { name: 'Simulation Lab', path: '/simulation', icon: '🧪' },
  { name: 'Settings', path: '/settings', icon: '🛠️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('abs_user');
    const token = localStorage.getItem('abs_token');

    if (!storedUser || !token) {
      router.push('/login');
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('abs_token');
    localStorage.removeItem('abs_user');
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-primary-light">
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-white flex flex-col shadow-2xl relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="p-6 border-b border-white/10 relative z-10 flex flex-col items-center text-center gap-3">
          <img src="/logo.png" alt="Ho Technical University Logo" className="h-16 w-auto object-contain bg-white p-2 rounded-2xl shadow-md" />
          <div>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <h1 className="text-md font-black tracking-tighter uppercase text-white">HTU ABS Bridge</h1>
            </div>
            <p className="text-[9px] font-black opacity-40 mt-1 tracking-widest leading-none">AUTOMATION CONSOLE v2.0</p>
          </div>
        </div>
        
        <nav className="flex-1 mt-8 px-4 space-y-1 relative z-10">
          {menuItems.filter(item => {
            if (item.name === 'Simulation Lab' || item.name === 'Settings') {
              return user.role === 'ADMIN';
            }
            return true;
          }).map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? 'bg-white text-primary font-bold shadow-xl scale-[1.02]' 
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm tracking-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-white/10 mt-auto relative z-10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/10 transition-all font-bold text-xs uppercase tracking-widest"
          >
            <span>LOGOUT SYSTEM</span>
            <span className="text-lg">🚪</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white shadow-sm flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-800">
              {menuItems.find(m => m.path === pathname)?.name || 'Dashboard'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{user.email}</p>
              <p className="text-xs font-medium text-primary uppercase tracking-wider">{user.role}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold border-2 border-primary/20">
              {user.email[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
