'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function StudentsListContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || '';

  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState(initialStatus);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const router = useRouter();

  const fetchStudents = async () => {
    const token = localStorage.getItem('abs_token');
    const url = new URL('/api/admin/students', window.location.origin);
    if (searchTerm) url.searchParams.append('search', searchTerm);
    if (filterStatus) url.searchParams.append('status', filterStatus);

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStudents(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (students.length === 0) {
      alert("No student data available to export.");
      return;
    }
    const headers = ["ID", "Full Name", "Admission/Index Number", "Programme", "Level", "Fees Paid %", "Status", "Moodle Provisioned"];
    const rows = students.map(s => [
      s.id,
      s.fullName,
      s.indexNumber || s.admissionId,
      s.programme,
      s.level,
      `${s.paymentPercentage}%`,
      s.state,
      s.moodleAccountCreated ? "YES" : "NO"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HTU_LMS_Student_Report_${filterStatus || 'ALL'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateReport = () => {
    if (students.length === 0) {
      alert("No student data available to generate report.");
      return;
    }
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert("Please allow popups to view the report.");
      return;
    }

    const totalStudents = students.length;
    const activeEnrolled = students.filter(s => s.state === 'ACTIVE').length;
    const restricted = students.filter(s => s.state === 'RESTRICTED').length;
    const pending = students.filter(s => s.state === 'PENDING').length;
    const averageFees = Math.round(students.reduce((acc, s) => acc + s.paymentPercentage, 0) / totalStudents);

    const rows = students.map((s, index) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${index + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${s.fullName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${s.indexNumber || s.admissionId}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${s.programme} (L${s.level})</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${s.paymentPercentage}%</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${
            s.state === 'ACTIVE' ? '#D1FAE5; color: #065F46;' :
            s.state === 'RESTRICTED' ? '#FEE2E2; color: #991B1B;' : '#FEF3C7; color: #92400E;'
          }">${s.state}</span>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${s.moodleAccountCreated ? '🟢 Provisioned' : '🔴 Missing'}</td>
      </tr>
    `).join("");

    reportWindow.document.write(`
      <html>
        <head>
          <title>HTU ABS Bridge - Academic & LMS Status Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0D3F7C; padding-bottom: 20px; }
            .logo { height: 70px; }
            .title { text-align: right; }
            .title h1 { margin: 0; color: #0D3F7C; font-size: 24px; text-transform: uppercase; }
            .title p { margin: 5px 0 0 0; color: #666; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
            .stats-grid { display: grid; grid-cols: 4; display: flex; justify-content: space-between; margin: 30px 0; gap: 15px; }
            .stat-card { flex: 1; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; }
            .stat-card h3 { margin: 0 0 5px 0; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
            .stat-card p { margin: 0; font-size: 20px; font-weight: bold; color: #0D3F7C; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #0D3F7C; color: white; padding: 12px; text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
            .print-btn { display: block; width: 150px; padding: 10px; background: #0D3F7C; color: white; border: none; border-radius: 6px; font-weight: bold; text-align: center; cursor: pointer; text-decoration: none; margin-bottom: 20px; }
            @media print { .print-btn { display: none; } }
          </style>
        </head>
        <body>
          <button class="print-btn" onclick="window.print()">🖨️ Print Report</button>
          
          <div class="header">
            <img class="logo" src="/logo.png" alt="HTU Logo" />
            <div class="title">
              <h1>Ho Technical University</h1>
              <p>LMS Automated Bridge Integration Report</p>
            </div>
          </div>
          
          <div style="margin-top: 20px; font-size: 11px; color: #666;">
            <strong>Generated on:</strong> ${new Date().toLocaleString()} | <strong>Filter Applied:</strong> ${filterStatus || 'ALL STUDENTS'}
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <h3>Total Students</h3>
              <p>${totalStudents}</p>
            </div>
            <div class="stat-card">
              <h3>Active Enrolled</h3>
              <p style="color: #10B981;">${activeEnrolled}</p>
            </div>
            <div class="stat-card">
              <h3>Restricted / Blocked</h3>
              <p style="color: #EF4444;">${restricted}</p>
            </div>
            <div class="stat-card">
              <h3>Average Fees Paid</h3>
              <p style="color: #F5A623;">${averageFees}%</p>
            </div>
          </div>

          <h2>Student Registry Details</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 25%;">Student Name</th>
                <th style="width: 15%;">Index Number</th>
                <th style="width: 25%;">Programme & Level</th>
                <th style="width: 10%;">Fees Paid</th>
                <th style="width: 10%;">Status</th>
                <th style="width: 10%;">Moodle Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          
          <div style="margin-top: 50px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            Ho Technical University Auto Bridge Service © 2026. This report was dynamically generated.
          </div>
        </body>
      </html>
    `);
    reportWindow.document.close();
  };

  useEffect(() => {
    fetchStudents();
  }, [searchTerm, filterStatus]);

  const openDrawer = async (student: any) => {
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fullProfile = await res.json();
      setSelectedStudent(fullProfile);
      setDrawerOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualActivate = async (id: string) => {
    const token = localStorage.getItem('abs_token');
    if (!confirm('Are you sure you want to force manifest activation? This bypasses the fee threshold check.')) return;

    try {
      const res = await fetch(`/api/admin/activate/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      alert(data.message || 'Job queued');
      fetchStudents();
    } catch (err: any) {
      alert(err.message || 'Error occurred');
    }
  };

  return (
    <div className="relative min-h-full">
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 mb-8">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Search by name or index..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none shadow-sm bg-white"
            />
            <span className="absolute left-3 top-3.5 opacity-40">🔍</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {['', 'PENDING', 'ADMITTED', 'ACTIVE', 'RESTRICTED'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  filterStatus === status 
                    ? 'bg-primary text-white shadow-md' 
                    : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
                }`}
              >
                {status || 'ALL'}
              </button>
            ))}
          </div>
        </div>

        {/* Smart Report Center */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleExportCSV}
            className="px-4 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-black rounded-xl hover:shadow transition-all uppercase tracking-wider flex items-center gap-2"
          >
            <span>📊</span> Export CSV
          </button>
          <button
            onClick={handleGenerateReport}
            className="px-4 py-3 bg-primary text-white hover:opacity-90 text-xs font-black rounded-xl hover:shadow transition-all uppercase tracking-wider flex items-center gap-2"
          >
            <span>✨</span> Smart Report
          </button>
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Programme / Level</th>
                <th className="px-6 py-4">Fees Paid</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Moodle</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map((student) => (
                <tr 
                  key={student.id} 
                  className="hover:bg-primary-light/30 transition-colors cursor-pointer group"
                  onClick={() => router.push(`/students/profile?id=${student.id}`)}
                >
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-800 group-hover:text-primary">{student.fullName}</p>
                    <p className="text-xs text-gray-400 font-medium font-mono">{student.indexNumber || student.admissionId}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-600">{student.programme}</p>
                    <p className="text-xs text-gray-400 font-medium">Level {student.level}</p>
                  </td>
                  <td className="px-6 py-4 w-48">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-500 ${student.paymentPercentage >= 60 ? 'bg-green-500' : 'bg-primary'}`} 
                                style={{ width: `${student.paymentPercentage}%` }}
                            />
                        </div>
                        <span className="text-xs font-black text-gray-700">{student.paymentPercentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge state={student.state} />
                  </td>
                  <td className="px-6 py-4">
                    {student.moodleAccountCreated ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-green-500">
                            <span className="w-2 h-2 bg-green-500 rounded-full" /> Provisioned
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
                            <span className="w-2 h-2 bg-gray-300 rounded-full" /> Missing
                        </div>
                    )}
                  </td>
                    <td className="px-6 py-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => router.push(`/students/profile?id=${student.id}`)}
                        className="px-4 py-2 bg-gray-50 border border-gray-200 text-gray-500 text-[10px] font-black rounded-lg hover:bg-gray-100 transition-all uppercase tracking-widest"
                    >
                        VIEW PROFILE
                    </button>
                    <button
                        disabled={student.moodleAccountCreated}
                        onClick={() => handleManualActivate(student.id)}
                        className="px-4 py-2 bg-white border border-gray-200 text-primary text-[10px] font-black rounded-lg hover:bg-primary hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-primary uppercase tracking-widest"
                    >
                        FORCE SYNC
                    </button>
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Detail Drawer */}
      {drawerOpen && selectedStudent && (
        <>
            <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <div className="fixed right-0 top-0 h-screen w-full max-w-xl bg-white z-50 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
                <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-primary text-white">
                    <div>
                        <h2 className="text-2xl font-black">{selectedStudent.student.fullName}</h2>
                        <p className="opacity-70 font-mono text-sm">{selectedStudent.student.indexNumber || selectedStudent.student.admissionId}</p>
                    </div>
                    <button onClick={() => setDrawerOpen(false)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl">✕</button>
                </div>

                <div className="p-8 space-y-10">
                    <section>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Account Information</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <InfoBox label="School Email" value={selectedStudent.student.schoolEmail || 'Not provisioned'} />
                            <InfoBox label="Personal Email" value={selectedStudent.student.email} />
                            <InfoBox label="Phone Number" value={selectedStudent.student.phone} />
                            <InfoBox label="Moodle ID" value={selectedStudent.student.moodleUserId || 'None'} />
                        </div>
                    </section>

                    <section>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">ABS Automation History</h4>
                        <div className="space-y-4">
                            {selectedStudent.logs.length > 0 ? selectedStudent.logs.map((log: any) => (
                                <div key={log.id} className="flex gap-4 items-start">
                                    <div className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{log.action}</p>
                                        <p className="text-xs text-gray-400">{log.details}</p>
                                        <p className="text-[10px] font-medium text-gray-300 mt-1 uppercase">{new Date(log.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-sm text-gray-400 italic">No automation logs recorded for this student yet.</p>
                            )}
                        </div>
                    </section>

                    <section>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Payment Timeline</h4>
                        <div className="space-y-3">
                            {selectedStudent.payments.map((p: any) => (
                                <div key={p.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                                    <div>
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-tighter">REF: {p.reference}</p>
                                        <p className="text-sm font-bold text-primary mt-0.5">+{ (p.amount/100).toLocaleString() } GHS</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-500">{p.percentage}% Total</p>
                                        <p className="text-[10px] font-medium text-gray-300 uppercase">{new Date(p.paidAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const styles: any = {
    PENDING: 'bg-gray-100 text-gray-500',
    ADMITTED: 'bg-blue-100 text-blue-500',
    ACTIVE: 'bg-green-100 text-green-500',
    RESTRICTED: 'bg-red-100 text-red-500',
  };
  return (
    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${styles[state] || 'bg-gray-100 text-gray-500'}`}>
      {state}
    </span>
  );
}

function InfoBox({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-sm font-bold text-gray-700 truncate">{value}</p>
    </div>
  );
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-primary font-black uppercase tracking-widest animate-pulse">Scanning Registry...</div>}>
      <StudentsListContent />
    </Suspense>
  );
}
