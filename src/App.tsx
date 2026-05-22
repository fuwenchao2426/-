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
  AlertCircle,
  Plus,
  Trash2,
  X
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
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
      ALARM: "回路误触发触发"
    }
  },
  {
    id: "LKM1A",
    name: "LKM1A型自动灭火盒",
    alarmTypes: ["ALARM"],
    alarmLabels: {
      ALARM: "特种极速误触发"
    }
  }
];

export interface BoardState {
  id: number; // 板Id
  product: ProductConfig;
  batch: string;
  elapsedSeconds: number;
  stations: Station[];
  failHistory: FailRecord[];
  hourlyData: { time: string; yield: number }[];
  logs: LogEntry[];
  isLive: boolean; // 是否在进行通讯采集
  mode: 'MONITOR' | 'DEBUG';
}

// --- Icons / Sub-components ---

const StatCard = ({ title, value, icon: Icon, colorClass }: { 
  title: string; 
  value: string | number; 
  icon: any; 
  colorClass?: string;
}) => (
  <div className="bg-slate-900/60 py-6 px-5 h-28 rounded-2xl backdrop-blur-md flex items-center justify-between gap-4 shadow-md transition-all">
    {/* 左侧：图标+文字上下布局 */}
    <div className="flex flex-col items-start gap-2.5">
      <div className={cn("p-2.5 rounded-xl shrink-0 flex items-center justify-center shadow", colorClass)}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-slate-400 text-[13px] md:text-sm font-bold tracking-tight leading-snug">{title}</p>
    </div>
    {/* 右侧：数值 字体再大一点 */}
    <div className="text-right shrink-0">
      <h3 className="text-3xl md:text-4xl font-black text-white tracking-tight font-mono">{value}</h3>
    </div>
  </div>
);

const formatDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatDurationShort = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatSimulatedTime = (elapsedSec: number) => {
  const h = Math.floor(elapsedSec / 60);
  const m = elapsedSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// 生产每张板默认48工位的数组
const create48Stations = (): Station[] => {
  return Array.from({ length: 48 }, (_, i) => ({
    id: i + 1,
    alarmCount: 0,
    currentAlarm: 'NONE',
  }));
};

export default function App() {
  // 1. 系统板卡状态列表默认初始化 (网页加载后直接进入主屏，无需遮罩，且支持 N 块板)
  const [boards, setBoards] = useState<BoardState[]>(() => {
    return [
      {
        id: 1,
        product: PRODUCTS[0],
        batch: "B20260521-01",
        elapsedSeconds: 15,
        stations: create48Stations(),
        failHistory: [
          {
            id: "f-1-1",
            stationId: 12,
            batch: "B20260521-01",
            defectReason: "高报警",
            timestamp: "08:12:05"
          },
          {
            id: "f-1-2",
            stationId: 35,
            batch: "B20260521-01",
            defectReason: "低报警",
            timestamp: "08:44:31"
          }
        ],
        hourlyData: [
          { time: '00:00', yield: 100 },
        ],
        logs: [
          { id: "log-1-0", timestamp: "08:00:22", type: "success", message: "系统自动配置加载成功" },
          { id: "log-1-1", timestamp: "08:01:05", type: "info", message: "通讯链路状态：正常" },
          { id: "log-1-2", timestamp: "08:12:05", type: "error", message: "[工位 12] 报警类型：高报警" },
          { id: "log-1-3", timestamp: "08:44:31", type: "warning", message: "[工位 35] 报警类型：低报警" }
        ],
        isLive: true,
        mode: 'MONITOR'
      },
      {
        id: 2,
        product: PRODUCTS[1],
        batch: "B20260521-02",
        elapsedSeconds: 8,
        stations: create48Stations(),
        failHistory: [
          {
            id: "f-2-1",
            stationId: 8,
            batch: "B20260521-02",
            defectReason: "高报警",
            timestamp: "09:15:18"
          }
        ],
        hourlyData: [
          { time: '00:00', yield: 100 },
        ],
        logs: [
          { id: "log-2-0", timestamp: "08:00:25", type: "success", message: "系统自动配置加载成功" },
          { id: "log-2-1", timestamp: "09:02:11", type: "info", message: "通讯链路状态：正常" },
          { id: "log-2-2", timestamp: "09:15:18", type: "error", message: "[工位 08] 报警类型：高报警" }
        ],
        isLive: true,
        mode: 'MONITOR'
      },
      {
        id: 3,
        product: PRODUCTS[2],
        batch: "B20260521-03",
        elapsedSeconds: 0,
        stations: create48Stations(),
        failHistory: [],
        hourlyData: [
          { time: '00:00', yield: 100 },
        ],
        logs: [
          { id: "log-3-0", timestamp: "08:00:30", type: "success", message: "系统自动配置加载成功" },
          { id: "log-3-1", timestamp: "09:00:55", type: "info", message: "通讯链路状态：正常" }
        ],
        isLive: true,
        mode: 'MONITOR'
      }
    ];
  });

  const [activeBoardId, setActiveBoardId] = useState<number>(1);
  const [activeTab, setActiveTab ] = useState<'LOG' | 'WS_SANDBOX'>('LOG');
  const [wsPayloadInput, setWsPayloadInput] = useState<string>('');

  // 1. 主要板卡管理弹窗状态控制
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  
  // 弹出工位大面板详情
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);

  // 选中的活跃板对象
  const activeBoard = useMemo(() => {
    return boards.find(b => b.id === activeBoardId) || boards[0];
  }, [boards, activeBoardId]);

  // 根据当前板上 48 个工位的状态动态得出统计指标
  // 良率是按照设备数算的。同一台设备，多次报警，是累计次数增加，但已经报过警的设备不会再作为新的“误报设备”增加了。
  const stats = useMemo(() => {
    const totalAlarms = activeBoard.stations.reduce((acc, s) => acc + s.alarmCount, 0);
    const alarmingDevicesCount = activeBoard.stations.filter(s => s.alarmCount > 0).length;
    const yieldRate = ((48 - alarmingDevicesCount) / 48) * 100;
    return {
      totalAlarms,
      alarmingDevicesCount,
      yieldRate,
    };
  }, [activeBoard.stations]);

  // 保证 refs 在自同步时能拿到最新的 Boards
  const boardsRef = React.useRef(boards);
  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);

  // 同步当前活跃板到沙盒代码的 JSON payload 自适应显示
  useEffect(() => {
    const isHighLow = activeBoard.product.alarmTypes.includes('HIGH');
    const template = {
      type: "ALARM",
      payload: {
        stationId: 18,
        alarmType: isHighLow ? "HIGH" : "ALARM",
        defectReason: isHighLow ? "高报警" : "误报",
        batch: activeBoard.batch
      }
    };
    setWsPayloadInput(JSON.stringify(template, null, 2));
  }, [activeBoard.product, activeBoard.batch, activeBoardId]);

  // 帮助我们在对特定 board 触发操作时添加日志
  const addLogToBoard = (boardId: number, type: LogEntry['type'], msg: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message: msg
    };
    setBoards(prev => prev.map(b => {
      if (b.id === boardId) {
        return {
          ...b,
          logs: [newLog, ...b.logs].slice(0, 150)
        };
      }
      return b;
    }));
  };

  // --- WebSocket 仿真消息接收分发中心 (Single Board Specific Source of Truth) ---
  const processWSMessage = (msg: WSMessage, boardId: number = activeBoardId) => {
    const targetBoard = boardsRef.current.find(b => b.id === boardId);
    if (!targetBoard) return;

    const nowStr = msg.payload.timestamp || new Date().toLocaleTimeString();
    const isDebug = targetBoard.mode === 'DEBUG';
    const stationId = msg.payload.stationId;
    const idStr = stationId !== undefined ? stationId.toString().padStart(2, '0') : '';

    let logType: LogEntry['type'] = 'info';
    let readableMsg = '';

    if (msg.type === 'HEARTBEAT') {
      readableMsg = `[工位 ${idStr}] 通讯链路状态：正常`;
      logType = 'info';
    } else if (msg.type === 'ALARM') {
      const hasHighLow = targetBoard.product.alarmTypes.includes('HIGH');
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

    const newLogItem: LogEntry | null = readableMsg ? {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: nowStr,
      type: logType,
      message: readableMsg
    } : null;

    setBoards(prev => prev.map(b => {
      if (b.id !== boardId) return b;

      let nextStations = [...b.stations];
      let nextFailHistory = [...b.failHistory];
      let nextLogs = newLogItem ? [newLogItem, ...b.logs].slice(0, 150) : b.logs;
      let nextHourlyData = [...b.hourlyData];

      switch(msg.type) {
        case 'HEARTBEAT': {
          if (stationId === undefined) break;
          // 设备心跳：直接更新数值，不附带噪声
          nextStations = nextStations.map(s => s.id === stationId ? { ...s, value: msg.payload.value ?? parseFloat((3.15 + Math.random() * 0.35).toFixed(3)) } : s);
          break;
        }

        case 'ALARM': {
          const { alarmType, batch } = msg.payload;
          if (stationId === undefined || !alarmType) break;

          let resolvedAlarmType = alarmType;
          if (!b.product.alarmTypes.includes('HIGH')) {
            resolvedAlarmType = 'HIGH'; // 单回路
          }

          nextStations = nextStations.map(s => s.id === stationId ? {
            ...s,
            currentAlarm: resolvedAlarmType,
            alarmCount: isDebug ? s.alarmCount : s.alarmCount + 1,
            alarmTimer: 5,
          } : s);

          if (!isDebug) {
            const isHighLow = b.product.alarmTypes.includes('HIGH');
            const finalReason = isHighLow 
              ? (resolvedAlarmType === 'HIGH' ? '高报警' : '低报警') 
              : '误报';

            const newRecord: FailRecord = {
              id: msg.payload.id || Math.random().toString(36).substr(2, 9),
              stationId,
              batch: batch || b.batch,
              defectReason: finalReason,
              timestamp: nowStr,
            };
            nextFailHistory = [newRecord, ...nextFailHistory];
          }
          break;
        }

        case 'CLEAR': {
          if (stationId === undefined) break;
          nextStations = nextStations.map(s => s.id === stationId ? { ...s, currentAlarm: 'NONE', alarmTimer: 0 } : s);
          break;
        }

        case 'METRICS_UPDATE': {
          if (msg.payload.metrics) {
            nextHourlyData = msg.payload.metrics;
          }
          break;
        }

        case 'BATCH_CHANGE': {
          if (msg.payload.batch) {
            b.batch = msg.payload.batch;
          }
          break;
        }
      }

      return {
        ...b,
        stations: nextStations,
        failHistory: nextFailHistory,
        logs: nextLogs,
        hourlyData: nextHourlyData
      };
    }));
  };

  // --- 核心全局定时器：多板同时在线仿真，并在左窄栏显示波动的参数和曲线 ---
  useEffect(() => {
    const mainInterval = setInterval(() => {
      const nowStr = new Date().toLocaleTimeString();

      setBoards(prevBoards => prevBoards.map(b => {
        if (!b.isLive) return b;

        let nextElapsed = b.elapsedSeconds + 1;
        let nextStations = [...b.stations];
        let nextFailHistory = [...b.failHistory];
        let nextLogs = [...b.logs];
        let nextHourlyData = [...b.hourlyData];

        if (b.mode === 'MONITOR') {
          // A. 心跳协议包：25%概率触发
          if (Math.random() < 0.25) {
            const randId = Math.floor(Math.random() * 48) + 1;
            const fakeVal = parseFloat((3.12 + Math.random() * 0.38).toFixed(3));
            
            const logMsg = `[工位 ${randId.toString().padStart(2, '0')}] 通讯链路状态：正常`;
            nextLogs = [{
              id: Math.random().toString(36).substr(2, 9),
              timestamp: nowStr,
              type: 'info',
              message: logMsg
            }, ...nextLogs].slice(0, 150);

            nextStations = nextStations.map(s => s.id === randId ? { ...s, value: fakeVal } : s);
          }

          // B. 误警报突发：10% 几率产生
          if (Math.random() < 0.10) {
            const healthy = nextStations.filter(s => s.currentAlarm === 'NONE');
            if (healthy.length > 0) {
              const target = healthy[Math.floor(Math.random() * healthy.length)];
              const hasHighLow = b.product.alarmTypes.includes('HIGH');

              let alarmType: AlarmType = 'HIGH';
              let reason = '误报';

              if (hasHighLow) {
                alarmType = Math.random() > 0.5 ? 'HIGH' : 'LOW';
                reason = alarmType === 'HIGH' ? '高报警' : '低报警';
              }

              const logMsg = `[工位 ${target.id.toString().padStart(2, '0')}] 报警类型：${reason}`;
              nextLogs = [{
                id: Math.random().toString(36).substr(2, 9),
                timestamp: nowStr,
                type: alarmType === 'HIGH' ? 'error' : 'warning',
                message: logMsg
              }, ...nextLogs].slice(0, 150);

              nextStations = nextStations.map(s => s.id === target.id ? {
                ...s,
                currentAlarm: alarmType,
                alarmCount: s.alarmCount + 1,
                alarmTimer: 5 // 5秒自愈
              } : s);

              const newRecord: FailRecord = {
                id: Math.random().toString(36).substr(2, 9),
                stationId: target.id,
                batch: b.batch,
                defectReason: reason,
                timestamp: nowStr
              };
              nextFailHistory = [newRecord, ...nextFailHistory];
            }
          }

          // C. 处理自愈计时器逻辑
          nextStations = nextStations.map(s => {
            if (s.currentAlarm !== 'NONE' && s.alarmTimer !== undefined && s.alarmTimer > 0) {
              const uTimer = s.alarmTimer - 1;
              if (uTimer === 0) {
                const logMsg = `[工位 ${s.id.toString().padStart(2, '0')}] 取消报警`;
                nextLogs = [{
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp: nowStr,
                  type: 'success',
                  message: logMsg
                }, ...nextLogs].slice(0, 150);

                return { ...s, currentAlarm: 'NONE', alarmTimer: 0 };
              }
              return { ...s, alarmTimer: uTimer };
            }
            return s;
          });

          // D. 折线图绘制：固定 y 轴 0-100%，每半小时 (即每 30 秒) 绘制一个点，最后一个数值实时更新
          const alarmingDevicesCount = nextStations.filter(s => s.alarmCount > 0).length;
          const currentYield = parseFloat((((48 - alarmingDevicesCount) / 48) * 100).toFixed(1));
          
          const halfHourIdx = Math.floor(nextElapsed / 30);
          const timeLabel = formatSimulatedTime(halfHourIdx * 30);
          
          if (nextHourlyData.length === 0) {
            nextHourlyData.push({ time: timeLabel, yield: currentYield });
          } else {
            const lastIdx = nextHourlyData.length - 1;
            const lastPoint = { ...nextHourlyData[lastIdx] };
            if (lastPoint.time === timeLabel) {
              lastPoint.yield = currentYield;
              nextHourlyData[lastIdx] = lastPoint;
            } else {
              // 跨入到新的半小时，追加一个新点
              nextHourlyData.push({ time: timeLabel, yield: currentYield });
              if (nextHourlyData.length > 20) {
                nextHourlyData.shift(); // 保持 20 个点内的滑动窗口
              }
            }
          }
        }

        return {
          ...b,
          elapsedSeconds: nextElapsed,
          stations: nextStations,
          failHistory: nextFailHistory,
          logs: nextLogs,
          hourlyData: nextHourlyData
        };
      }));
    }, 1000);

    return () => clearInterval(mainInterval);
  }, []);

  // 手动调试激活指定工位: 直接唤醒工位详情弹窗，允许跨模式分析或注入
  const handleStationClick = (id: number) => {
    setSelectedStationId(id);
  };

  // 渲染单工位详细档案及交互弹窗
  const renderStationDetailModal = () => {
    if (selectedStationId === null) return null;
    const station = activeBoard.stations.find(s => s.id === selectedStationId);
    if (!station) return null;

    const hasHighLow = activeBoard.product.alarmTypes.includes('HIGH');
    const isAlarming = station.currentAlarm !== 'NONE';
    
    // 找出关于该工位的历史
    const stationHistory = activeBoard.failHistory.filter(h => h.stationId === selectedStationId);

    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 15 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            {/* 顶栏 */}
            <div className="p-5 border-b border-slate-800/60 bg-slate-950/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-black font-mono text-base border shadow-sm",
                  isAlarming 
                    ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse" 
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                )}>
                  {station.id.toString().padStart(2, '0')}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    工位设备参数管理
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">板ID #{activeBoard.id} · {activeBoard.product.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStationId(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition-all flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 内容区 */}
            <div className="p-5 space-y-4">
              {/* 核心指标看板 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-center">
                  <span className="text-[10px] text-slate-500 font-bold mb-1">物理监控状态</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full", isAlarming ? "bg-red-500 animate-ping" : "bg-emerald-500")} />
                    <span className={cn("text-xs font-black font-mono", isAlarming ? "text-red-400" : "text-emerald-400")}>
                      {isAlarming 
                        ? (!hasHighLow ? '回路误报报警中' : (station.currentAlarm === 'HIGH' ? '高限警报警中' : '低限警报警中')) 
                        : '通道处于闭合自愈中'
                      }
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-center">
                  <span className="text-[10px] text-slate-500 font-bold mb-1">累计误报检测</span>
                  <span className="text-xs font-extrabold text-white font-mono">{station.alarmCount} 次异常报警</span>
                </div>
              </div>

              {/* 持续时长及仿真时限 */}
              <div className="bg-slate-950/30 border border-slate-800/60 p-3.5 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">最新检测时钟</span>
                  <span className="text-slate-200 font-mono font-bold">
                    {stationHistory.length > 0 ? stationHistory[0].timestamp : '暂无触发'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">自愈熔断维持</span>
                  <span className="text-slate-200 font-mono font-bold">
                    {isAlarming ? '8s 心跳探测重试周期' : '通道检测就绪'}
                  </span>
                </div>
              </div>

              {/* 专属异常追溯历史数据 */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 block">最近故障轨迹记录</span>
                <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar bg-slate-950/60 border border-slate-850 p-2 rounded-xl">
                  {stationHistory.length === 0 ? (
                    <div className="text-[11px] text-slate-500 text-center py-4 font-mono">暂无此工位故障上报数据</div>
                  ) : (
                    stationHistory.map(h => (
                      <div key={h.id} className="flex justify-between items-center text-[11px] border-b border-slate-900 pb-1.5 last:border-0 last:pb-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          <span className="text-slate-300 font-semibold">{h.defectReason}</span>
                        </div>
                        <span className="text-slate-500 font-mono">{h.timestamp}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 心跳快捷调试和手执模拟注入 */}
              <div className="border-t border-slate-800/80 pt-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-400">故障仿真与物理自愈</span>
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded font-mono",
                    activeBoard.mode === 'DEBUG' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-slate-850 text-slate-400"
                  )}>
                    {activeBoard.mode === 'DEBUG' ? '调试模式 · 支持注入' : '现场监控模式'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* 清除按钮：物理自愈 */}
                  <button
                    onClick={() => {
                      if (station.currentAlarm === 'NONE') return;
                      processWSMessage({
                        type: 'CLEAR',
                        payload: {
                          stationId: station.id,
                          timestamp: new Date().toLocaleTimeString()
                        }
                      });
                      addLogToBoard(activeBoard.id, 'success', `【设备自愈】清除信号生效于 [工位 ${station.id.toString().padStart(2, '0')}]`);
                    }}
                    disabled={station.currentAlarm === 'NONE'}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                      station.currentAlarm !== 'NONE'
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed"
                    )}
                  >
                    🌱 快捷自愈恢复
                  </button>

                  {/* 模拟注入 */}
                  {activeBoard.mode === 'DEBUG' ? (
                    hasHighLow ? (
                      <button
                        onClick={() => {
                          const forceType = station.currentAlarm === 'HIGH' ? 'LOW' : 'HIGH';
                          processWSMessage({
                            type: 'ALARM',
                            payload: {
                              stationId: station.id,
                              alarmType: forceType,
                              defectReason: forceType === 'HIGH' ? '高报警' : '低报警',
                              timestamp: new Date().toLocaleTimeString(),
                              batch: activeBoard.batch
                            }
                          });
                        }}
                        className="py-2 px-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        ⚡ 注入 / 切换报警
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (station.currentAlarm !== 'NONE') return;
                          processWSMessage({
                            type: 'ALARM',
                            payload: {
                              stationId: station.id,
                              alarmType: 'HIGH',
                              defectReason: '误报',
                              timestamp: new Date().toLocaleTimeString(),
                              batch: activeBoard.batch
                            }
                          });
                        }}
                        disabled={station.currentAlarm !== 'NONE'}
                        className={cn(
                          "py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer",
                          station.currentAlarm === 'NONE'
                            ? "bg-amber-600 hover:bg-amber-500 text-white"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        )}
                      >
                        ⚠️ 注入回路误报
                      </button>
                    )
                  ) : (
                    <div className="bg-slate-950/40 rounded-xl p-2 flex items-center justify-center text-center text-[10px] text-slate-500 border border-slate-850">
                      切换为调试模式即可手动注入测试状态
                    </div>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  };

  // 渲染多板管理器弹窗
  const renderManageModal = () => (
    <AnimatePresence>
      {isManageModalOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -15 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col gap-6 css-scrollbar"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <Settings size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">下位机板卡与测试型号管理 (工位48)</h3>
                  <p className="text-slate-400 text-xs">在此增加、删除运行板或修改在测的产品型号、实验批次</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManageModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-t border-slate-800/80 my-0.5" />

            <div className="flex flex-col gap-4">
              {boards.map(b => (
                <div key={b.id} className="bg-slate-950 border border-slate-800/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
                      板卡 #{b.id}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-semibold mb-0.5">运行型号:</span>
                      <select
                        value={b.product.id}
                        onChange={(e) => {
                          const prod = PRODUCTS.find(p => p.id === e.target.value);
                          if (prod) {
                            setBoards(prev => prev.map(old => old.id === b.id ? { 
                              ...old, 
                              product: prod, 
                              // 重新初始化工位，清空报错计
                              stations: create48Stations(), 
                              failHistory: [] 
                            } : old));
                            addLogToBoard(b.id, 'info', `用户切换模式：修改配置，调整为产品 ${prod.name}`);
                          }
                        }}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none appearance-none cursor-pointer"
                      >
                        {PRODUCTS.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-semibold mb-0.5">测试批号:</span>
                      <input
                        type="text"
                        value={b.batch}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBoards(prev => prev.map(old => old.id === b.id ? { ...old, batch: val } : old));
                        }}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none font-mono py-1.5 max-w-[125px]"
                      />
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-semibold mb-0.5">链路状态:</span>
                      <button 
                        onClick={() => {
                          setBoards(prev => prev.map(old => old.id === b.id ? { ...old, isLive: !old.isLive } : old));
                          addLogToBoard(b.id, 'info', `通讯链路状态：${!b.isLive ? '正常' : '链路挂起'}`);
                        }}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold tracking-tight py-1.5",
                          b.isLive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}
                      >
                        {b.isLive ? "● 开启中" : "○ 已挂起"}
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        if (boards.length <= 1) {
                          alert("系统必须保留至少一块正在监测的设备板！");
                          return;
                        }
                        setBoards(prev => prev.filter(old => old.id !== b.id));
                        if (activeBoardId === b.id) {
                          const remaining = boards.filter(old => old.id !== b.id);
                          setActiveBoardId(remaining[0].id);
                        }
                      }}
                      className="p-2 text-red-500 hover:text-white hover:bg-red-900/40 rounded-lg transition-all mt-4 cursor-pointer"
                      title="移除这块测试板"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/80 pt-4 mt-1">
              <button
                onClick={() => {
                  setBoards(prev => {
                    const nextId = prev.length > 0 ? Math.max(...prev.map(p => p.id)) + 1 : 1;
                    return [
                      ...prev,
                      {
                        id: nextId,
                        product: PRODUCTS[nextId % PRODUCTS.length],
                        batch: `B20260521-0${nextId}`,
                        elapsedSeconds: 0,
                        stations: create48Stations(),
                        failHistory: [],
                        hourlyData: [
                          { time: '08:00', yield: 100.0 },
                          { time: '09:00', yield: 100.0 },
                          { time: '10:00', yield: 100.0 },
                          { time: '11:00', yield: 100.0 },
                          { time: '12:00', yield: 100.0 },
                          { time: '13:00', yield: 100.0 },
                          { time: '14:00', yield: 100.0 },
                        ],
                        logs: [{ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), type: "success", message: "物理板配置成功创建" }],
                        isLive: true,
                        mode: 'MONITOR'
                      }
                    ];
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer shadow-lg shadow-blue-500/10 active:scale-[0.98]"
              >
                <Plus size={13} />
                增加一片新物理板卡 (Board Slot)
              </button>

              <button
                onClick={() => setIsManageModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                保存并退出管理
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans p-4 overflow-hidden flex flex-row gap-4 selection:bg-blue-600 selection:text-white">
      
      {/* 5. 增加了左窄栏: 显示各板子的精简主要参数和曲线，点击可在多板中极速切换右侧主看板 */}
      <aside className="w-64 lg:w-72 shrink-0 bg-slate-900/30 border border-slate-800/80 p-3 rounded-2xl flex flex-col gap-3 overflow-y-auto custom-scrollbar">
        <div className="px-1.5 pt-1 pb-2 shrink-0 flex items-center justify-between border-b border-slate-800/60">
          <div className="flex flex-col">
            <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">下位物理板卡总线</span>
            <span className="text-[10px] text-slate-500 font-mono">COM Link · {boards.length} Boards Online</span>
          </div>
          <button 
            onClick={() => setIsManageModalOpen(true)}
            title="添加或移除板卡"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 rounded-lg transition-all cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>

        <nav className="flex flex-col gap-2.5">
          {boards.map(b => {
            const isSelected = b.id === activeBoardId;
            const bAlarms = b.stations.reduce((sum, s) => sum + s.alarmCount, 0);
            const bAlarmingDevs = b.stations.filter(s => s.alarmCount > 0).length;
            const bYield = ((48 - bAlarmingDevs) / 48) * 100;

            return (
              <div
                key={b.id}
                onClick={() => setActiveBoardId(b.id)}
                className={cn(
                  "p-2 py-1.5 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col group select-none relative overflow-hidden",
                  isSelected 
                    ? "bg-blue-950/45 border-blue-500/70 shadow-lg shadow-blue-500/5 ring-1 ring-blue-500/15" 
                    : "bg-slate-950/50 border-slate-800/70 hover:bg-slate-900/20 hover:border-slate-700"
                )}
              >
                {/* 状态指示彩条 */}
                <span className={cn(
                  "absolute left-0 top-0 bottom-0 w-1",
                  isSelected ? "bg-blue-500" : "bg-slate-800 group-hover:bg-slate-700"
                )} />

                <div className="flex justify-between items-center gap-1 pb-0.5">
                  <span className={cn(
                    "text-[10px] font-bold font-mono tracking-tight flex items-center gap-1.5",
                    isSelected ? "text-blue-400" : "text-slate-400"
                  )}>
                    <span>板卡 #{b.id}</span>
                    <span className="text-[9px] text-slate-500 font-normal">· {b.batch}</span>
                  </span>
                  <div className="flex gap-1 items-center">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      b.isLive ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                    )} />
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">
                      COM{b.id}
                    </span>
                  </div>
                </div>

                <h4 className="text-[11px] font-extrabold text-slate-300 truncate tracking-wide leading-none py-0.5">
                  {b.product.name}
                </h4>

                <div className="border-t border-slate-800/40 my-1" />

                {/* 板卡三个关键参数：1行3列 */}
                <div className="grid grid-cols-3 gap-1 font-mono mt-1">
                  <div className="bg-slate-950/60 p-1 px-1.5 rounded-lg border border-slate-800/40 flex flex-col justify-center">
                    <span className="text-[8px] text-slate-500 font-sans scale-90 -ml-0.5 origin-left tracking-tight whitespace-nowrap">运行时间</span>
                    <span className="font-extrabold text-white text-[11px] md:text-xs leading-tight">{formatDurationShort(b.elapsedSeconds)}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1 px-1.5 rounded-lg border border-slate-800/40 flex flex-col justify-center">
                    <span className="text-[8px] text-slate-500 font-sans scale-90 -ml-0.5 origin-left tracking-tight whitespace-nowrap">误报设备</span>
                    <span className="font-extrabold text-white text-[11px] md:text-xs leading-tight">{bAlarmingDevs}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1 px-1.5 rounded-lg border border-slate-800/40 flex flex-col justify-center">
                    <span className="text-[8px] text-slate-500 font-sans scale-90 -ml-0.5 origin-left tracking-tight whitespace-nowrap">累计次数</span>
                    <span className="font-extrabold text-white text-[11px] md:text-xs leading-tight">{bAlarms}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* 右侧主监控详细看板 */}
      <main className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
        
        {/* Header 顶头栏 */}
        <header className="flex justify-between items-center bg-slate-900/30 p-3.5 rounded-2xl border border-slate-800/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-md">
              <Cpu className="text-white" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>{activeBoard.product.name}</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md border border-blue-500/20 font-extrabold font-mono">COM{activeBoard.id}</span>
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-400">
                  板卡 #{activeBoard.id} | 48工位独立数控链路 | 批号: {activeBoard.batch} | 报警状态: {activeBoard.product.alarmTypes.includes('HIGH') ? '双限警 (高/低限位)' : '特种单回路误触发'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            {/* 3. 运行模式切换器 */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => {
                  setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, mode: 'MONITOR' } : b));
                  addLogToBoard(activeBoardId, 'info', '用户切换模式：监控模式');
                }}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                  activeBoard.mode === 'MONITOR'
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />
                监控模式
              </button>
              <button
                onClick={() => {
                  setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, mode: 'DEBUG' } : b));
                  addLogToBoard(activeBoardId, 'info', '用户切换模式：调试模式');
                }}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                  activeBoard.mode === 'DEBUG'
                    ? "bg-amber-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-200" />
                调试/测试模式
              </button>
            </div>

            <div className="flex items-center gap-2">
               {/* 6. 管理物理板/在测产品和批次修改 */}
               <button 
                 onClick={() => setIsManageModalOpen(true)}
                 title="对已有测试修改，增删"
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 hover:text-amber-300 transition-all cursor-pointer"
               >
                 <Settings size={13} />
                 配置管理板卡
               </button>

               <button 
                 onClick={() => {
                   setBoards(prev => prev.map(b => {
                     if (b.id === activeBoardId) {
                       return {
                         ...b,
                         stations: create48Stations(),
                         failHistory: []
                       };
                     }
                     return b;
                   }));
                   addLogToBoard(activeBoardId, 'info', '用户切换模式：重置统计');
                 }}
                 title="重置当前板统计"
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-850 hover:bg-slate-800 text-slate-200 transition-all cursor-pointer"
               >
                 <RefreshCw size={13} />
                 重置统计
               </button>

               <button 
                 onClick={() => {
                   const newLive = !activeBoard.isLive;
                   setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, isLive: newLive } : b));
                   addLogToBoard(activeBoardId, 'info', `通讯链路状态：${newLive ? '链接正常' : '链路挂起'}`);
                 }}
                 className={cn(
                   "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                   activeBoard.isLive ? "bg-slate-800 text-slate-200" : "bg-blue-600 text-white"
                 )}
               >
                 {activeBoard.isLive ? <Activity size={13} /> : <RefreshCw size={13} />}
                 {activeBoard.isLive ? "采集运行中" : "采集已挂起"}
               </button>
            </div>
          </div>
        </header>

        {/* 主数据体 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
          
          <div className="lg:col-span-9 flex flex-col gap-4 min-h-0 overflow-hidden">
            {/* 2. 运行时长主要参数看板：图标+文字上下布局占左侧，数值占右侧，字体再大一号 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
              <StatCard 
                title="运行时长" 
                value={formatDuration(activeBoard.elapsedSeconds)} 
                icon={Clock}
                colorClass="bg-blue-500"
              />
              <StatCard 
                title="当前良率" 
                value={`${stats.yieldRate.toFixed(1)}%`} 
                icon={CheckCircle2}
                colorClass="bg-emerald-500"
              />
              <StatCard 
                title="误报设备" 
                value={`${stats.alarmingDevicesCount}/48`} 
                icon={Cpu}
                colorClass="bg-amber-500"
              />
              <StatCard 
                title="累计次数" 
                value={`${stats.totalAlarms}`} 
                icon={AlertTriangle}
                colorClass="bg-red-500"
              />
            </div>

            {/* 实时状态图模块：48工位阵列图 */}
            <div className="flex-[2.2_2.2_0%] bg-slate-900/30 border border-slate-800/80 rounded-2xl p-5 flex flex-col min-h-0 overflow-hidden relative">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <BarChart3 size={15} className="text-blue-500" />
                  <span>实时监控状态（#{activeBoard.id} 板 48工位阵列）</span>
                </h2>
                <div className="flex gap-3">
                  {activeBoard.product.alarmTypes.includes('HIGH') ? (
                    <>
                      {[
                        { label: '无误报', color: 'bg-slate-800 border-slate-700' },
                        { label: '轻微 (1次)', color: 'bg-amber-500/30 border-amber-500' },
                        { label: '中度 (2次)', color: 'bg-orange-500/30 border-orange-500' },
                        { label: '严重 (≥3次)', color: 'bg-red-500/30 border-red-500' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-1 text-[9px] font-bold">
                          <div className={cn("w-2 h-2 rounded-full", item.color)} />
                          <span className="text-slate-400">{item.label}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[
                        { label: '无误报', color: 'bg-slate-800 border-slate-700' },
                        { label: '回路误触 (1次)', color: 'bg-amber-500/30 border-amber-500' },
                        { label: '多次 (2次)', color: 'bg-orange-500/30 border-orange-500' },
                        { label: '严重 (≥3次)', color: 'bg-red-500/30 border-red-500' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-1 text-[9px] font-bold">
                          <div className={cn("w-2 h-2 rounded-full", item.color)} />
                          <span className="text-slate-400">{item.label}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex-1 relative min-h-0">
                {/* 48工位，刚好 8列 6行 */}
                <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-2">
                  {activeBoard.stations.map(station => {
                    const getStationStyle = (count: number, currentAlarm: AlarmType) => {
                      const isAlarming = currentAlarm !== 'NONE';
                      
                      if (count === 0) {
                        return cn(
                          "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-600 hover:bg-slate-900/60 pb-2.5",
                          isAlarming && "animate-pulse border-amber-500/70 shadow-lg shadow-amber-500/10"
                        );
                      }
                      if (count === 1) {
                        return cn(
                          "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-sm pb-2.5",
                          isAlarming && "animate-pulse border-amber-500 shadow shadow-amber-500/10"
                        );
                      }
                      if (count === 2) {
                        return cn(
                          "bg-orange-500/15 border-orange-500/40 text-orange-400 shadow-sm pb-2.5",
                          isAlarming && "animate-pulse border-orange-500 shadow shadow-orange-500/10"
                        );
                      }
                      return cn(
                        "bg-red-500/20 border-red-500/50 text-red-400 shadow-sm pb-2.5",
                        isAlarming && "animate-pulse border-red-500 shadow shadow-red-500/20"
                      );
                    };

                    return (
                      <div 
                        key={station.id}
                        onClick={() => handleStationClick(station.id)}
                        className={cn(
                          "relative flex flex-col items-center justify-center rounded-xl border text-xs font-bold font-mono select-none transition-all active:scale-95 cursor-pointer",
                          getStationStyle(station.alarmCount, station.currentAlarm)
                        )}
                        title={`点击工位 ${station.id} 发起手动注入测试 (仅调试模式)`}
                      >
                        {station.alarmCount === 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-1.5 right-1.5 animate-pulse" />
                        )}

                        <span>{station.id.toString().padStart(2, '0')}</span>

                        {station.alarmCount > 0 && (
                          <span className={cn(
                            "text-[10px] px-1 py-0.2 rounded font-bold font-mono mt-0.5 shadow-sm scale-95",
                            station.alarmCount >= 3 ? "bg-red-500/20 text-red-300" :
                            station.alarmCount === 2 ? "bg-orange-500/20 text-orange-300" :
                            "bg-amber-500/20 text-amber-300"
                          )}>
                            ⚠️ {station.alarmCount}次
                          </span>
                        )}

                        {/* 高、低限警 / 回路误报 状态泡罩 */}
                        {station.currentAlarm !== 'NONE' && (
                          <span className={cn(
                            "absolute bottom-0.5 text-slate-100 text-[9px] leading-none py-0.5 px-1 rounded animate-pulse scale-90 tracking-tighter font-extrabold",
                            !activeBoard.product.alarmTypes.includes('HIGH')
                              ? "bg-amber-600"
                              : station.currentAlarm === 'HIGH'
                                ? "bg-red-600"
                                : "bg-blue-600"
                          )}>
                            {!activeBoard.product.alarmTypes.includes('HIGH')
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

            {/* 4. 异常工位历史追溯：高度压缩，叹号图标改为工号，布局压窄 */}
            <div className="h-20 bg-slate-900/40 border border-slate-800 p-2 rounded-2xl flex flex-col min-h-0 overflow-hidden relative">
              <div className="flex justify-between items-center mb-0.5 shrink-0">
                <h2 className="text-[11px] font-extrabold text-slate-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <History size={12} className="text-red-500 animate-pulse" />
                  <span>异常工位追溯历史 (实时)</span>
                </h2>
              </div>
              
              <div className="flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-x-auto overflow-y-hidden flex gap-2 pr-3 pb-0.5 custom-scrollbar items-center">
                  <AnimatePresence mode="popLayout">
                    {activeBoard.failHistory.length === 0 ? (
                      <div className="w-full flex justify-center items-center text-slate-500 text-[11px] py-1 select-none">
                        暂无异常高低报警触发痕迹
                      </div>
                    ) : (
                      activeBoard.failHistory.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -20, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          transition={{ type: "spring", stiffness: 350, damping: 26 }}
                          className="flex items-center shrink-0 min-w-[110px] max-w-[130px] h-12 bg-slate-950/80 border border-red-950/40 hover:border-red-500/20 rounded-lg px-2 py-1 relative transition-all duration-300 shadow gap-1.5"
                        >
                          <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-red-500 rounded-l-lg" />
                          
                          {/* 叹号改写为醒目的工位号大Badge，高度压缩 */}
                          <div className="w-7 h-7 bg-red-500/10 border border-red-500/20 rounded flex items-center justify-center shrink-0">
                            <span className="text-red-400 font-black text-xs font-mono">{item.stationId.toString().padStart(2, '0')}</span>
                          </div>
                          
                          <div className="flex flex-col flex-1 min-w-0 leading-tight">
                            <div className="text-[8px] font-mono text-slate-500 font-bold mb-0.5">{item.timestamp}</div>
                            <div className="text-slate-200 text-xs font-semibold truncate leading-none">
                              {item.defectReason}
                            </div>
                          </div>

                          {index < activeBoard.failHistory.length - 1 && (
                            <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[1px] border-dashed border-t border-red-500/20 pointer-events-none" />
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
          <div className="lg:col-span-3 flex flex-col gap-4 min-h-0 overflow-hidden">
            
            {/* 良率趋势图 */}
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl h-[28%] shrink-0 overflow-hidden">
              <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                <span>半小时良率走势 📈</span>
              </h3>
              <div className="h-full pb-7">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activeBoard.hourlyData.map((d, index, arr) => {
                    const totalPoints = arr.length;
                    let showLabel = false;
                    if (totalPoints <= 5) {
                      showLabel = true;
                    } else {
                      const step = (totalPoints - 1) / 4;
                      const targetIndices = [
                        0,
                        Math.round(step),
                        Math.round(step * 2),
                        Math.round(step * 3),
                        totalPoints - 1
                      ];
                      showLabel = targetIndices.includes(index);
                    }
                    return {
                      ...d,
                      displayName: showLabel ? `${d.yield}%` : ''
                    };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', fontSize: '10px' }} />
                    <Line type="monotone" dataKey="yield" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }}>
                      <LabelList dataKey="displayName" position="top" fill="#10b981" fontSize={8} fontWeight="bold" offset={4} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TAB栏目 (日志/沙盒) */}
            <div className="flex-1 bg-slate-950/80 border border-slate-800/80 rounded-2xl flex flex-col min-h-0 relative overflow-hidden">
              {/* Tab Headers */}
              <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-2.5 shrink-0 bg-slate-900/40">
                <div className="flex gap-4">
                  <button
                    onClick={() => setActiveTab('LOG')}
                    className={cn(
                      "text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer pb-1.5 border-b-2",
                      activeTab === 'LOG'
                        ? "text-blue-400 border-blue-500"
                        : "text-slate-500 border-transparent hover:text-slate-300"
                    )}
                  >
                    <Terminal size={12} />
                    通讯协议日志
                  </button>
                  <button
                    onClick={() => setActiveTab('WS_SANDBOX')}
                    className={cn(
                      "text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer pb-1.5 border-b-2",
                      activeTab === 'WS_SANDBOX'
                        ? "text-amber-400 border-amber-500"
                        : "text-slate-500 border-transparent hover:text-slate-300"
                    )}
                  >
                    <Cpu size={12} />
                    WS 帧调试沙盒
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full animate-pulse",
                    activeBoard.isLive ? "bg-emerald-500" : "bg-red-500"
                  )} />
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    {activeBoard.isLive ? 'COM Open' : 'Suspend'}
                  </span>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 p-3.5 min-h-0 flex flex-col overflow-hidden">
                {activeTab === 'LOG' ? (
                  <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                      {activeBoard.logs.map(log => (
                        <div key={log.id} className="text-sm font-mono border-l border-slate-800 pl-2 py-1 flex items-start gap-2">
                          <span className="text-slate-500 shrink-0 select-none text-xs">{log.timestamp}</span>
                          <span className={cn(
                            "shrink-0 font-black text-[10px] px-1.5 py-0.2 rounded uppercase",
                            log.type === 'success' ? "bg-emerald-500/10 text-emerald-500" :
                            log.type === 'error' ? "bg-red-500/10 text-red-500" :
                            log.type === 'warning' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-400"
                          )}>
                            {log.type === 'success' ? '自愈' : log.type === 'error' ? '误报' : log.type === 'warning' ? '误报' : '状态'}
                          </span>
                          {/* 3. 日志 文本大一点 支持扫码易读 */}
                          <span className="text-slate-200 break-all leading-snug font-sans text-[13px] tracking-wide font-medium">{log.message}</span>
                        </div>
                      ))}
                      {activeBoard.logs.length === 0 && (
                        <div className="text-slate-500 text-xs text-center py-8">
                          等待物理网关通讯日志流入...
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col h-full overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                    <div className="bg-slate-900/60 border border-slate-800/60 p-2 rounded-lg text-[10px]">
                      <div className="font-bold text-amber-500 mb-0.5">WS 下位机标准通信报文类型规定：</div>
                      <div className="text-slate-400 space-y-0.5 leading-relaxed font-mono text-[9px]">
                        <p>• <span className="text-red-400">ALARM</span>: {"{ stationId, alarmType: 'HIGH'|'LOW', defectReason, batch }"}</p>
                        <p>• <span className="text-blue-400">CLEAR</span>: {"{ stationId }"}</p>
                      </div>
                    </div>

                    {/* 自适应注入按钮 */}
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">快捷通道动作模拟器</span>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {activeBoard.product.alarmTypes.includes('HIGH') ? (
                          <>
                            <button
                              onClick={() => {
                                const randId = Math.floor(Math.random() * 48) + 1;
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
                              className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                            >
                              🔴 注入高报警
                              <span className="text-[9px] bg-red-500/10 text-red-400 px-1 py-0.2 rounded font-mono">HIGH</span>
                            </button>

                            <button
                              onClick={() => {
                                const randId = Math.floor(Math.random() * 48) + 1;
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
                              className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                            >
                              🔵 注入低报警
                              <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1 py-0.2 rounded font-mono">LOW</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              const randId = Math.floor(Math.random() * 48) + 1;
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
                            className="col-span-2 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded-lg text-[10px] transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                          >
                            ⚠️ 触发在测通道回路“误报”突变
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono">ALARM</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const alarming = activeBoard.stations.filter(s => s.currentAlarm !== 'NONE');
                            if (alarming.length === 0) {
                              addLogToBoard(activeBoardId, 'info', '物理箱无高低限误警工位，无需发射 WS CLEAR 校验帧');
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
                          className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                        >
                          🟢 心跳强制清除自愈
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 py-0.2 rounded font-mono">CLEAR</span>
                        </button>

                        <button
                          onClick={() => {
                            const deviations = activeBoard.hourlyData.map(h => {
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
                          className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-lg text-[10px] text-left transition-all active:scale-95 cursor-pointer flex items-center justify-between"
                        >
                          📈 良率瞬时曲线波动
                          <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-mono">UPDATE</span>
                        </button>
                      </div>
                    </div>

                    {/* 自定义指令输入 */}
                    <div className="flex flex-col flex-1 min-h-0">
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">下发 RAW 自定义总线帧 (JSON格式)</span>
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
                            addLogToBoard(activeBoardId, 'error', `【下发 WS 数据帧失败】JSON协议未对齐: ${err.message}`);
                          }
                        }}
                        className="w-full py-1.5 mt-1 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold rounded-lg text-[10px] transition-all cursor-pointer text-center select-none"
                      >
                        🚀 模拟向当前板卡广播该 RAW 协议帧
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* 模态管理器渲染 */}
      {renderManageModal()}
      {renderStationDetailModal()}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30, 41, 59, 0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
}
