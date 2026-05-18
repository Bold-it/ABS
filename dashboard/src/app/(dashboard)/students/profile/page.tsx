'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function StudentDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudent = async () => {
      const token = localStorage.getItem('abs_token');
      try {
        const res = await fetch(`/api/admin/students/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setStudent(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchStudent();
  }, [id]);

  if (loading) return <div className="p-8 text-primary font-black uppercase tracking-widest animate-pulse">Scanning Registry...</div>;
  if (!student) return <div className="p-8 text-red-500 font-bold">Student not found.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header Profile */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-10 items-center">
        <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-5xl font-black text-primary border-4 border-white shadow-xl">
          {student.fullName.charAt(0)}
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 mb-2">
             <h1 className="text-4xl font-black text-gray-900 tracking-tight">{student.fullName}</h1>
             <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
               student.state === 'ACTIVE' ? 'bg-green-100 text-green-600' : 
               student.state === 'RESTRICTED' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
             }`}>
               {student.state}
             </span>
          </div>
          <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-xs">
            {student.programme} • LEVEL {student.level} • {student.indexNumber || 'PENDING INDEXING'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
            <button onClick={() => router.back()} className="px-6 py-3 bg-gray-50 text-gray-400 font-black rounded-2xl hover:bg-gray-100 transition-all uppercase text-[10px] tracking-widest">
                ← Return to Registry
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Account Integrity Timeline */}
        <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 mb-10 uppercase tracking-tight flex items-center gap-3">
            Automation Audit Trail
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          </h3>

          <div className="relative space-y-12 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-100 before:to-transparent">
            {student.auditLogs?.length > 0 ? student.auditLogs.map((log: any, i: number) => (
              <div key={i} className="relative flex items-start gap-8 group">
                <div className={`absolute left-0 mt-1.5 w-10 h-10 rounded-full border-4 border-white shadow-md flex items-center justify-center transition-transform group-hover:scale-110 z-10 ${
                    log.action.includes('FAILURE') ? 'bg-red-500' : 'bg-primary'
                }`}>
                    <span className="text-white text-[10px] font-black">{student.auditLogs.length - i}</span>
                </div>
                <div className="ml-14 flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-black text-gray-800 uppercase tracking-tight">{log.action.replace(/_/g, ' ')}</p>
                    <time className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {new Date(log.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed font-medium bg-gray-50 p-4 rounded-2xl border border-gray-100 italic">
                    "{log.details}"
                  </p>
                </div>
              </div>
            )) : (
              <div className="text-center py-20">
                <p className="text-gray-400 font-bold italic">No automated events recorded yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="space-y-8">
            <div className="bg-gray-900 p-8 rounded-[2.5rem] shadow-xl text-white">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Financial Standing</h4>
                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-2xl font-black">{student.paymentPercentage}%</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase">FEE THRESHOLD</span>
                        </div>
                        <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ${student.paymentPercentage > 60 ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${student.paymentPercentage}%` }}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Paid</p>
                            <p className="text-lg font-black">GHS {student.payments?.reduce((s: number, p: any) => s + Number(p.amount), 0) || 0}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Balance</p>
                            <p className="text-lg font-black text-red-400">GHS {student.feesTotal - (student.payments?.reduce((s: number, p: any) => s + Number(p.amount), 0) || 0)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">System Bridges</h4>
                <div className="space-y-4">
                    <BridgeStatus label="Institutional Email" active={student.m365EmailCreated} sub={student.schoolEmail} />
                    <BridgeStatus label="Moodle Identity" active={student.moodleAccountCreated} sub={student.indexNumber} />
                    <BridgeStatus label="SOIS Link" active={true} sub="Connected" />
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">LMS Operations Panel</h4>
                <div className="space-y-2">
                    <button 
                        onClick={async () => {
                            if(!confirm('Force manual status re-sync and enrollment for this student?')) return;
                            const token = localStorage.getItem('abs_token');
                            try {
                                const res = await fetch(`/api/admin/activate/${student.id}`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                const data = await res.json();
                                alert(data.message || 'Sync Triggered');
                                window.location.reload();
                            } catch(err: any) {
                                alert(err.message || 'Error occurred');
                            }
                        }}
                        className="w-full py-3 bg-primary text-white text-[10px] font-black rounded-2xl hover:shadow-lg hover:bg-primary-dark transition-all uppercase tracking-widest"
                    >
                        Force Sync Access
                    </button>
                    
                    <button 
                        disabled={!student.moodleAccountCreated}
                        onClick={async () => {
                            if(!confirm('Are you sure you want to reset this student\'s Moodle password to default (Student@123)?')) return;
                            const token = localStorage.getItem('abs_token');
                            try {
                                const res = await fetch(`/api/admin/students/reset-password/${student.id}`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` }
                                });
                                const data = await res.json();
                                if(data.success) {
                                    alert('Password reset successfully to: Student@123');
                                    window.location.reload();
                                } else {
                                    alert('Failed to reset password');
                                }
                            } catch(err: any) {
                                alert(err.message || 'Error occurred');
                            }
                        }}
                        className="w-full py-3 bg-white border border-gray-200 text-gray-700 text-[10px] font-black rounded-2xl hover:bg-gray-50 transition-all uppercase tracking-widest disabled:opacity-30"
                    >
                        Reset LMS Password
                    </button>
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Manual Course Mount</p>
                    <form 
                        onSubmit={async (e: any) => {
                            e.preventDefault();
                            const code = e.target.courseCode.value.trim().toUpperCase();
                            if(!code) return;
                            if(!confirm(`Manually enroll student in course code: ${code}?`)) return;
                            const token = localStorage.getItem('abs_token');
                            try {
                                const res = await fetch('/api/admin/students/enroll-manual', {
                                    method: 'POST',
                                    headers: { 
                                        'Content-Type': 'application/json',
                                        Authorization: `Bearer ${token}` 
                                    },
                                    body: JSON.stringify({ studentId: student.id, courseCode: code })
                                });
                                const data = await res.json();
                                if(data.success) {
                                    alert(`Successfully enrolled in ${code}!`);
                                    window.location.reload();
                                } else {
                                    alert(data.message || 'Enrollment failed');
                                }
                            } catch(err: any) {
                                alert(err.message || 'Error occurred');
                            }
                        }}
                        className="flex gap-2"
                    >
                        <input 
                            type="text" 
                            name="courseCode" 
                            placeholder="e.g. COS110" 
                            className="flex-1 px-4 py-2.5 text-xs font-bold border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary focus:border-transparent uppercase"
                        />
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-green-500 text-white text-[10px] font-black rounded-xl hover:bg-green-600 transition-all uppercase tracking-wider"
                        >
                            Enroll
                        </button>
                    </form>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentDetailPage() {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <StudentDetailContent />
    </Suspense>
  );
}

function BridgeStatus({ label, active, sub }: any) {
    return (
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <div className={`w-3 h-3 rounded-full ${active ? 'bg-green-500' : 'bg-gray-200'}`} />
            <div>
                <p className="text-[10px] font-black text-gray-800 uppercase tracking-tight">{label}</p>
                <p className="text-[9px] font-bold text-gray-400 truncate max-w-[150px]">{sub || 'Awaiting Sync'}</p>
            </div>
        </div>
    );
}
