'use client';

import { useState, useEffect } from 'react';

export default function SimulationPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  // Admission Form State
  const [admissionForm, setAdmissionForm] = useState({
    admissionId: '',
    fullName: '',
    email: '',
    phone: '',
    programme: 'BSc Computer Science',
    level: '100',
    feesTotal: 5000,
  });

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    admissionId: '',
    amount: 1000,
    reference: '',
  });

  // Course Form State
  const [courseForm, setCourseForm] = useState({
    admissionId: '',
    courseCode: 'CS101',
    courseName: 'Introduction to Programming',
  });

  // Results Form State
  const [resultForm, setResultForm] = useState({
    admissionId: '',
    results: [
        { courseCode: 'MATH161', grade: 'B+', score: 75 },
        { courseCode: 'CLT112', grade: 'A', score: 85 },
        { courseCode: 'COS110', grade: 'B', score: 70 }
    ]
  });

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/students', {
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

  const addLog = (msg: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));
  };

  const handleRandomize = () => {
    const id = Math.floor(10000000 + Math.random() * 90000000).toString();
    const names = ['Kofi Mensah', 'Ama Serwaa', 'John Doe', 'Sarah Boateng', 'Ekow Taylor'];
    setAdmissionForm({
      ...admissionForm,
      admissionId: id,
      fullName: names[Math.floor(Math.random() * names.length)],
      email: `student_${id}@example.edu.gh`,
      phone: `+233${Math.floor(200000000 + Math.random() * 700000000)}`,
    });
  };

  const submitAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog(`Sending admission for ${admissionForm.admissionId}...`);
    try {
      const res = await fetch('/api/webhooks/admission', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-KEY': '32b211c8bac34b69a303996dc2eb7640'
        },
        body: JSON.stringify(admissionForm),
      });
      const data = await res.json();
      addLog(`SUCCESS: ${JSON.stringify(data)}`);
      fetchStudents();
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    }
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.admissionId) return alert('Select a student first');
    
    const reference = `PAY-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const payload = {
      ...paymentForm,
      reference,
      paidAt: new Date().toISOString(),
    };

    addLog(`Sending payment of ${paymentForm.amount} for ${paymentForm.admissionId}...`);
    try {
      const res = await fetch('/api/webhooks/payment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-KEY': '32b211c8bac34b69a303996dc2eb7640'
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      addLog(`SUCCESS: ${JSON.stringify(data)}`);
      fetchStudents();
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    }
  };

  const submitCourseAction = async (action: 'registration' | 'drop') => {
    if (!courseForm.admissionId) return alert('Select a student first');
    
    const endpoint = action === 'registration' ? 'course-registration' : 'course-drop';
    addLog(`Sending course ${action} for ${courseForm.admissionId}...`);
    
    const payload = action === 'registration' ? {
        admissionId: courseForm.admissionId,
        courses: [
            { courseCode: courseForm.courseCode, courseName: courseForm.courseName },
            { courseCode: 'MATH161', courseName: 'Introduction to Statistics' },
            { courseCode: 'CLT112', courseName: 'Computer Literacy I' }
        ]
    } : courseForm;

    try {
      const res = await fetch(`/api/webhooks/${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-KEY': '32b211c8bac34b69a303996dc2eb7640'
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      addLog(`SUCCESS: ${JSON.stringify(data)}`);
      fetchStudents();
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    }
  };

  const submitResults = async () => {
    if (!resultForm.admissionId) return alert('Select a student first');
    
    addLog(`Publishing results for ${resultForm.admissionId}...`);
    try {
      const res = await fetch(`/api/webhooks/result-publication`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-KEY': '32b211c8bac34b69a303996dc2eb7640'
        },
        body: JSON.stringify({ ...resultForm }),
      });
      const data = await res.json();
      addLog(`SUCCESS: ${JSON.stringify(data)}`);
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    }
  };

  const triggerFeeReminders = async () => {
    addLog('Triggering Daily Fee Reminders...');
    try {
        const res = await fetch(`/api/scheduler/process-reminders?key=abs_secret_cron_key`);
        const data = await res.json();
        addLog(`SUCCESS: Sent ${data.count} reminders.`);
    } catch (err: any) {
        addLog(`ERROR: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* SOIS Simulator */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">SOIS Admission Simulator</h3>
            <div className="flex gap-2">
              <button 
                onClick={handleRandomize}
                className="text-[10px] font-black text-primary bg-primary-light px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-all"
              >
                RANDOMIZE DATA
              </button>
              <button 
                onClick={triggerFeeReminders}
                className="text-[10px] font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-600 hover:text-white transition-all border border-amber-100"
              >
                TRIGGER REMINDERS
              </button>
            </div>
          </div>

          <form onSubmit={submitAdmission} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SimInput label="Admission ID" value={admissionForm.admissionId} onChange={(v: string) => setAdmissionForm({...admissionForm, admissionId: v})} />
              <SimInput label="Full Name" value={admissionForm.fullName} onChange={(v: string) => setAdmissionForm({...admissionForm, fullName: v})} />
              <SimInput label="Email" value={admissionForm.email} onChange={(v: string) => setAdmissionForm({...admissionForm, email: v})} />
              <SimInput label="Phone" value={admissionForm.phone} onChange={(v: string) => setAdmissionForm({...admissionForm, phone: v})} />
              <SimInput label="Programme" value={admissionForm.programme} onChange={(v: string) => setAdmissionForm({...admissionForm, programme: v})} />
              <SimInput label="Fees Total" type="number" value={admissionForm.feesTotal.toString()} onChange={(v: string) => setAdmissionForm({...admissionForm, feesTotal: parseInt(v)})} />
            </div>
            <button type="submit" className="w-full py-4 bg-primary text-white font-black rounded-xl hover:opacity-90 transition-opacity mt-4 shadow-lg shadow-primary/20">
              TRIGGER ADMISSION HOOK
            </button>
          </form>
        </div>

        {/* Finance Simulator */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-6">Finance Gateway Simulator</h3>
          
          <form onSubmit={submitPayment} className="space-y-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Target Student</label>
              <select 
                value={paymentForm.admissionId}
                onChange={(e) => setPaymentForm({...paymentForm, admissionId: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary outline-none text-sm font-bold bg-gray-50"
              >
                <option value="">Select an admitted student...</option>
                {students.map(s => (
                  <option key={s.id} value={s.admissionId}>
                    {s.fullName} ({s.admissionId}) - Paid {s.paymentPercentage}%
                  </option>
                ))}
              </select>
            </div>

            <SimInput 
              label="Payment Amount (GHS)" 
              type="number" 
              value={paymentForm.amount.toString()} 
              onChange={(v: string) => setPaymentForm({...paymentForm, amount: parseInt(v)})} 
            />

            <button type="submit" className="w-full py-4 bg-green-500 text-white font-black rounded-xl hover:opacity-90 transition-opacity mt-4 shadow-lg shadow-green-500/20 uppercase">
              PROCESS BANK PAYMENT
            </button>
          </form>

            <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-600 font-bold leading-relaxed italic">
              "This mimics the bank-to-school transaction. Once processed, the ABS Bridge will evaluate threshold rules (60%) and trigger A5-A11 if applicable."
            </p>
          </div>
        </div>

        {/* Course Portal Simulator */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-6">Student Portal Simulator</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Target Student</label>
              <select 
                value={courseForm.admissionId}
                onChange={(e) => {
                    setCourseForm({...courseForm, admissionId: e.target.value});
                    setPaymentForm({...paymentForm, admissionId: e.target.value});
                }}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary outline-none text-sm font-bold bg-gray-50"
              >
                <option value="">Select a student...</option>
                {students.filter(s => s.state === 'ACTIVE').map(s => (
                  <option key={s.id} value={s.admissionId}>
                    {s.fullName} ({s.indexNumber || s.admissionId})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-2 italic">* Only ACTIVE students can register courses</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <SimInput 
                    label="Course Code" 
                    value={courseForm.courseCode} 
                    onChange={(v: string) => setCourseForm({...courseForm, courseCode: v})} 
                />
                <SimInput 
                    label="Course Name" 
                    value={courseForm.courseName} 
                    onChange={(v: string) => setCourseForm({...courseForm, courseName: v})} 
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button 
                    onClick={() => submitCourseAction('registration')}
                    className="py-4 bg-primary text-white font-black rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 uppercase text-xs"
                >
                    Register Course
                </button>
                <button 
                    onClick={() => submitCourseAction('drop')}
                    className="py-4 bg-gray-800 text-white font-black rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-gray-800/20 uppercase text-xs"
                >
                    Drop Course
                </button>
            </div>
          </div>

          <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs text-amber-600 font-bold leading-relaxed italic">
              "This mimics the Student Portal. Registration triggers A12 (Moodle Enrollment) and Drop triggers A14 (Moodle Removal)."
            </p>
          </div>
        </div>

        {/* Results Simulator */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-6">Academic System Simulator</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Target Student</label>
              <select 
                value={resultForm.admissionId}
                onChange={(e) => {
                    setResultForm({...resultForm, admissionId: e.target.value});
                    setCourseForm({...courseForm, admissionId: e.target.value});
                }}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary outline-none text-sm font-bold bg-gray-50"
              >
                <option value="">Select a student...</option>
                {students.filter(s => s.state === 'ACTIVE').map(s => (
                  <option key={s.id} value={s.admissionId}>
                    {s.fullName} ({s.indexNumber || s.admissionId})
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Pending Grades to Sync</p>
                {resultForm.results.map((r, i) => (
                    <div key={i} className="flex justify-between text-xs font-bold text-gray-600 border-b border-gray-200 pb-2">
                        <span>{r.courseCode}</span>
                        <span className="text-primary">{r.grade} ({r.score}%)</span>
                    </div>
                ))}
            </div>

            <button 
                onClick={submitResults}
                className="w-full py-4 bg-purple-600 text-white font-black rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-purple-600/20 uppercase"
            >
                PUBLISH ALL RESULTS
            </button>
          </div>

          <div className="mt-8 p-4 bg-purple-50 rounded-xl border border-purple-100">
            <p className="text-xs text-purple-600 font-bold leading-relaxed italic">
              "This mimics the Academic Portal. Triggers A23 (Grade Sync to Moodle) and A22 (Result SMS Notification)."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bulk Student CSV Upload */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Bulk CSV Intelligence</h3>
                <span className="text-[10px] font-bold text-green-500 bg-green-50 px-2 py-1 rounded">SOIS EMULATOR</span>
            </div>
            <p className="text-xs text-gray-400 mb-6 font-medium">Upload a CSV file containing student records. The system will automatically parse and admit each student.</p>
            
            <div 
                className="w-full h-48 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer group"
                onClick={() => document.getElementById('csv-file-input')?.click()}
            >
                <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">📄</span>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Drop CSV here or click to browse</p>
                <input 
                    type="file" 
                    id="csv-file-input" 
                    className="hidden" 
                    accept=".csv" 
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        addLog(`Reading CSV: ${file.name}...`);
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                            const text = event.target?.result as string;
                            try {
                                const token = localStorage.getItem('abs_token');
                                const res = await fetch('/api/admin/students/upload-csv', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ csvText: text }),
                                });
                                const results = await res.json();
                                addLog(`UPLOAD SUCCESS: Processed ${results.length} students.`);
                                fetchStudents();
                            } catch (err: any) {
                                addLog(`UPLOAD ERROR: ${err.message}`);
                            }
                        };
                        reader.readAsText(file);
                    }}
                />
            </div>
        </div>

        {/* Real-time Log Console (Upgraded) */}
        <div className="bg-gray-900 rounded-3xl p-8 shadow-2xl font-mono border-[10px] border-gray-800 flex flex-col h-[400px]">
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-4">Live System Event Bridge</h4>
                <button onClick={() => setLog([])} className="text-[10px] text-gray-500 hover:text-white transition-colors">CLEAR_BUFFER</button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-4">
                {log.map((line, i) => (
                    <div key={i} className="flex gap-4">
                        <span className="text-gray-600 text-[10px] shrink-0">{line.split(']')[0]}]</span>
                        <p className={`text-xs ${line.includes('ERROR') ? 'text-red-400' : line.includes('SUCCESS') ? 'text-blue-400' : 'text-green-500'}`}>
                            {line.split(']')[1]}
                        </p>
                    </div>
                ))}
                {log.length === 0 && <p className="text-xs text-gray-700 italic">No activity detected. Awaiting system events...</p>}
            </div>
        </div>
      </div>
    </div>
  );
}

function SimInput({ label, value, onChange, type = 'text' }: any) {
  return (
    <div>
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm font-bold bg-gray-50/50"
      />
    </div>
  );
}
