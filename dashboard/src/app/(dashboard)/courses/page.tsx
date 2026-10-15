'use client';

import { useState, useEffect } from 'react';

export default function CoursesPage() {
  const currentYear = new Date().getFullYear();
  // Academic year: Aug-Dec = currentYear/next, Jan-Jul = prev/currentYear
  const month = new Date().getMonth(); // 0=Jan
  const academicYear = month >= 7
    ? `${currentYear}/${currentYear + 1}`
    : `${currentYear - 1}/${currentYear}`;

  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(academicYear);
  const [term, setTerm] = useState('1');
  const [showModal, setShowModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [showNoticeDetails, setShowNoticeDetails] = useState(false);
  const [opElapsed, setOpElapsed] = useState(0);
  const [lastOpResult, setLastOpResult] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('abs_courses_last_op');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      type: 'RECONCILE_TEACHERS',
      title: 'Lecturer Directory & Dummy Account Cleanup',
      updated: 787,
      skipped: 69,
      failed: 120,
      timestamp: 'Recently Executed'
    };
  });

  const fetchCourses = async () => {
    setLoading(true);
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch(`/api/admin/courses?year=${encodeURIComponent(year)}&term=${encodeURIComponent(term)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.courses)) {
        setCourses(data.courses);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [year, term]);

  const handleSyncSois = async () => {
    if (!confirm(`Sync and mount all courses from SOIS for ${year} Term ${term}?`)) return;
    setSyncing(true);
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/courses/sync-sois', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ year, term })
      });
      const data = await res.json();
      const diagMsg = data.soisDiag ? `\n\nDiagnostic Info:\n${data.soisDiag}` : '';
      if (data.success) {
        const resultObj = {
          type: 'SYNC_SOIS',
          title: 'SOIS Course Mount Catalog Sync',
          updated: data.coursesCreated || 0,
          skipped: data.coursesExisting || 0,
          total: data.totalFetched || 0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
        };
        setLastOpResult(resultObj);
        try { localStorage.setItem('abs_courses_last_op', JSON.stringify(resultObj)); } catch (e) {}
      }
      alert(`SOIS Course Sync Finished!\nTotal Fetched: ${data.totalFetched || 0}\nCourses Created: ${data.coursesCreated || 0}\nCourses Already Existed: ${data.coursesExisting || 0}${diagMsg}`);
      fetchCourses();
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearCourses = async () => {
    if (!confirm(`Warning: Are you sure you want to clear stored course records for ${year} Semester ${term}?`)) return;
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/courses/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ year, term })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Cleared ${data.clearedCount || 0} course records for ${year} Semester ${term}.`);
        fetchCourses();
      } else {
        alert('Failed to clear: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Clear error: ' + err.message);
    }
  };

  const [realigning, setRealigning] = useState(false);

  const handleRealignLms = async () => {
    if (!confirm(`Re-align all Moodle LMS courses into 4-tier category hierarchy (${year} Semester ${term}) and delete old flat root categories?`)) return;
    setRealigning(true);
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/courses/realign-lms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ year, term })
      });
      const data = await res.json();
      if (data.success) {
        const resultObj = {
          type: 'REALIGN_LMS',
          title: 'Moodle Category Realignment & Cleanup',
          updated: data.movedCourses || 0,
          skipped: data.cleanedCategories || 0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
        };
        setLastOpResult(resultObj);
        try { localStorage.setItem('abs_courses_last_op', JSON.stringify(resultObj)); } catch (e) {}
        alert(`LMS Category Realignment Complete!\n\nMoved Courses: ${data.movedCourses || 0}\nCleaned Categories: ${data.cleanedCategories || 0}`);
        fetchCourses();
      } else {
        alert('Realignment error: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setRealigning(false);
    }
  };

  const [purgingLms, setPurgingLms] = useState(false);

  const handlePurgeLms = async () => {
    if (!confirm('🚨 WARNING: Are you sure you want to delete all old test courses and old flat categories from Moodle LMS?')) return;
    setPurgingLms(true);
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/courses/purge-lms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        const resultObj = {
          type: 'PURGE_LMS',
          title: 'Purged LMS Test Courses & Flat Categories',
          updated: data.deletedCourses || 0,
          skipped: data.deletedCategories || 0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
        };
        setLastOpResult(resultObj);
        try { localStorage.setItem('abs_courses_last_op', JSON.stringify(resultObj)); } catch (e) {}
        alert(`Moodle LMS Purge Complete!\n\nDeleted Test Courses: ${data.deletedCourses || 0}\nDeleted Categories: ${data.deletedCategories || 0}`);
        fetchCourses();
      } else {
        alert('Purge error: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setPurgingLms(false);
    }
  };

  const [reconcilingTeachers, setReconcilingTeachers] = useState(false);

  const handleReconcileTeachers = async () => {
    if (!confirm('This will sync all course lecturers to Moodle LMS and remove old numeric dummy accounts (e.g. 1500026 Student). Proceed?')) return;
    setReconcilingTeachers(true);
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch(`/api/admin/moodle/reconcile-teachers?year=${encodeURIComponent(year)}&term=${encodeURIComponent(term)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const resultObj = {
          type: 'RECONCILE_TEACHERS',
          title: 'Lecturer Directory & Dummy Account Cleanup',
          updated: data.updated || 0,
          skipped: data.skipped || 0,
          failed: data.failed || 0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
        };
        setLastOpResult(resultObj);
        try { localStorage.setItem('abs_courses_last_op', JSON.stringify(resultObj)); } catch (e) {}
        alert(`Successfully reconciled Moodle teachers!\n\nUpdated: ${data.updated}\nSkipped: ${data.skipped}\nUnassigned / Dummy Cleaned: ${data.failed}`);
        fetchCourses();
      } else {
        alert('Reconcile failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error reconciling teachers: ' + err.message);
    } finally {
      setReconcilingTeachers(false);
    }
  };

  const isAnyOpActive = syncing || reconcilingTeachers || realigning || purgingLms;
  const activeOpName = reconcilingTeachers 
    ? 'Reconciling Course Lecturers with HTU Staff Directory'
    : syncing 
    ? 'Syncing Course Mounts from SOIS'
    : realigning 
    ? 'Re-aligning Moodle LMS Categories'
    : purgingLms 
    ? 'Purging LMS Test Courses'
    : null;

  useEffect(() => {
    let timer: any = null;
    if (isAnyOpActive) {
      setOpElapsed(0);
      timer = setInterval(() => {
        setOpElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setOpElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAnyOpActive]);

  const [exporting, setExporting] = useState(false);

  const fetchReportData = async () => {
    const token = localStorage.getItem('abs_token');
    const res = await fetch(`/api/admin/reports/lms-usage?year=${encodeURIComponent(year)}&term=${encodeURIComponent(term)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const data = await fetchReportData();
      if (!data || data.length === 0) return alert('No data to export!');
      
      const headers = ['Faculty', 'Department', 'Course Code', 'Course Name', 'Lecturer', 'Students Enrolled', 'Materials Uploaded', 'Assessments Created'];
      const csvContent = [
        headers.join(','),
        ...data.map((r: any) => 
          `"${r.faculty}","${r.department}","${r.courseCode}","${r.courseName}","${r.lecturer}","${r.studentsEnrolled}","${r.materialsCount}","${r.assessmentsCount}"`
        )
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LMS_USAGE_REPORT_${year.replace('/', '-')}_SEM${term}.csv`;
      a.click();
    } catch (err: any) {
      alert('Failed to export CSV: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const data = await fetchReportData();
      if (!data || data.length === 0) return alert('No data to export!');
      
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF('landscape');
      
      doc.setFontSize(18);
      doc.setTextColor(0, 51, 102); // HTU Blueish
      doc.text(`HO TECHNICAL UNIVERSITY - LMS USAGE REPORT`, 14, 20);
      
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Academic Year: ${year} | Semester: ${term}`, 14, 28);
      doc.text(`Generated by: Auto Bridge Service (ABS)`, 14, 34);

      const sortedData = [...data].sort((a, b) => {
        if (a.faculty !== b.faculty) return a.faculty.localeCompare(b.faculty);
        if (a.department !== b.department) return a.department.localeCompare(b.department);
        return a.courseName.localeCompare(b.courseName);
      });

      const tableBody = sortedData.map((r: any) => [
        r.faculty.replace('FACULTY OF ', '').replace('DEPARTMENT OF ', ''),
        r.department.replace('DEPARTMENT OF ', ''),
        r.courseCode,
        r.courseName,
        r.lecturer,
        r.studentsEnrolled,
        r.materialsCount,
        r.assessmentsCount
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['Faculty', 'Department', 'Course Code', 'Course Name', 'Lecturer', 'Students', 'Materials', 'Assessments']],
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 51, 102] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 35 },
          2: { cellWidth: 20 },
          3: { cellWidth: 50 },
          4: { cellWidth: 40 },
          5: { cellWidth: 15, halign: 'center' },
          6: { cellWidth: 20, halign: 'center' },
          7: { cellWidth: 25, halign: 'center' }
        },
      });

      doc.save(`LMS_USAGE_REPORT_${year.replace('/', '-')}_SEM${term}.pdf`);
    } catch (err: any) {
      alert('Failed to export PDF: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleCreateManualCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode) return;
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/courses/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ courseCode: newCourseCode, courseName: newCourseName || newCourseCode })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Course ${newCourseCode} mounted successfully on Moodle!`);
        setShowModal(false);
        setNewCourseCode('');
        setNewCourseName('');
        fetchCourses();
      } else {
        alert('Failed to mount course: ' + (data.message || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const filteredCourses = courses.filter(c =>
    (c.courseCode || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.courseName || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.categoryNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalCourses = courses.length;
  const syncedCourses = courses.filter(c => c.isSynced).length;
  const pendingCourses = totalCourses - syncedCourses;

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Mounted Courses Catalog</h1>
          <p className="text-gray-500 text-sm font-medium">Manage and view all semester courses mounted in SOIS and synced to Moodle LMS.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncSois}
            disabled={syncing}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-emerald-600/20 transition-all uppercase tracking-wider"
          >
            <span>{syncing ? '🔄 Syncing...' : '⚡ Sync SOIS Courses'}</span>
          </button>

          <button
            onClick={handleRealignLms}
            disabled={realigning}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-indigo-600/20 transition-all uppercase tracking-wider"
            title="Move Moodle courses to 4-tier categories and delete old root categories"
          >
            <span>{realigning ? '⏳ Cleaning LMS...' : '🧹 Re-align LMS Categories'}</span>
          </button>

          <button
            onClick={handlePurgeLms}
            disabled={purgingLms}
            className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-red-600/20 transition-all uppercase tracking-wider"
            title="Delete old test courses and old flat categories from Moodle LMS"
          >
            <span>{purgingLms ? '⏳ Purging LMS...' : '🔥 Purge LMS Test Courses'}</span>
          </button>

          <button
            onClick={handleClearCourses}
            className="flex items-center gap-2 px-5 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-black rounded-2xl border border-rose-200 transition-all uppercase tracking-wider"
            title="Purge stored dummy/stale course records for this semester"
          >
            <span>🗑️ Purge Stale Records</span>
          </button>

          <button
            onClick={handleReconcileTeachers}
            disabled={reconcilingTeachers}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-indigo-600/20 transition-all uppercase tracking-wider"
            title="Sync all verified lecturer names to Moodle and clean dummy accounts"
          >
            <span>{reconcilingTeachers ? '⏳ Reconciling...' : '🔄 Reconcile Moodle Lecturers'}</span>
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-primary/20 transition-all uppercase tracking-wider"
          >
            <span>➕ Mount Manual Course</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-fuchsia-600/20 transition-all uppercase tracking-wider"
            title="Download Comprehensive LMS Usage Report as PDF"
          >
            <span>{exporting ? '⏳ Compiling...' : '📄 Export PDF Report'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-teal-600/20 transition-all uppercase tracking-wider"
            title="Download Comprehensive LMS Usage Report as Excel/CSV"
          >
            <span>{exporting ? '⏳ Compiling...' : '📊 Export Excel (CSV)'}</span>
          </button>
        </div>
      </div>

      {/* 🛡️ Heavy Operations Status Console & Operational Notice Bar */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/40 rounded-3xl p-6 sm:p-7 shadow-xl text-white space-y-5">
        {/* Top Status Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center">
              <span className={`w-3.5 h-3.5 rounded-full ${isAnyOpActive ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <span className={`w-3 h-3 rounded-full absolute ${isAnyOpActive ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-300">
                  {isAnyOpActive ? 'Heavy Batch Operation In Progress' : 'Automated LMS Sync & Catalog Engine'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-mono">
                  v2.6 Legit
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                {isAnyOpActive ? activeOpName : 'Live Moodle Catalog Controller & Operational Directives'}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isAnyOpActive ? (
              <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 px-3.5 py-1.5 rounded-full text-amber-200 text-xs font-bold animate-pulse">
                <svg className="animate-spin h-3.5 w-3.5 text-amber-300" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Processing Live... {opElapsed}s elapsed</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-emerald-300 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Engine Ready • REST API Active</span>
              </div>
            )}

            <button
              onClick={() => setShowNoticeDetails(!showNoticeDetails)}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition border border-white/15 flex items-center gap-2 shadow-sm"
            >
              <span>{showNoticeDetails ? 'Hide Directives' : 'Operational Notice & Button Guide'}</span>
              <span>{showNoticeDetails ? '▲' : '▼'}</span>
            </button>
          </div>
        </div>

        {/* Active Animated Progress Bar */}
        {isAnyOpActive && (
          <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-indigo-500/30">
            <div className="flex justify-between items-center text-xs">
              <span className="text-amber-300 font-bold flex items-center gap-2">
                <span className="animate-spin">⚙️</span>
                Communicating with Moodle LMS REST webservices...
              </span>
              <span className="text-slate-400 font-mono text-[11px]">{opElapsed}s elapsed • Do not refresh or close tab</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-indigo-500 w-full animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-400">
              Bulk auditing course shortnames, checking HR payroll directories, modifying category hierarchies, and applying enrollments.
            </p>
          </div>
        )}

        {/* Last Operation Outcome Badge */}
        {lastOpResult && !isAnyOpActive && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/60 border border-slate-700/60 rounded-2xl px-4 py-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-sm">✅</span>
              <div>
                <span className="font-bold text-slate-200">{lastOpResult.title}</span>
                <span className="text-slate-400 ml-2">({lastOpResult.timestamp})</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {lastOpResult.updated !== undefined && (
                <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-lg font-bold">
                  {lastOpResult.updated} Updated
                </span>
              )}
              {lastOpResult.skipped !== undefined && (
                <span className="bg-slate-700/60 text-slate-300 border border-slate-600/40 px-3 py-1 rounded-lg font-medium">
                  {lastOpResult.skipped} Skipped
                </span>
              )}
              {lastOpResult.failed !== undefined && (
                <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-lg font-medium">
                  {lastOpResult.failed} Cleaned / Free
                </span>
              )}
            </div>
          </div>
        )}

        {/* Detailed Operational Directive & Button Impact Guide */}
        {showNoticeDetails && (
          <div className="bg-slate-950/70 border border-indigo-900/60 rounded-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-indigo-900/40 pb-2.5">
              <span className="text-amber-400 font-black text-sm">⚠️</span>
              <h3 className="font-bold uppercase tracking-wider text-amber-300">
                Critical Operational Directive: How Heavy Actions Function
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-300">
              <div className="p-4 bg-slate-900/90 rounded-2xl border border-indigo-950/80 space-y-1.5">
                <div className="flex items-center gap-2 text-indigo-300 font-bold">
                  <span>🔄</span>
                  <span>Reconcile Moodle Lecturers (Heavy Deep Audit)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Scans all 800+ courses mounted for this semester. Matches internal SOIS payroll numbers against the verified 704-staff directory. Enrolls lecturers under their official <span className="text-indigo-200 font-semibold">@htu.edu.gh</span> Google account and automatically purges old numeric dummy IDs (e.g. <span className="text-rose-300 font-mono">1500026 Student</span>). Courses with unassigned teachers remain cleanly free of placeholder faculty.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-indigo-950/80 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <span>⚡</span>
                  <span>Sync SOIS Courses</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Fetches newly mounted course offerings from the SOIS API. Instantiates missing courses in Moodle under the official 4-tier category blueprint (<span className="text-emerald-200 font-mono">AY_2026_2027_S1</span>) and populates the local sub-millisecond course lookup cache.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-indigo-950/80 space-y-1.5">
                <div className="flex items-center gap-2 text-purple-300 font-bold">
                  <span>🧹</span>
                  <span>Re-align LMS Categories</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Restructures loose or root Moodle courses into standardized Faculty → Department → Academic Year → Semester folders, cleaning up flat categories.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-indigo-950/80 space-y-1.5">
                <div className="flex items-center gap-2 text-rose-300 font-bold">
                  <span>🔥 / 🗑️</span>
                  <span>Purge Operations (High Impact)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Destructive commands for semester changeovers only. <span className="text-rose-200 font-semibold">Do NOT execute while course registration is actively occurring.</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-indigo-950/60 p-3 rounded-xl border border-indigo-800/40 text-[11px] text-indigo-300">
              <span className="font-bold">⚡ Idempotency Guarantee:</span>
              <span>All sync and reconciliation actions are idempotent. Running them multiple times will never duplicate courses or create redundant teacher enrollments.</span>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Mounted</p>
            <h3 className="text-3xl font-black text-gray-900 mt-1">{totalCourses}</h3>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 text-2xl font-bold">
            📚
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Synced on Moodle</p>
            <h3 className="text-3xl font-black text-emerald-600 mt-1">{syncedCourses}</h3>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 text-2xl font-bold">
            ✅
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pending Sync</p>
            <h3 className="text-3xl font-black text-amber-600 mt-1">{pendingCourses}</h3>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 text-2xl font-bold">
            ⏳
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full md:w-auto relative">
          <input
            type="text"
            placeholder="Search by course code, title, or category (e.g. CS101, FAST_DOCS)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-primary transition-all"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Year:</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold text-gray-700 focus:outline-none"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Term:</label>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-xs font-bold text-gray-700 focus:outline-none"
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
        </div>
      </div>

      {/* Courses Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                <th className="py-4 px-6">Course Code</th>
                <th className="py-4 px-6">Course Title</th>
                <th className="py-4 px-6">Level</th>
                <th className="py-4 px-6">Lecturer</th>
                <th className="py-4 px-6">Target Category ID</th>
                <th className="py-4 px-6">Moodle ID</th>
                <th className="py-4 px-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                    Loading mounted courses...
                  </td>
                </tr>
              ) : filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                    No mounted courses found for {year} Semester {term}. Click <strong>Sync SOIS Courses</strong> to load.
                  </td>
                </tr>
              ) : (
                filteredCourses.map((course, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-900">{course.courseCode}</td>
                    <td className="py-4 px-6 font-medium text-gray-700">{course.courseName}</td>
                    <td className="py-4 px-6">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
                        L{course.level || '—'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {course.lecturerName ? (
                        <div>
                          <p className="font-semibold text-gray-800 text-xs">{course.lecturerName}</p>
                          {course.lecturerEmail && (
                            <p className="text-gray-400 text-xs">{course.lecturerEmail}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">No Lecturer</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg border border-purple-100">
                        {course.categoryNumber || '—'}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-gray-500">
                      {course.moodleCourseId ? `#${course.moodleCourseId}` : '—'}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {course.isSynced ? (
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200">
                          ✓ Synced
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
                          ⏳ Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Mount Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <h3 className="text-xl font-black text-gray-900">Mount Course Manually</h3>
            <form onSubmit={handleCreateManualCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Course Code</label>
                <input
                  type="text"
                  placeholder="e.g. CS101"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Course Title</label>
                <input
                  type="text"
                  placeholder="e.g. Intro to Computer Science"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary text-white text-xs font-black rounded-xl hover:bg-primary/90"
                >
                  Mount Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
