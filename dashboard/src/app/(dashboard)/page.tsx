'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [jobCounts, setJobCounts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('abs_token');
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [statsRes, healthRes] = await Promise.all([
          fetch('/api/admin/stats', { headers }),
          fetch('/api/admin/system/health', { headers }),
        ]);

        const statsData = await statsRes.json();
        const healthData = await healthRes.json();

        setStats(statsData);
        setHealth(healthData);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) return <div className="text-primary font-medium">Loading statistics...</div>;

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Students" value={stats?.total} icon="👥" color="bg-blue-500" href="/students" />
        <StatCard title="Admitted" value={stats?.admitted} icon="📝" color="bg-amber-500" href="/students?status=ADMITTED" />
        <StatCard title="Active Enrolled" value={stats?.active} icon="✅" color="bg-green-500" href="/students?status=ACTIVE" />
        <StatCard title="Restricted" value={stats?.restricted} icon="🚫" color="bg-red-500" href="/students?status=RESTRICTED" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bridge Radar Panel */}
        <div className="lg:col-span-1 bg-white p-8 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-8xl">📡</span>
          </div>
          
          <h3 className="text-xl font-black text-gray-800 mb-8 uppercase tracking-tight flex items-center gap-3">
            Bridge Radar
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </h3>

          <div className="space-y-4 relative z-10">
            <HealthIndicator name="Postgres Core" status={health?.postgres} />
            <HealthIndicator name="Redis Hub" status={health?.redis} />
            <HealthIndicator name="Finance Link" status={health?.finance} />
            <HealthIndicator name="Moodle Bridge" status={health?.lms} />
            
            <div className="mt-8 p-5 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">Network Topology</p>
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase">
                  <span>SOIS</span>
                  <span className="text-primary">→</span>
                  <span className="text-primary font-black">ABS BRIDGE</span>
                  <span className="text-primary">→</span>
                  <span>LMS</span>
                </div>
            </div>
          </div>
        </div>

        {/* BullMQ Monitor Panel */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Automation Hub (BullMQ)
            </h3>
            <span className="text-xs font-bold text-primary bg-primary-light px-2 py-1 rounded-md uppercase tracking-wide">Live Updates</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <JobCount label="Waiting" value="0" subLabel="Queued" color="text-gray-400" />
            <JobCount label="Active" value="0" subLabel="Processing" color="text-primary" />
            <JobCount label="Completed" value={stats?.active} subLabel="Success" color="text-green-500" />
            <JobCount label="Failed" value="0" subLabel="Errors" color="text-red-500" />
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500 italic text-left">"Automation is currently monitoring Finance and SOIS webhooks..."</p>
            <button 
                onClick={async () => {
                    if(!confirm('This will re-evaluate Moodle access for EVERY student based on their current balance. Proceed?')) return;
                    const token = localStorage.getItem('abs_token');
                    const res = await fetch('/api/admin/students/sync-all', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const data = await res.json();
                    alert(`Sync Started: Queued ${data.count} students for status re-evaluation.`);
                }}
                className="px-6 py-2 bg-primary text-white text-[10px] font-black rounded-lg hover:shadow-lg transition-all uppercase tracking-widest"
            >
                Global Status Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, href }: any) {
  return (
    <Link href={href || '/students'} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer block">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${color} bg-opacity-10 rounded-xl flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-black text-gray-900">{value || 0}</p>
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-1">{title}</p>
      </div>
    </Link>
  );
}

function HealthIndicator({ name, status }: any) {
  const isHealthy = status === 'connected' || status === 'mock_mode';
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-primary/20 transition-colors group">
      <div className="flex flex-col">
        <span className="text-xs font-black text-gray-800 uppercase tracking-tight">{name}</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {status?.replace('_', ' ') || 'Syncing...'}
        </span>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full ${isHealthy ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'} animate-pulse`} />
    </div>
  );
}

function JobCount({ label, value, subLabel, color }: any) {
  return (
    <div className="text-center p-4 rounded-xl border border-gray-100">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-sm font-bold text-gray-700 mt-1">{label}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{subLabel}</p>
    </div>
  );
}
