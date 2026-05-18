'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    const token = localStorage.getItem('abs_token');
    try {
      const res = await fetch('/api/admin/system/health', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight mb-8">System Connectivity Hub</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ServiceCard 
                name="PostgreSQL Core Database" 
                status={health?.postgres} 
                description="Primary storage for student records, payment history, and audit logs." 
            />
            <ServiceCard 
                name="Redis Event Queue" 
                status={health?.redis} 
                description="Orchestrates background activation jobs (A1-A11) via BullMQ." 
            />
            <ServiceCard 
                name="Finance Webhook Gateway" 
                status={health?.finance} 
                description="Receives payment confirmations from the HTU Finance System." 
            />
            <ServiceCard 
                name="LMS (Moodle) Integration" 
                status={health?.lms} 
                description="Automated account provisioning and course enrollment API." 
            />
        </div>
      </div>

      <div className="p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Environment Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ConfigItem label="Mock Modes" value="ACTIVE (All Systems)" />
            <ConfigItem label="Activation Threshold" value="60%" />
            <ConfigItem label="Retry Policy" value="5 times w/ Backoff" />
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ name, status, description }: any) {
  const isHealthy = status === 'connected' || status === 'mock_mode';
  return (
    <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h4 className="font-bold text-gray-800">{name}</h4>
                <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">{description}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
                <div className={`w-3 h-3 rounded-full shadow-sm ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-tighter">
                    {status?.replace('_', ' ') || 'Detecting...'}
                </span>
            </div>
        </div>
        <div className="pt-4 border-t border-gray-200/50 flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[10px] font-black text-primary hover:bg-primary hover:text-white transition-all">PING TEST</button>
            {status === 'mock_mode' && (
                <span className="ml-auto text-xs text-amber-500 font-bold italic tracking-tight">Using Mock Emulator</span>
            )}
        </div>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string, value: string }) {
    return (
        <div className="p-4 rounded-xl bg-primary-light/30 border border-primary/10">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest opacity-60 mb-1">{label}</p>
            <p className="text-sm font-black text-primary">{value}</p>
        </div>
    );
}
