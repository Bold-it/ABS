'use client';

import { useEffect, useState } from 'react';

export default function JobsPage() {
  const [failedJobs, setFailedJobs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const token = localStorage.getItem('abs_token');
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [failedRes, statsRes] = await Promise.all([
        fetch('/api/admin/jobs/failed', { headers }),
        fetch('/api/admin/stats', { headers }),
      ]);

      const failedData = await failedRes.json();
      const statsData = await statsRes.json();

      setFailedJobs(failedData);
      setStats(statsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: string) => {
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Job retry initiated successfully');
        fetchData();
      }
    } catch (err) {
        console.error(err);
    }
  };

  const [sweeping, setSweeping] = useState(false);

  const handleSweep = async () => {
    const token = localStorage.getItem('abs_token');
    setSweeping(true);
    try {
      const res = await fetch('/api/admin/jobs/sweep', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Queue auto-recovery sweep triggered successfully!');
        fetchData();
      } else {
        alert('Failed to trigger sweep.');
      }
    } catch (err) {
      console.error(err);
      alert('Error triggering sweep.');
    } finally {
      setSweeping(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Live Monitor Section */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Automation Engine Status</h2>
              <p className="text-xs text-gray-500 font-medium">Real-time parallel queue processor (6 worker threads) & crash-resilient auto-sweep</p>
            </div>
            <div className="flex items-center gap-3">
                <button
                  onClick={handleSweep}
                  disabled={sweeping}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition border border-indigo-200 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>⚡</span>
                  {sweeping ? 'Sweeping...' : 'Trigger Queue Sweep'}
                </button>
                <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                    <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Moodle Queue Active</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <QueueBox 
              label="Waiting" 
              value={(stats?.queue?.pendingJobs ?? 0) + (stats?.pendingRegistrations ?? 0)} 
              color="bg-amber-50 text-amber-600" 
            />
            <QueueBox 
              label="Active Workers" 
              value={`${stats?.queue?.activeWorkers ?? 0} / ${stats?.queue?.concurrency ?? 6}`} 
              color="bg-indigo-50 text-indigo-600" 
            />
            <QueueBox 
              label="Completed" 
              value={stats?.provisioned ?? stats?.active ?? 0} 
              color="bg-green-50 text-green-600" 
            />
            <QueueBox 
              label="Attention Needed" 
              value={failedJobs.length} 
              color="bg-red-50 text-red-600" 
            />
        </div>

        {/* Active Animated Sweeping Bar */}
        {sweeping && (
          <div className="mt-6 space-y-2 bg-indigo-50/80 p-4 rounded-2xl border border-indigo-200">
            <div className="flex justify-between items-center text-xs">
              <span className="text-indigo-800 font-bold flex items-center gap-2">
                <span className="animate-spin">⚙️</span>
                Auto-Recovery Sweep Running: Inspecting database for pending registrations & stuck accounts...
              </span>
              <span className="text-indigo-600 font-mono text-[11px] font-bold">Active</span>
            </div>
            <div className="w-full h-2.5 bg-indigo-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-indigo-600 w-full animate-pulse" />
            </div>
          </div>
        )}

        {/* Operational Notice */}
        <div className="mt-8 bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-bold uppercase tracking-wider text-xs">
            <span>⚡</span>
            <span>Automation Directive: 6-Worker Parallel Queue & Self-Healing Crash Recovery</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-300 text-[11px] leading-relaxed">
            <div>
              <p className="font-semibold text-slate-100 mb-1">• Continuous Auto-Sweep (Every 3 Mins):</p>
              <p className="text-slate-400">
                The engine runs automatically in the background. If Passenger restarts or memory limits recycle Node.js, the auto-sweep scans MySQL for students with <code className="text-indigo-300">pendingCourses</code> and immediately re-queues them. Zero course registrations will be dropped.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100 mb-1">• Manual Trigger Queue Sweep:</p>
              <p className="text-slate-400">
                Use the <span className="text-indigo-300 font-semibold">Trigger Queue Sweep</span> button to force an immediate recovery cycle without waiting for the 3-minute cron. All worker threads will immediately spawn to process queued admissions and enrollments in parallel.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Failed Jobs Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest px-2">Recently Failed Tasks (Final Errors)</h3>
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <th className="px-6 py-4">Job ID</th>
                            <th className="px-6 py-4">Context</th>
                            <th className="px-6 py-4">Failure Reason</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                        {Array.isArray(failedJobs) && failedJobs.map((job) => (
                            <tr key={job.id} className="hover:bg-red-50/30 transition-colors">
                                <td className="px-6 py-4 font-mono text-xs font-bold text-gray-400">#{job.id}</td>
                                <td className="px-6 py-4">
                                    <p className="font-bold text-gray-700">{job.action || 'PENDING_TASK'}</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                                      Student: {job.student?.fullName || 'Unknown'} ({job.student?.indexNumber || job.student?.admissionId || 'No ID'})
                                    </p>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-xs text-red-600 font-medium max-w-sm line-clamp-2">{job.details || job.failedReason || 'No reason provided'}</p>
                                </td>
                                <td className="px-6 py-4">
                                    {job.type === 'PENDING_ONBOARDING' ? (
                                        <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-600 text-[10px] font-black uppercase">PENDING</span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-black uppercase">FAILED</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => handleRetry(job.id)}
                                        className="px-4 py-2 bg-primary text-white text-[10px] font-black rounded-lg hover:opacity-90 transition-all shadow-sm"
                                    >
                                        RETRY MANUAL
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {failedJobs.length === 0 && !loading && (
                    <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-2">
                        <span className="text-4xl">🚀</span>
                        <p className="italic font-medium">All systems green. No failed jobs found in the queue.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

function QueueBox({ label, value, color }: any) {
    return (
        <div className={`p-6 rounded-2xl ${color.split(' ')[0]} border border-gray-100 flex flex-col items-center text-center shadow-sm`}>
            <p className={`text-4xl font-black ${color.split(' ')[1]}`}>{value}</p>
            <p className="text-xs font-black uppercase tracking-widest mt-2">{label}</p>
        </div>
    );
}
