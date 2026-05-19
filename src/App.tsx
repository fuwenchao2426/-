/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  Cpu, 
  BarChart3, 
  Settings,
  RefreshCw,
  Terminal
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---
type TestStatus = 'IDLE' | 'TESTING' | 'PASS' | 'FAIL' | 'ERROR';

interface Station {
  id: number;
  status: TestStatus;
  value?: number; // Simulated voltage/current
  progress: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

// --- Mock Data Generators ---
const INITIAL_STATIONS: Station[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  status: 'IDLE',
  progress: 0,
}));

const HOURLY_DATA = [
  { time: '08:00', yield: 98.2 },
  { time: '09:00', yield: 97.8 },
  { time: '10:00', yield: 99.1 },
  { time: '11:00', yield: 96.5 },
  { time: '12:00', yield: 98.4 },
  { time: '13:00', yield: 97.9 },
  { time: '14:00', yield: 98.1 },
];

const DEFECT_DATA = [
  { name: 'Voltage Out', count: 12, color: '#ef4444' },
  { name: 'Current Low', count: 8, color: '#f59e0b' },
  { name: 'Comm Error', count: 5, color: '#3b82f6' },
  { name: 'RF Power', count: 3, color: '#8b5cf6' },
  { name: 'Flash Fail', count: 2, color: '#ec4899' },
];

// --- Components ---

const StatCard = ({ title, value, icon: Icon, trend, colorClass }: { 
  title: string; 
  value: string | number; 
  icon: any; 
  trend?: string;
  colorClass?: string;
}) => (
  <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
    <div className="flex justify-between items-start mb-2">
      <div className={cn("p-2 rounded-lg bg-slate-800", colorClass)}>
        <Icon size={20} className="text-white" />
      </div>
      {trend && (
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400")}>
          {trend}
        </span>
      )}
    </div>
    <div>
      <p className="text-slate-400 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
    </div>
  </div>
);

export default function App() {
  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeBatch, setActiveBatch] = useState("B20240519-02");
  const [isLive, setIsLive] = useState(true);
  const [cycleWaitTime, setCycleWaitTime] = useState(0);

  // Simulated real-time updates
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      setStations(current => {
        const next = current.map(s => ({ ...s }));
        const testingCount = next.filter(s => s.status === 'TESTING').length;
        const idleStations = next.filter(s => s.status === 'IDLE');
        const completedCount = next.filter(s => s.status === 'PASS' || s.status === 'FAIL').length;

        // 1. Handle Cycle Transition
        if (completedCount === 50 && cycleWaitTime <= 0) {
          setCycleWaitTime(10);
          addLog('info', '>>> 本周期测试全部完成，系统进入 10s 维护期');
          return current;
        }

        if (cycleWaitTime > 0) return current;

        // 2. Start New Batch (up to 5 at a time)
        if (testingCount < 5 && idleStations.length > 0) {
          const slotsToFill = 5 - testingCount;
          const toStart = idleStations.slice(0, slotsToFill);
          toStart.forEach(s => {
            const idx = next.findIndex(n => n.id === s.id);
            if (idx !== -1) {
              next[idx].status = 'TESTING';
              next[idx].progress = 0;
            }
          });
        }

        // 3. Update Progress
        next.forEach((s, idx) => {
          if (s.status === 'TESTING') {
            if (s.progress >= 100) {
              const pass = Math.random() > 0.03; // 3% defect rate
              next[idx].status = pass ? 'PASS' : 'FAIL';
              next[idx].progress = 0;
              
              const passCount = next.filter(st => st.status === 'PASS').length;
              const failCount = next.filter(st => st.status === 'FAIL').length;
              const currentYield = ((passCount / (passCount + failCount)) * 100).toFixed(1);
              
              addLog(
                pass ? 'success' : 'error',
                `[单元 ${s.id}] 测试完成 - ${pass ? '合格' : '不合格'} (当日累计良率: ${currentYield}%)`
              );
            } else {
              // 2.5s demo time: 20% every 500ms = 5 steps = 2.5s
              next[idx].progress = s.progress + 20;
            }
          }
        });

        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isLive, activeBatch, cycleWaitTime]);

  const resetStations = () => {
    return INITIAL_STATIONS.map(s => ({ ...s }));
  };

  // Handle cycle countdown
  useEffect(() => {
    if (cycleWaitTime > 0) {
      const timer = setInterval(() => {
        setCycleWaitTime(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setStations(resetStations());
            setActiveBatch(`B${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`);
            addLog('warning', '>>> 自动清理完成，新测试批次已就绪');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cycleWaitTime]);

  const addLog = (type: LogEntry['type'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]);
  };

  const yieldStats = useMemo(() => {
    const passed = stations.filter(s => s.status === 'PASS').length;
    const failed = stations.filter(s => s.status === 'FAIL').length;
    const total = passed + failed;
    const rate = total === 0 ? 0 : (passed / total) * 100;
    return { passed, failed, total, rate };
  }, [stations]);

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans p-6 overflow-hidden flex flex-col gap-6">
      <header className="flex justify-between items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-800 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/20">
            <Cpu className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">智慧制造测试大屏</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("flex h-2 w-2 rounded-full animate-pulse", cycleWaitTime > 0 ? "bg-amber-500" : "bg-emerald-500")} />
              <span className="text-xs font-medium text-slate-400">
                {cycleWaitTime > 0 ? `等待下一周期 (${cycleWaitTime}s)` : "设备在线 (COM4: 115200bps)"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-6 items-center">
          <div className="text-right border-r border-slate-800 pr-6 mr-6 h-10 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">批次编号</p>
            <p className="text-sm font-mono font-bold text-blue-400">{activeBatch}</p>
          </div>
          <div className="flex items-center gap-3">
             <button 
               onClick={() => setIsLive(!isLive)}
               className={cn(
                 "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                 isLive ? "bg-slate-800 text-slate-200" : "bg-blue-600 text-white"
               )}
             >
               {isLive ? <Activity size={16} /> : <RefreshCw size={16} />}
               {isLive ? "实时监控中" : "已暂停模拟"}
             </button>
             <button className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors">
               <Settings size={20} />
             </button>
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-8 flex flex-col gap-6 min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            <StatCard 
              title="当前周期进度" 
              value={`${Math.round(stations.filter(s => s.status !== 'IDLE').length / 50 * 100)}%`} 
              icon={Clock}
              colorClass="bg-blue-500"
            />
            <StatCard 
              title="实时良率" 
              value={`${yieldStats.rate.toFixed(1)}%`} 
              icon={CheckCircle2}
              trend="+0.2%"
              colorClass="bg-emerald-500"
            />
            <StatCard 
              title="故障数量" 
              value={yieldStats.failed} 
              icon={XCircle}
              colorClass="bg-red-500"
            />
            <StatCard 
              title="平均产出节拍" 
              value="12.8s" 
              icon={Activity}
              colorClass="bg-violet-500"
            />
          </div>

          <div className="flex-1 bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex justify-between items-end mb-6 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-500" />
                  1带50 单元工装状态图
                </h2>
                <p className="text-xs text-slate-400 mt-1">实时展示每个物理工位的产品测试生命周期</p>
              </div>
              <div className="flex gap-4 mb-1">
                {[
                  { label: '测试中', color: 'bg-blue-500' },
                  { label: 'PASS', color: 'bg-emerald-500' },
                  { label: 'FAIL', color: 'bg-red-500' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", item.color)} />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex-1 relative min-h-0">
              <div className="absolute inset-0 grid grid-cols-10 grid-rows-5 gap-2">
                {stations.map(station => {
                  const statusColors: Record<TestStatus, string> = {
                    IDLE: 'bg-slate-800 border-slate-700 text-slate-500',
                    TESTING: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
                    PASS: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                    FAIL: 'bg-red-500/20 border-red-500/50 text-red-500',
                    ERROR: 'bg-amber-500/20 border-amber-500/50 text-amber-500',
                  };

                  return (
                    <div 
                      key={station.id}
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-lg border text-[10px] font-bold transition-all duration-300",
                        statusColors[station.status]
                      )}
                    >
                      <span>{station.id.toString().padStart(2, '0')}</span>
                      {station.status === 'TESTING' && (
                        <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-slate-700 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-blue-400"
                            animate={{ width: `${station.progress}%` }}
                          />
                        </div>
                      )}
                      {station.status === 'PASS' && <CheckCircle2 size={10} className="mt-0.5" />}
                      {station.status === 'FAIL' && <XCircle size={10} className="mt-0.5" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6 min-h-0 overflow-hidden">
          <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl h-[30%] shrink-0 overflow-hidden">
            <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2 uppercase tracking-wide">
              每小时良率趋势曲线
            </h3>
            <div className="h-full pb-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={HOURLY_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={[90, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff' }} />
                  <Line type="monotone" dataKey="yield" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl h-[25%] shrink-0 overflow-hidden">
             <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2 uppercase tracking-wide">
              不良原因帕累托分析
            </h3>
            <div className="h-full pb-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DEFECT_DATA} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} axisLine={false} tickLine={false} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
                    {DEFECT_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex-1 bg-slate-950/80 border border-slate-800/80 p-4 rounded-2xl flex flex-col min-h-0 relative">
             <div className="flex items-center justify-between mb-3 shrink-0">
               <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                 <Terminal size={14} className="text-blue-500" />
                 实时通讯日志
               </h3>
             </div>
             <div className="flex-1 relative min-h-0">
               <div className="absolute inset-0 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                  {logs.map(log => (
                    <div key={log.id} className="text-[10px] font-mono border-l border-slate-800 pl-2 py-0.5 flex items-start gap-2">
                      <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                      <span className={cn(
                        "shrink-0 font-bold",
                        log.type === 'success' ? "text-emerald-500" :
                        log.type === 'error' ? "text-red-500" :
                        log.type === 'warning' ? "text-amber-500" : "text-slate-400"
                      )}>
                        {log.type.toUpperCase()}
                      </span>
                      <span className="text-slate-400">{log.message}</span>
                    </div>
                  ))}
               </div>
             </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30, 41, 59, 0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
      `}</style>
    </div>
  );
}
