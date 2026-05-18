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

  return (
    <div className="space-y-8">
      {/* Live Monitor Section */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Automation Engine Status</h2>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                <span className="text-xs font-black text-primary uppercase tracking-widest">BullMQ Live</span>
            </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <QueueBox label="Waiting" value="0" color="bg-gray-50 text-gray-400" />
            <QueueBox label="Active" value="0" color="bg-primary-light text-primary" />
            <QueueBox label="Completed" value={stats?.active || 0} color="bg-green-50 text-green-600" />
            <QueueBox label="Failed" value={failedJobs.length} color="bg-red-50 text-red-600" />
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
                                    <p className="font-bold text-gray-700">{job.name}</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Student ID: {job.data.studentId}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-xs text-red-600 font-medium max-w-sm line-clamp-2">{job.failedReason || 'No reason provided'}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-black uppercase">FAILED</span>
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
