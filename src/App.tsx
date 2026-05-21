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
  Terminal,
  History,
  AlertCircle
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
  Cell,
  LabelList
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---
export type AlarmType = 'NONE' | 'HIGH' | 'LOW';

export interface Station {
  id: number;
  alarmCount: number; // 误报次数
  currentAlarm: AlarmType; // 当前误报状态
  value?: number; // 模拟当前值
  alarmTimer?: number; // 自愈定时器计数
}

export interface WSMessage {
  type: 'ALARM' | 'CLEAR' | 'HEARTBEAT' | 'METRICS_UPDATE' | 'BATCH_CHANGE';
  payload: {
    stationId?: number;
    alarmType?: AlarmType;
    value?: number;
    timestamp?: string;
    defectReason?: string;
    metrics?: { time: string; yield: number }[];
    batch?: string;
    id?: string;
  };
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

interface FailRecord {
  id: string;
  stationId: number;
  batch: string;
  defectReason: string;
  timestamp: string;
}

export interface ProductConfig {
  id: string;
  name: string;
  alarmTypes: ('HIGH' | 'LOW' | 'ALARM')[];
  alarmLabels: {
    HIGH?: string;
    LOW?: string;
    ALARM?: string;
  };
}

// 可通过此配置 JSON 对支持的产品及报警类型进行定义
export const PRODUCTS: ProductConfig[] = [
  {
    id: "ZF-1",
    name: "ZF-1型辐射报警仪",
    alarmTypes: ["HIGH", "LOW"],
    alarmLabels: {
      HIGH: "高报警",
      LOW: "低报警"
    }
  },
  {
    id: "K-2A",
    name: "K-2A型报警照射量仪器",
    alarmTypes: ["HIGH", "LOW"],
    alarmLabels: {
      HIGH: "高报警",
      LOW: "低报警"
    }
  },
  {
    id: "85-FIRE",
    name: "85式自动灭火抑爆系统光学探测器",
    alarmTypes: ["ALARM"],
    alarmLabels: {
      ALARM: "探测器误报警"
    }
  },
  {
    id: "LKM1A",
    name: "LKM1A型自动灭火盒",
    alarmTypes: ["ALARM"],
    alarmLabels: {
      ALARM: "探测盒误触发"
    }
  }
];

// --- Mock Data Generators ---
const INITIAL_STATIONS: Station[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  alarmCount: 0,
  currentAlarm: 'NONE',
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
  <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl backdrop-blur-sm flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className={cn("p-2.5 rounded-xl bg-slate-800 shrink-0 flex items-center justify-center", colorClass)}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex flex-col min-w-0">
        <p className="text-slate-400 text-[13px] font-medium tracking-tight leading-none mb-1">{title}</p>
        {trend && (
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md w-fit">
            {trend}
          </span>
        )}
      </div>
    </div>
    <div className="text-right shrink-0">
      <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">{value}</h3>
    </div>
  </div>
);

const formatDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductConfig>(PRODUCTS[0]);
  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeBatch, setActiveBatch] = useState("B20260521-01");
  const [isLive, setIsLive] = useState(true);
  const [mode, setMode] = useState<'MONITOR' | 'DEBUG'>('MONITOR');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hourlyData, setHourlyData] = useState<{ time: string; yield: number }[]>(HOURLY_DATA);
  const [activeTab, setActiveTab] = useState<'LOG' | 'WS_SANDBOX'>('LOG');
  
  const [wsPayloadInput, setWsPayloadInput] = useState<string>('');

  const stats = useMemo(() => {
    const totalAlarms = stations.reduce((acc, s) => acc + s.alarmCount, 0);
    const alarmingDevicesCount = stations.filter(s => s.alarmCount > 0).length;
    const yieldRate = ((50 - alarmingDevicesCount) / 50) * 100;
    return {
      totalAlarms,
      alarmingDevicesCount,
      yieldRate,
    };
  }, [stations]);

  // 同步最新的一小时良率指标
  useEffect(() => {
    if (hourlyData.length > 0) {
      setHourlyData(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          yield: parseFloat(stats.yieldRate.toFixed(1))
        };
        return next;
      });
    }
  }, [stats.yieldRate]);

  const [failHistory, setFailHistory] = useState<FailRecord[]>([
    {
      id: "f1",
      stationId: 12,
      batch: "B20260521-01",
      defectReason: "高报警",
      timestamp: "09:12:05"
    },
    {
      id: "f2",
      stationId: 35,
      batch: "B20260521-01",
      defectReason: "低报警",
      timestamp: "09:44:31"
    },
    {
      id: "f3",
      stationId: 8,
      batch: "B20260521-01",
      defectReason: "高报警",
      timestamp: "10:15:18"
    }
  ]);

  // Keep synchronization refs to prevent timer reboots on state mutation
  const stationsRef = React.useRef(stations);
  const hourlyDataRef = React.useRef(hourlyData);
  const activeBatchRef = React.useRef(activeBatch);
  const selectedProductRef = React.useRef(selectedProduct);
  const modeRef = React.useRef(mode);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { hourlyDataRef.current = hourlyData; }, [hourlyData]);
  useEffect(() => { activeBatchRef.current = activeBatch; }, [activeBatch]);
  useEffect(() => { selectedProductRef.current = selectedProduct; }, [selectedProduct]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Dynamically synchronize textarea template when active product or batch changes
  useEffect(() => {
    const isHighLow = selectedProduct.alarmTypes.includes('HIGH');
    const template = {
      type: "ALARM",
      payload: {
        stationId: 18,
        alarmType: "HIGH",
        defectReason: isHighLow ? "高报警" : "误报",
        batch: activeBatch
      }
    };
    setWsPayloadInput(JSON.stringify(template, null, 2));
  }, [selectedProduct, activeBatch]);

  const addLog = (type: LogEntry['type'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs(prev => [newLog, ...prev.slice(0, 149)]);
  };

  // --- WebSocket 核心接收源 (Single Source of Truth) ---
  const processWSMessage = (msg: WSMessage) => {
    const nowStr = msg.payload.timestamp || new Date().toLocaleTimeString();
    const isDebug = modeRef.current === 'DEBUG';
    const stationId = msg.payload.stationId;
    const idStr = stationId !== undefined ? stationId.toString().padStart(2, '0') : '';

    let logType: LogEntry['type'] = 'info';
    let readableMsg = '';

    if (msg.type === 'HEARTBEAT') {
      readableMsg = `[工位 ${idStr}] 通讯链路状态：正常`;
      logType = 'info';
    } else if (msg.type === 'ALARM') {
      const hasHighLow = selectedProductRef.current.alarmTypes.includes('HIGH');
      const isHigh = msg.payload.alarmType === 'HIGH';
      const alarmLabel = hasHighLow ? (isHigh ? '高报警' : '低报警') : '误报';
      readableMsg = `[工位 ${idStr}] 报警类型：${alarmLabel}${isDebug ? ' (调试模式)' : ''}`;
      logType = isHigh ? 'error' : 'warning';
    } else if (msg.type === 'CLEAR') {
      readableMsg = `[工位 ${idStr}] 取消报警`;
      logType = 'success';
    } else if (msg.type === 'METRICS_UPDATE') {
      readableMsg = `[系统指标] 成功接收 WS 广播：良率统计趋势图已更新`;
      logType = 'info';
    } else if (msg.type === 'BATCH_CHANGE') {
      readableMsg = `[系统指令] 成功接收 WS 广播：批次调整为: ${msg.payload.batch}`;
      logType = 'info';
    }

    if (readableMsg) {
      addLog(logType, readableMsg);
    }

    switch (msg.type) {
      case 'HEARTBEAT': {
        if (stationId === undefined) return;
        setStations(prev => prev.map(s => {
          if (s.id === stationId) {
            return {
              ...s,
              value: msg.payload.value ?? parseFloat((3.15 + Math.random() * 0.35).toFixed(3))
            };
          }
          return s;
        }));
        break;
      }

      case 'ALARM': {
        const { alarmType, batch } = msg.payload;
        if (stationId === undefined || !alarmType) return;

        // 校验当前产品支持的报警，如果只支持一种，则忽略高低直接赋予主显报警状态
        let resolvedAlarmType = alarmType;
        if (!selectedProductRef.current.alarmTypes.includes('HIGH')) {
          resolvedAlarmType = 'HIGH';
        }

        setStations(prev => prev.map(s => {
          if (s.id === stationId) {
            return {
              ...s,
              currentAlarm: resolvedAlarmType,
              alarmCount: isDebug ? s.alarmCount : s.alarmCount + 1, // 调试模式下不递增累计误拍次数
              alarmTimer: 5, // 自愈保持5秒
            };
          }
          return s;
        }));

        if (!isDebug) {
          const isHighLow = selectedProductRef.current.alarmTypes.includes('HIGH');
          const finalReason = isHighLow 
            ? (resolvedAlarmType === 'HIGH' ? '高报警' : '低报警') 
            : '误报';

          const newRecord: FailRecord = {
            id: msg.payload.id || Math.random().toString(36).substr(2, 9),
            stationId,
            batch: batch || activeBatchRef.current,
            defectReason: finalReason,
            timestamp: nowStr,
          };
          setFailHistory(prev => [newRecord, ...prev]);
        }
        break;
      }

      case 'CLEAR': {
        if (stationId === undefined) return;

        setStations(prev => prev.map(s => {
          if (s.id === stationId) {
            return {
              ...s,
              currentAlarm: 'NONE',
              alarmTimer: 0
            };
          }
          return s;
        }));
        break;
      }

      case 'METRICS_UPDATE': {
        const { metrics } = msg.payload;
        if (metrics) {
          setHourlyData(metrics);
        }
        break;
      }

      case 'BATCH_CHANGE': {
        const { batch } = msg.payload;
        if (batch) {
          setActiveBatch(batch);
        }
        break;
      }
    }
  };

  // 运行计时与模拟监控机制 (模拟接收 WS 数据包)
  useEffect(() => {
    if (!isLive) return;

    const mainInterval = setInterval(() => {
      // 1. 递增运行时长
      setElapsedSeconds(prev => prev + 1);

      // 2. 模拟真实工业总线/传感器产生 WebSocket 通信反馈
      if (mode === 'MONITOR') {
        const nowStr = new Date().toLocaleTimeString();

        // A. 模拟设备心跳包：25% 几率随机挑选一个工位发出 HEARTBEAT 状态包
        if (Math.random() < 0.25) {
          const randId = Math.floor(Math.random() * 50) + 1;
          const fakeValue = parseFloat((3.12 + Math.random() * 0.38).toFixed(3));
          processWSMessage({
            type: 'HEARTBEAT',
            payload: {
              stationId: randId,
              value: fakeValue,
              timestamp: nowStr
            }
          });
        }

        // B. 模拟误报警包触发：10% 几率下发 ALARM 包至合格/在线设备
        if (Math.random() < 0.10) {
          const healthy = stationsRef.current.filter(s => s.currentAlarm === 'NONE');
          if (healthy.length > 0) {
            const target = healthy[Math.floor(Math.random() * healthy.length)];
            const hasHighLow = selectedProductRef.current.alarmTypes.includes('HIGH');

            let alarmType: AlarmType = 'HIGH';
            let reason = '';

            if (hasHighLow) {
              alarmType = Math.random() > 0.5 ? 'HIGH' : 'LOW';
              reason = alarmType === 'HIGH' ? '高报警' : '低报警';
            } else {
              alarmType = 'HIGH';
              reason = '误报';
            }

            processWSMessage({
              type: 'ALARM',
              payload: {
                stationId: target.id,
                alarmType,
                defectReason: reason,
                timestamp: nowStr,
                batch: activeBatchRef.current
              }
            });
          }
        }

        // C. 处理状态机内部自愈计时，到期后发广播清除回路
        stationsRef.current.forEach(s => {
          if (s.currentAlarm !== 'NONE' && s.alarmTimer && s.alarmTimer > 0) {
            setStations(prev => prev.map(st => {
              if (st.id === s.id && st.alarmTimer && st.alarmTimer > 0) {
                const updatedTimer = st.alarmTimer - 1;
                if (updatedTimer === 0) {
                  // 到期异步发射 CLEAR 自愈 WS 数据包
                  setTimeout(() => {
                    processWSMessage({
                      type: 'CLEAR',
                      payload: {
                        stationId: s.id,
                        timestamp: new Date().toLocaleTimeString()
                      }
                    });
                  }, 0);
                }
                return { ...st, alarmTimer: updatedTimer };
              }
              return st;
            }));
          }
        });

        // D. 模拟小时级别良率微小幅波动 (METRICS_UPDATE)
        if (Math.random() < 0.08) {
          const nextYields = hourlyDataRef.current.map(h => {
            const deviation = (Math.random() * 0.4 - 0.2);
            return {
              ...h,
              yield: parseFloat(Math.min(100, Math.max(90, h.yield + deviation)).toFixed(1))
            };
          });

          processWSMessage({
            type: 'METRICS_UPDATE',
            payload: {
              metrics: nextYields,
              timestamp: nowStr
            }
          });
        }
      }
    }, 1000);

    return () => clearInterval(mainInterval);
  }, [isLive, mode]);

  // 手动调试/测试：模拟通过 websocket向前端设备广播调试指令，进而自动驱动状态
  const handleStationClick = (id: number) => {
    if (mode !== 'DEBUG') return;
    
    const target = stations.find(s => s.id === id);
    if (!target) return;

    const hasHighLow = selectedProduct.alarmTypes.includes('HIGH');

    if (hasHighLow) {
      if (target.currentAlarm === 'NONE') {
        processWSMessage({
          type: 'ALARM',
          payload: {
            stationId: id,
            alarmType: 'HIGH',
            defectReason: '高报警',
            timestamp: new Date().toLocaleTimeString(),
            batch: activeBatch
          }
        });
      } else if (target.currentAlarm === 'HIGH') {
        processWSMessage({
          type: 'ALARM',
          payload: {
            stationId: id,
            alarmType: 'LOW',
            defectReason: '低报警',
            timestamp: new Date().toLocaleTimeString(),
            batch: activeBatch
          }
        });
      } else {
        processWSMessage({
          type: 'CLEAR',
          payload: {
            stationId: id,
            timestamp: new Date().toLocaleTimeString()
          }
        });
      }
    } else {
      if (target.currentAlarm === 'NONE') {
        processWSMessage({
          type: 'ALARM',
          payload: {
            stationId: id,
            alarmType: 'HIGH',
            defectReason: '误报',
            timestamp: new Date().toLocaleTimeString(),
            batch: activeBatch
          }
        });
      } else {
        processWSMessage({
          type: 'CLEAR',
          payload: {
            stationId: id,
            timestamp: new Date().toLocaleTimeString()
          }
        });
      }
    }
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans p-6 overflow-hidden flex flex-col gap-6 relative">
      {/* 🔮 任务初始化配置遮罩弹窗 (在尚未初始化时显示，或点击重新配置时激活) */}
      <AnimatePresence>
        {!isInitialized && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 selection:bg-blue-600 selection:text-white"
          >
            {/* 动态网格背景装饰 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15)_0,transparent_60%)] pointer-events-none" />
            <div className="absolute inset-0 bg-slate-950/20" style={{ backgroundImage: 'radial-gradient(rgba(51,65,85,0.15) 1px, transparent 0)', backgroundSize: '20px 20px' }} />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-slate-900 border border-slate-800/80 p-8 rounded-3xl max-w-md w-full shadow-2xl relative z-10 flex flex-col gap-6"
            >
              {/* Header */}
              <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-500/20">
                  <Settings className="text-white animate-spin-slow" size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                    任务初始化配置
                  </h2>
                  <p className="text-slate-400 text-xs">执行产品试验监控前的必备初始步骤</p>
                </div>
              </div>

              <div className="border-t border-slate-800/80 my-1" />

              {/* Form Controls */}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2">
                    1. 选择当前被测产品型号 (JSON 可配置)
                  </label>
                  <div className="relative">
                    <select
                      value={selectedProduct.id}
                      onChange={(e) => {
                        const prod = PRODUCTS.find(p => p.id === e.target.value);
                        if (prod) {
                          setSelectedProduct(prod);
                          addLog('info', `📋 更改配置预览：切换被测产品为【${prod.name}】`);
                        }
                      }}
                      className="w-full bg-slate-950 text-slate-200 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-xs focus:outline-none appearance-none cursor-pointer font-medium hover:border-slate-700 transition-colors"
                    >
                      {PRODUCTS.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400 text-[10px]">
                      ▼
                    </div>
                  </div>

                  {/* Adaptive Product Capability Guide */}
                  <div className="bg-slate-950/60 rounded-xl p-3 mt-2 border border-slate-850 flex flex-col gap-1.5">
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>工作报警等级:</span>
                      <span className="font-bold text-blue-400">
                        {selectedProduct.alarmTypes.includes('HIGH') ? '高限、低限 (双限位警报)' : '仅支持统一“误报警”动作'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>设备渲染指示:</span>
                      <span className="font-bold text-emerald-400">
                        {selectedProduct.alarmTypes.includes('HIGH') ? '🔴 高报警 | 🔵 低报警' : '🟡 回路误触发警报'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2">
                    2. 输入当前试验测试批号
                  </label>
                  <input
                    type="text"
                    value={activeBatch}
                    onChange={(e) => setActiveBatch(e.target.value)}
                    placeholder="例如: B20260521-01"
                    className="w-full bg-slate-950 text-slate-200 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-xs focus:outline-none font-mono font-semibold tracking-wide placeholder-slate-700"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  setIsInitialized(true);
                  // 重置之前的状态以适配新产品
                  setStations(INITIAL_STATIONS.map(s => ({ ...s })));
                  addLog('success', `用户切换模式：启动监控测试，产品：${selectedProduct.name}，批次：${activeBatch}`);
                }}
                className="w-full py-3 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg hover:shadow-blue-500/10 active:scale-[0.98] cursor-pointer text-center flex items-center justify-center gap-1"
              >
                开始产品测试与数据采集
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🚀 顶层 Header 部位 */}
      <header className="flex justify-between items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-800 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/20">
            <Cpu className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>{selectedProduct.name}</span>
              <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20 font-medium font-mono">COM3</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-slate-400">
                50工位独立数控链路 | 批号: {activeBatch} | 报警状态: {selectedProduct.alarmTypes.includes('HIGH') ? '高报警 / 低报警双限' : '特种单回路误报警触发'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          {/* 工作状态与运行模式切换 */}
          <div className="flex bg-slate-950 border border-slate-800/70 rounded-xl p-1 gap-1">
            <button
              onClick={() => {
                setMode('MONITOR');
                addLog('info', '用户切换模式：监控模式');
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                mode === 'MONITOR'
                  ? "bg-emerald-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />
              监控模式
            </button>
            <button
              onClick={() => {
                setMode('DEBUG');
                addLog('info', '用户切换模式：调试模式');
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                mode === 'DEBUG'
                  ? "bg-amber-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-200" />
              调试/测试模式
            </button>
          </div>

          <div className="flex items-center gap-2">
             <button 
               onClick={() => {
                 setIsInitialized(false);
                 addLog('info', '用户切换模式：配置产品参数');
               }}
               title="切换产品型号或重设本趟试验批号"
               className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-755 border border-slate-700 text-amber-400 hover:text-amber-300 transition-all cursor-pointer"
             >
               <Settings size={13} />
               切换产品/批号
             </button>

             <button 
               onClick={() => {
                 setStations(INITIAL_STATIONS.map(s => ({ ...s })));
                 setFailHistory([]);
                 addLog('info', '用户切换模式：重置统计');
               }}
               title="重置当前统计"
               className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-850 hover:bg-slate-800 text-slate-205 text-slate-200 transition-all cursor-pointer"
             >
               <RefreshCw size={13} />
               重置统计
             </button>

             <button 
               onClick={() => {
                 const newLive = !isLive;
                 setIsLive(newLive);
                 addLog('info', `通讯链路状态：${newLive ? '链接正常' : '链路挂起'}`);
               }}
               className={cn(
                 "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                 isLive ? "bg-slate-800 text-slate-200" : "bg-blue-600 text-white"
               )}
             >
               {isLive ? <Activity size={14} /> : <RefreshCw size={14} />}
               {isLive ? "运行中" : "已挂起"}
             </button>
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-8 flex flex-col gap-6 min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            <StatCard 
              title="测试运行时长" 
              value={formatDuration(elapsedSeconds)} 
              icon={Clock}
              colorClass="bg-blue-500"
            />
            <StatCard 
              title="当前批次良率" 
              value={`${stats.yieldRate.toFixed(1)}%`} 
              icon={CheckCircle2}
              trend="+0.1%"
              colorClass="bg-emerald-500"
            />
            <StatCard 
              title="累计误报设备" 
              value={`${stats.alarmingDevicesCount} / 50`} 
              icon={Cpu}
              colorClass="bg-amber-500"
            />
            <StatCard 
              title="累计误报次数" 
              value={`${stats.totalAlarms} 次`} 
              icon={AlertTriangle}
              colorClass="bg-red-500"
            />
          </div>

          {/* 实时状态图模块 */}
          <div className="flex-[2.8_2.8_0%] bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-500" />
                <span>实时监控状态（50工位阵列）</span>
              </h2>
              <div className="flex gap-4">
                {selectedProduct.alarmTypes.includes('HIGH') ? (
                  <>
                    {[
                      { label: '正常无误报 (0次)', color: 'bg-slate-800 border-slate-700' },
                      { label: '轻微误报警 (1次)', color: 'bg-amber-500/30 border-amber-500' },
                      { label: '中度误报警 (2次)', color: 'bg-orange-500/30 border-orange-500' },
                      { label: '严重误报警 (≥3次)', color: 'bg-red-500/30 border-red-500' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-1.5 text-[9px] font-bold">
                        <div className={cn("w-2 h-2 rounded-full", item.color)} />
                        <span className="text-slate-400 uppercase">{item.label}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      { label: '正常无误报 (0次)', color: 'bg-slate-800 border-slate-700' },
                      { label: '单次回路误触 (1次)', color: 'bg-amber-500/30 border-amber-500' },
                      { label: '多次回路误触 (2次)', color: 'bg-orange-500/30 border-orange-500' },
                      { label: '频繁回路误触 (≥3次)', color: 'bg-red-500/30 border-red-500' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-1.5 text-[9px] font-bold">
                        <div className={cn("w-2 h-2 rounded-full", item.color)} />
                        <span className="text-slate-400 uppercase">{item.label}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
            
            <div className="flex-1 relative min-h-0">
              <div className="absolute inset-0 grid grid-cols-10 grid-rows-5 gap-2">
                {stations.map(station => {
                  const getStationStyle = (count: number, currentAlarm: AlarmType) => {
                    const isAlarming = currentAlarm !== 'NONE';
                    
                    if (count === 0) {
                      return cn(
                        "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/60 pb-3",
                        isAlarming && "animate-pulse border-amber-500/70 shadow-lg shadow-amber-500/10"
                      );
                    }
                    if (count === 1) {
                      return cn(
                        "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/5 pb-3",
                        isAlarming && "animate-pulse border-amber-500 shadow-md shadow-amber-500/10"
                      );
                    }
                    if (count === 2) {
                      return cn(
                        "bg-orange-500/15 border-orange-500/40 text-orange-400 shadow-sm shadow-orange-500/5 pb-3",
                        isAlarming && "animate-pulse border-orange-500 shadow-md shadow-orange-500/10"
                      );
                    }
                    return cn(
                      "bg-red-500/20 border-red-500/50 text-red-400 shadow-md shadow-red-500/5 pb-3",
                      isAlarming && "animate-pulse border-red-500 shadow-lg shadow-red-500/20"
                    );
                  };

                  return (
                    <div 
                      key={station.id}
                      onClick={() => handleStationClick(station.id)}
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-xl border text-[11px] font-bold select-none transition-all active:scale-95 cursor-pointer",
                        getStationStyle(station.alarmCount, station.currentAlarm)
                      )}
                    >
                      {station.alarmCount === 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/95 absolute top-1.5 right-1.5 animate-pulse" />
                      )}

                      <span>{station.id.toString().padStart(2, '0')}</span>

                      {station.alarmCount > 0 && (
                        <span className={cn(
                          "text-[9px] px-1 py-0.2 rounded font-mono font-extrabold mt-0.5 shadow-sm",
                          station.alarmCount >= 3 ? "bg-red-500/20 text-red-300 border border-red-500/10" :
                          station.alarmCount === 2 ? "bg-orange-500/20 text-orange-300 border border-orange-500/10" :
                          "bg-amber-500/20 text-amber-300 border border-amber-500/10"
                        )}>
                          ⚠️ {station.alarmCount}次
                        </span>
                      )}

                      {/* 实时高低限警/误报警灯气泡 */}
                      {station.currentAlarm !== 'NONE' && (
                        <span className={cn(
                          "absolute bottom-1 text-slate-100 text-[8px] leading-none py-0.5 px-1.5 rounded animate-pulse scale-90 tracking-tighter font-extrabold",
                          !selectedProduct.alarmTypes.includes('HIGH')
                            ? "bg-amber-600"
                            : station.currentAlarm === 'HIGH'
                              ? "bg-red-600"
                              : "bg-blue-600"
                        )}>
                          {!selectedProduct.alarmTypes.includes('HIGH')
                            ? "回路误报"
                            : station.currentAlarm === 'HIGH'
                              ? "高限警"
                              : "低限警"
                          }
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 异常工位历史追溯，缩小元素、增加集成度，取消历史上限 */}
          <div className="flex-[1.2_1.2_0%] bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <h2 className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wide">
                <History size={15} className="text-red-500 animate-pulse" />
                异常工位追溯历史
              </h2>
              <span className="text-[9px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                实时累积 · 历史无上限
              </span>
            </div>
            
            <div className="flex-1 relative min-h-0">
              <div className="absolute inset-0 overflow-x-auto overflow-y-hidden flex gap-3 pr-3 pb-2 custom-scrollbar items-center">
                <AnimatePresence mode="popLayout">
                  {failHistory.length === 0 ? (
                    <div className="w-full flex justify-center items-center text-slate-500 text-xs py-4 select-none">
                      暂无异常检测历史记录
                    </div>
                  ) : (
                    failHistory.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -40, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 350, damping: 26 }}
                        className="flex items-center shrink-0 min-w-[210px] max-w-[230px] h-[95%] bg-slate-950/80 border border-red-950/30 hover:border-red-500/30 rounded-lg p-2.5 relative transition-all duration-300 shadow-md gap-2"
                      >
                        <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-red-500 rounded-l-lg" />
                        
                        <div className="p-1.5 bg-red-500/10 text-red-500 rounded-md shrink-0">
                          <AlertCircle size={14} />
                        </div>
                        
                        <div className="flex flex-col flex-1 min-w-0 leading-tight">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-[10px] font-extrabold text-red-400 bg-red-500/10 px-1 py-0.2 rounded font-mono">
                              工位 {item.stationId.toString().padStart(2, '0')}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 font-bold">{item.timestamp}</span>
                          </div>
                          
                          <div className="text-slate-300 text-[10px] font-bold truncate">
                            {item.defectReason}
                          </div>
                          <div className="text-[8px] text-slate-500 font-mono scale-95 origin-left mt-0.5">
                            批次: {item.batch}
                          </div>
                        </div>

                        {index < failHistory.length - 1 && (
                          <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-[1px] border-dashed border-t border-red-500/20 pointer-events-none" />
                        )}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* 侧边部分 */}
        <div className="lg:col-span-4 flex flex-col gap-6 min-h-0 overflow-hidden">
          <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl h-[31%] shrink-0 overflow-hidden">
            <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2 uppercase tracking-wide">
              每小时合格良率走势
            </h3>
            <div className="h-full pb-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} domain={[90, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', fontSize: '10px' }} />
                  <Line type="monotone" dataKey="yield" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 3.5 }}>
                    <LabelList dataKey="yield" position="top" fill="#10b981" fontSize={9} fontWeight="bold" formatter={(v: any) => `${v}%`} offset={6} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex-1 bg-slate-950/80 border border-slate-800/80 rounded-2xl flex flex-col min-h-0 relative overflow-hidden">
            {/* Tab Headers */}
            <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 shrink-0 bg-slate-900/40">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('LOG')}
                  className={cn(
                    "text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer pb-1 border-b-2",
                    activeTab === 'LOG'
                      ? "text-blue-400 border-blue-500"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  )}
                >
                  <Terminal size={13} />
                  通讯协议日志
                </button>
                <button
                  onClick={() => setActiveTab('WS_SANDBOX')}
                  className={cn(
                    "text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer pb-1 border-b-2",
                    activeTab === 'WS_SANDBOX'
                      ? "text-amber-400 border-amber-500"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  )}
                >
                  <Cpu size={13} />
                  WS 帧调试沙盒
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full animate-pulse",
                  isLive ? "bg-emerald-500" : "bg-red-500"
                )} />
                <span className="text-[10px] font-mono text-slate-500 uppercase">
                  {isLive ? 'WS Live' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 p-4 min-h-0 flex flex-col overflow-hidden">
              {activeTab === 'LOG' ? (
                <div className="flex-1 relative min-h-0">
                  <div className="absolute inset-0 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                    {logs.map(log => (
                      <div key={log.id} className="text-[10px] font-mono border-l border-slate-800 pl-2 py-0.5 flex items-start gap-2 col-gap-2">
                        <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                        <span className={cn(
                          "shrink-0 font-bold text-[9px] px-1 rounded uppercase",
                          log.type === 'success' ? "bg-emerald-500/10 text-emerald-500" :
                          log.type === 'error' ? "bg-red-500/10 text-red-500" :
                          log.type === 'warning' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-400"
                        )}>
                          {log.type === 'success' ? '正常' : log.type === 'error' ? '误报' : log.type === 'warning' ? '误报' : '信息'}
                        </span>
                        <span className="text-slate-400 break-all leading-tight font-sans text-[10px]">{log.message}</span>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <div className="text-slate-500 text-xs text-center py-8">
                        等待物理网关通讯日志流入...
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col h-full overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                  <div className="bg-slate-900/60 border border-slate-800/60 p-2.5 rounded-lg text-[10px]">
                    <div className="font-bold text-amber-500 mb-1">WS 物理通道通信协议规定：</div>
                    <div className="text-slate-400 space-y-1 leading-relaxed font-mono text-[9px]">
                      <p>• <span className="text-red-400">ALARM</span>: {"{ stationId, alarmType: 'HIGH'|'LOW', defectReason, batch }"}</p>
                      <p>• <span className="text-blue-400">CLEAR</span>: {"{ stationId }"}</p>
                    </div>
                  </div>

                  {/* 自适应的注入测试 */}
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">快捷数据包模拟注入点</span>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      {selectedProduct.alarmTypes.includes('HIGH') ? (
                        <>
                          <button
                            onClick={() => {
                              const randId = Math.floor(Math.random() * 50) + 1;
                              processWSMessage({
                                type: 'ALARM',
                                payload: {
                                  stationId: randId,
                                  alarmType: 'HIGH',
                                  defectReason: '高报警',
                                  timestamp: new Date().toLocaleTimeString()
                                }
                              });
                            }}
                            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                          >
                            🔴 注入高报警
                            <span className="text-[9px] bg-red-500/10 text-red-400 px-1 py-0.2 rounded font-mono">HIGH</span>
                          </button>

                          <button
                            onClick={() => {
                              const randId = Math.floor(Math.random() * 50) + 1;
                              processWSMessage({
                                type: 'ALARM',
                                payload: {
                                  stationId: randId,
                                  alarmType: 'LOW',
                                  defectReason: '低报警',
                                  timestamp: new Date().toLocaleTimeString()
                                }
                              });
                            }}
                            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                          >
                            🔵 注入低报警
                            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1 py-0.2 rounded font-mono">LOW</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            const randId = Math.floor(Math.random() * 50) + 1;
                            processWSMessage({
                              type: 'ALARM',
                              payload: {
                                stationId: randId,
                                alarmType: 'HIGH',
                                defectReason: '误报',
                                timestamp: new Date().toLocaleTimeString()
                              }
                            });
                          }}
                          className="col-span-2 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-855 border border-slate-800 hover:border-slate-750 text-slate-300 font-bold rounded-lg text-[10px] transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                        >
                          ⚠️ 触发物理盒单通道“误报”动作
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">ALARM</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          const alarming = stations.filter(s => s.currentAlarm !== 'NONE');
                          if (alarming.length === 0) {
                            addLog('info', '系统无任何正在报警之工位，无需执行 WS 清除包仿真');
                            return;
                          }
                          const target = alarming[Math.floor(Math.random() * alarming.length)];
                          processWSMessage({
                            type: 'CLEAR',
                            payload: {
                              stationId: target.id,
                              timestamp: new Date().toLocaleTimeString()
                            }
                          });
                        }}
                        className="px-2 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                      >
                        🟢 清除随机报警
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 py-0.2 rounded font-mono">CLEAR</span>
                      </button>

                      <button
                        onClick={() => {
                          const deviations = hourlyData.map(h => {
                            const change = (Math.random() * 3 - 1.5);
                            return { ...h, yield: parseFloat(Math.min(100, Math.max(90, h.yield + change)).toFixed(1)) };
                          });
                          processWSMessage({
                            type: 'METRICS_UPDATE',
                            payload: {
                              metrics: deviations,
                              timestamp: new Date().toLocaleTimeString()
                            }
                          });
                        }}
                        className="px-2 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                      >
                        📈 突变良率曲线
                        <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-mono">UPDATE</span>
                      </button>
                    </div>
                  </div>

                  {/* Raw frame simulation block */}
                  <div className="flex flex-col flex-1 min-h-0">
                    <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">广播自定义 WS 原始数据帧 (JSON 协议)</span>
                    <textarea
                      value={wsPayloadInput}
                      onChange={(e) => setWsPayloadInput(e.target.value)}
                      className="w-full flex-1 min-h-[50px] bg-slate-950/90 text-yellow-500 font-mono text-[9px] p-2 mt-1 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500/50 resize-none custom-scrollbar"
                    />
                    <button
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(wsPayloadInput);
                          processWSMessage(parsed);
                        } catch (err: any) {
                          addLog('error', `【手动 WS 注入失败】JSON 校验未通过: ${err.message}`);
                        }
                      }}
                      className="w-full py-1.5 mt-1.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold rounded-lg text-[10px] transition-all cursor-pointer text-center select-none"
                    >
                      🚀 向系统模拟广播自定义数据包 (Direct Inject Packet)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30, 41, 59, 0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .animate-spin-slow { animation: spin 20s linear infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
