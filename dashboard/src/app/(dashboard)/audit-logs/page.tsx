'use client';

import { useEffect, useState } from 'react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const token = localStorage.getItem('abs_token');
      try {
        const res = await fetch('/api/admin/audit-logs', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">System Audit Trail</h2>
          <p className="text-sm text-gray-400 mt-1">Real-time log of every action performed by the ABS Bridge.</p>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Live Feed</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Student Context</th>
                <th className="px-6 py-4">Action Taken</th>
                <th className="px-6 py-4">Payload / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-xs font-bold text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</p>
                    <p className="text-[10px] font-medium text-gray-300 uppercase">{new Date(log.timestamp).toLocaleTimeString()}</p>
                  </td>
                  <td className="px-6 py-4">
                    {log.student ? (
                        <div>
                            <p className="text-sm font-bold text-gray-800">{log.student.fullName}</p>
                            <p className="text-[10px] font-mono text-gray-400 uppercase">{log.student.admissionId}</p>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">Global Action</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-md bg-primary-light text-primary text-[10px] font-black uppercase tracking-tight">
                        {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-gray-500 leading-relaxed max-w-md">{log.details}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && !loading && (
            <div className="p-12 text-center text-gray-400 italic">No logs found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
