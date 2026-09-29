'use client';

import { useEffect, useState } from 'react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

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

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000); // 15s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleExportCSV = () => {
    if (logs.length === 0) {
      alert("No audit logs to export.");
      return;
    }
    const headers = ["ID", "Timestamp", "Student Name", "Student Index/Admission", "Programme", "Action", "Details"];
    const rows = logs.map(l => [
      l.id,
      new Date(l.timestamp).toLocaleString(),
      l.student?.fullName || "Global System",
      l.student?.indexNumber || l.student?.admissionId || l.studentId || "N/A",
      l.student?.programme || "N/A",
      l.action,
      (l.details || "").replace(/"/g, '""')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HTU_ABS_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = logs.filter(log => {
    const sName = log.student?.fullName || '';
    const sIndex = log.student?.indexNumber || log.student?.admissionId || log.studentId || '';
    const details = log.details || '';
    const action = log.action || '';

    const matchesSearch = 
      sName.toLowerCase().includes(search.toLowerCase()) ||
      sIndex.toLowerCase().includes(search.toLowerCase()) ||
      details.toLowerCase().includes(search.toLowerCase()) ||
      action.toLowerCase().includes(search.toLowerCase());

    const matchesAction = !selectedAction || action.toUpperCase().includes(selectedAction.toUpperCase());

    return matchesSearch && matchesAction;
  });

  const getBadgeStyle = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('ONBOARD') || act.includes('ACTIVATE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (act.includes('REGISTR') || act.includes('ENROLL')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    } else if (act.includes('PAY') || act.includes('FEE')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (act.includes('COURSE') || act.includes('MOODLE')) {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    } else {
      return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">System Audit Trail</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Real-time immutable log of every action performed by the ABS Bridge.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-black rounded-2xl shadow-sm hover:shadow transition-all uppercase tracking-wider flex items-center gap-2"
          >
            <span>📊</span> Export CSV
          </button>

          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-black text-emerald-800 uppercase tracking-widest">Live Feed</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full md:w-auto relative">
          <input
            type="text"
            placeholder="Search logs by student name, index number, or action details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-primary transition-all"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        </div>

        <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {[
            { label: 'ALL', value: '' },
            { label: 'ONBOARDING', value: 'ONBOARD' },
            { label: 'REGISTRATION', value: 'REGISTR' },
            { label: 'PAYMENTS', value: 'PAY' },
            { label: 'COURSES', value: 'COURSE' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setSelectedAction(item.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedAction === item.value
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Student Context</th>
                <th className="px-6 py-4">Action Taken</th>
                <th className="px-6 py-4">Payload / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-medium">
                    Loading system audit logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-medium">
                    No matching audit logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-bold text-gray-900">{new Date(log.timestamp).toLocaleDateString()}</p>
                      <p className="text-[10px] font-mono text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      {log.student ? (
                        <div>
                          <p className="text-sm font-bold text-gray-900">{log.student.fullName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono font-bold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                              {log.student.indexNumber || log.student.admissionId}
                            </span>
                            {log.student.programme && (
                              <span className="text-[10px] text-gray-500 font-medium">
                                {log.student.programme}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : log.studentId ? (
                        <div>
                          <p className="text-xs font-bold text-gray-700">Student Ref: {log.studentId}</p>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-lg border border-gray-200 uppercase">
                          ⚙️ Global System
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${getBadgeStyle(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 leading-relaxed max-w-lg font-medium">
                        {log.details}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
