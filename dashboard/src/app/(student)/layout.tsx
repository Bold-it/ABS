'use client';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#333]">
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
            <span className="text-2xl">🎓</span>
            <span className="text-xl font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">HTU Moodle LMS</span>
        </div>
        <div className="flex items-center gap-6">
            <div className="text-right">
                <p className="text-xs font-bold text-gray-800">Student Portal</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Auto-Provisioned</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white shadow-sm" />
        </div>
      </nav>
      <main className="max-w-7xl mx-auto p-8">
        {children}
      </main>
      <footer className="mt-20 border-t border-gray-200 p-12 text-center text-gray-400 text-xs">
        © 2026 HTU Learning Management System. All rights reserved.
      </footer>
    </div>
  );
}
