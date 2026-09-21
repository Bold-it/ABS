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
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-primary/20 transition-all uppercase tracking-wider"
          >
            <span>➕ Mount Manual Course</span>
          </button>
        </div>
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
