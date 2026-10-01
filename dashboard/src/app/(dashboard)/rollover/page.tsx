"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function RolloverPage() {
  const [stats, setStats] = useState({ total: 0, active: 0, restricted: 0 });
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      setStats({
        total: data.total,
        active: data.active,
        restricted: data.restricted,
      });
    } catch (err) {
      console.error("Failed to load stats", err);
    } finally {
      setLoading(false);
    }
  };

  const triggerRollover = async () => {
    if (
      !confirm(
        "ATTENTION: This will instantly suspend all Active students from Moodle. They will remain locked out until they register for their courses on the Student Portal. Are you absolutely sure?"
      )
    )
      return;
    
    setTriggering(true);
    try {
      const token = localStorage.getItem("abs_token");
      const res = await fetch("/api/admin/academic-year/rollover", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(data.message || "Rollover triggered successfully.");
      fetchStats();
    } catch (error: any) {
      alert("Failed to trigger rollover: " + error.message);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen bg-gray-50/50">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Academic Year Rollover Console</h1>
        <p className="text-gray-500 mt-2 text-sm leading-relaxed max-w-3xl">
          Use this console at the beginning of a new semester. Triggering the rollover restricts all students. 
          As they register their courses on the Student Portal, the webhook will automatically unlock their LMS access.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4 text-2xl">
            📊
          </div>
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Students</p>
          <p className="text-4xl font-bold text-gray-900">{loading ? "..." : stats.total}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="h-12 w-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4 z-10 text-2xl">
            🔓
          </div>
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1 z-10">Active (Registered)</p>
          <p className="text-4xl font-bold text-emerald-600 z-10">{loading ? "..." : stats.active}</p>
          <Link href="/students?status=ACTIVE" className="mt-4 text-xs font-bold text-emerald-600 hover:underline z-10">VIEW LIST →</Link>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="h-12 w-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 z-10 text-2xl">
            🔒
          </div>
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1 z-10">Restricted (Unregistered)</p>
          <p className="text-4xl font-bold text-red-600 z-10">{loading ? "..." : stats.restricted}</p>
          <Link href="/students?status=RESTRICTED" className="mt-4 text-xs font-bold text-red-600 hover:underline z-10">VIEW LIST →</Link>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-red-900/5 border border-red-100 overflow-hidden mb-12">
        <div className="p-8 md:p-12 text-center flex flex-col items-center">
          <div className="h-20 w-20 bg-red-50 rounded-full flex items-center justify-center mb-6 text-4xl">
            ⚠️
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Execute Academic Rollover</h2>
          <p className="text-gray-500 max-w-xl mx-auto mb-8">
            Clicking this button will move all currently <strong>Active</strong> students into the <strong>Restricted</strong> state, automatically suspending their Moodle access in the background. Do this only when a new semester begins.
          </p>
          <button 
            onClick={triggerRollover}
            disabled={triggering || stats.active === 0}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black rounded-xl shadow-lg shadow-red-500/30 transition-all uppercase tracking-widest flex items-center gap-2"
          >
            {triggering ? "SUSPENDING..." : "TRIGGER ROLLOVER NOW"}
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
          ✅ How Does Unlocking Work?
        </h3>
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-bold flex items-center justify-center">1</div>
            <div>
              <h4 className="font-semibold text-gray-900">Student Registers on Portal</h4>
              <p className="text-sm text-gray-500 mt-1">The student visits the Student Portal, pays their required fees, and registers their courses for the semester.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-bold flex items-center justify-center">2</div>
            <div>
              <h4 className="font-semibold text-gray-900">Webhook Received by ABS</h4>
              <p className="text-sm text-gray-500 mt-1">The moment they finish registering, the Student Portal instantly fires a secure webhook to the ABS endpoint.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center">3</div>
            <div>
              <h4 className="font-semibold text-gray-900">Auto-Unlock & Enrollment</h4>
              <p className="text-sm text-gray-500 mt-1">ABS receives the webhook, instantly changes the student's status back to <strong>Active</strong>, unsuspends their Moodle account, and enrolls them in the registered courses automatically.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
