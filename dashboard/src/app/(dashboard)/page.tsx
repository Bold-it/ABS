'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [jobCounts, setJobCounts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Check localStorage on mount to see if banner was already dismissed this month
  useEffect(() => {
    const dismissedMonth = localStorage.getItem('abs_banner_dismissed_month');
    const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
    if (dismissedMonth === currentMonth) {
      setBannerDismissed(true);
    }
  }, []);

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

  const handleDismissBanner = () => {
    const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
    localStorage.setItem('abs_banner_dismissed_month', currentMonth);
    setBannerDismissed(true);
  };

  const currentMonth = new Date().getMonth();
  // Show alert in August(7), September(8), January(0), February(1)
  const isAlertMonth = [0, 1, 7, 8].includes(currentMonth);

  return (
    <div className="space-y-8">
      {/* Pre-Semester Alert Banner */}
      {isAlertMonth && !bannerDismissed && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm flex items-start gap-4 animate-pulse-slow">
          <span className="text-amber-500 text-2xl">⚠️</span>
          <div className="flex-1">
            <h3 className="text-amber-800 font-black text-xs uppercase tracking-widest mb-1">Pre-Semester Action Required</h3>
            <p className="text-amber-700 text-sm font-medium">
              A new semester is approaching. Please ensure the Moodle Administrator has created the overarching Academic Year and Semester folders in the LMS, and assigned the correct ID Numbers (e.g., FAST_DOCS_26_S1) to the Departments so ABS can sort courses perfectly.
            </p>
          </div>
          <button
            onClick={handleDismissBanner}
            title="Dismiss for this month"
            className="text-amber-500 hover:text-amber-800 hover:bg-amber-100 rounded-full w-7 h-7 flex items-center justify-center text-lg font-black transition-colors flex-shrink-0 ml-2"
          >
            ×
          </button>
        </div>
      )}
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

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500 italic text-left">"Automation is currently monitoring Finance and SOIS webhooks..."</p>
            <div className="flex flex-wrap gap-2">
              <button 
                  title="Pulls the latest course list from SOIS and creates any missing ones on Moodle"
                  onClick={async () => {
                      if(!confirm('Fetch and dynamically create all mounted courses from SOIS on Moodle?')) return;
                      const token = localStorage.getItem('abs_token');
                      try {
                        const res = await fetch('/api/admin/courses/sync-sois', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ year: '2025/2026', term: '1' })
                        });
                        const data = await res.json();
                        alert(`SOIS Course Sync Complete!\nTotal Fetched: ${data.totalFetched || 0}\nCourses Created: ${data.coursesCreated || 0}\nCourses Already Existed: ${data.coursesExisting || 0}`);
                      } catch (err: any) {
                        alert('Sync error: ' + err.message);
                      }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg hover:shadow-lg transition-all uppercase tracking-widest"
              >
                  Sync SOIS Courses
              </button>
              <button 
                  title="Checks every student's fee balance and suspends or unsuspends their Moodle access automatically"
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
              <button 
                  title="Locks out all students at the start of a new academic year. They will only be unsuspended when they register for courses on SOIS."
                  onClick={async () => {
                      if(!confirm('ATTENTION: This will restrict access for ALL active students immediately. They will remain locked out of Moodle until they register for courses. Proceed?')) return;
                      const token = localStorage.getItem('abs_token');
                      const res = await fetch('/api/admin/academic-year/rollover', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` }
                      });
                      const data = await res.json();
                      alert(data.message || 'Rollover triggered successfully.');
                  }}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-lg hover:shadow-lg transition-all uppercase tracking-widest"
              >
                  Trigger Rollover
              </button>
            </div>
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
