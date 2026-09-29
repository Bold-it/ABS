'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function MoodleContent() {
  const searchParams = useSearchParams();
  const indexNumber = searchParams.get('indexNumber');
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudent = async () => {
      const token = localStorage.getItem('abs_token');
      try {
        const res = await fetch(`/api/admin/students/index/${indexNumber}`, {
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
    if (indexNumber) fetchStudent();
  }, [indexNumber]);

  if (loading) return <div className="p-12 text-center text-gray-400">Loading student environment...</div>;
  if (!student) return <div className="p-12 text-center text-red-500">Access Denied. Provisioning not found.</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Welcome back, {student.fullName}!</h2>
            <p className="text-sm text-gray-500">Your accounts are fully provisioned and synchronized via ABS.</p>
        </div>
        <div className="text-right">
            <p className="text-xs font-bold text-gray-400 uppercase">Current Semester</p>
            <p className="text-sm font-bold text-primary">Semester 1, 2026</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
            <h3 className="font-bold text-gray-700">Recently Accessed Courses</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CourseCard code="COMP 101" name="Introduction to Computer Science" color="bg-blue-500" />
                <CourseCard code="MATH 105" name="Algebra and Geometry" color="bg-purple-500" />
                <CourseCard code="COMM 102" name="Communication Skills I" color="bg-amber-500" />
                <CourseCard code="GNST 101" name="African Studies" color="bg-green-500" />
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-wider">LMS Credentials</h3>
                <div className="space-y-4">
                    <CredItem label="Username" value={student.indexNumber} />
                    <CredItem label="Institutional Email" value={student.schoolEmail} />
                    <CredItem label="External System Sync" value="Verified ACTIVE" success />
                </div>
            </div>

            <div className="bg-[#343a40] text-white p-6 rounded-lg shadow-xl">
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-gray-400">System Notification</h3>
                <p className="text-xs leading-relaxed text-gray-300">
                    "Your courses were automatically synced from the legacy registry via the **Auto Bridge Service**. Technical support: support@school.edu.gh"
                </p>
            </div>
        </div>
      </div>
    </div>
  );
}

export default function MoodleMockupPage() {
  return (
    <Suspense fallback={<div>Loading student portal...</div>}>
      <MoodleContent />
    </Suspense>
  );
}

function CourseCard({ code, name, color }: any) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden group hover:shadow-md transition-shadow">
            <div className={`h-24 ${color} relative p-4 flex flex-col justify-end`}>
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{code}</span>
            </div>
            <div className="p-4">
                <p className="font-bold text-gray-800 text-sm h-10 line-clamp-2">{name}</p>
                <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400">5 New Activities</span>
                    <button className="text-xs font-bold text-primary hover:underline">View Course</button>
                </div>
            </div>
        </div>
    );
}

function CredItem({ label, value, success = false }: any) {
    return (
        <div className="flex justify-between items-center">
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase">{label}</p>
                <p className="text-xs font-bold text-gray-700">{value}</p>
            </div>
            {success && <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />}
        </div>
    );
}
