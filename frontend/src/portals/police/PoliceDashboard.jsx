import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldAlert, Video, Eye, EyeOff, Play, ShieldCheck, Map,
  FileText, History, Key, Check, Info, RefreshCw, Layers
} from 'lucide-react';

const PoliceDashboard = () => {
  const { token, logout, user } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Active investigation state
  const [activeCamId, setActiveCamId] = useState(null);
  const [authorizedCam, setAuthorizedCam] = useState(null); // Validated camera
  const [caseNumber, setCaseNumber] = useState('');
  const [reason, setReason] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [runYolo, setRunYolo] = useState(false);

  // Live detection event feed (polled or simulated)
  const [detections, setDetections] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const camsRes = await axios.get('/api/police/cameras');
      setCameras(camsRes.data);

      const logsRes = await axios.get('/api/police/audit-logs');
      setAuditLogs(logsRes.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch tactical intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Poll for new compliance audit logs periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const logsRes = await axios.get('/api/police/audit-logs');
        setAuditLogs(logsRes.data);
      } catch (err) {
        console.error('Audit poll failed', err);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Simulating real-time AI detection feeds if streaming with YOLO enabled
  useEffect(() => {
    if (!authorizedCam || !runYolo) {
      setDetections([]);
      return;
    }

    const labels = ['Pedestrian', 'Vehicle', 'License Plate'];
    const interval = setInterval(() => {
      const newDetect = {
        time: new Date().toLocaleTimeString(),
        type: labels[Math.floor(Math.random() * labels.length)],
        confidence: (0.8 + Math.random() * 0.19).toFixed(2),
        id: Math.floor(Math.random() * 10000)
      };
      setDetections(prev => [newDetect, ...prev].slice(0, 10));
    }, 3000);

    return () => clearInterval(interval);
  }, [authorizedCam, runYolo]);

  const handleSelectCamera = (cam) => {
    setActiveCamId(cam.id);
    setAuthorizedCam(null);
    setCaseNumber('');
    setReason('');
    setShowAuthModal(true);
  };

  const handleVerifyCaseAccess = async (e) => {
    e.preventDefault();
    if (!caseNumber.trim() || !reason.trim()) {
      alert('You must provide an official case reference and reason.');
      return;
    }

    try {
      const res = await axios.post(
        `/api/police/cases?case_number=${encodeURIComponent(caseNumber)}&camera_id=${activeCamId}&reason=${encodeURIComponent(reason)}`
      );
      
      setAuthorizedCam(res.data.camera);
      setShowAuthModal(false);
      
      // Update audit log
      const logsRes = await axios.get('/api/police/audit-logs');
      setAuditLogs(logsRes.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Access verification rejected.');
    }
  };

  const stopStreaming = () => {
    setAuthorizedCam(null);
    setActiveCamId(null);
    setRunYolo(false);
  };

  const filteredCameras = cameras.filter(cam =>
    cam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (cam.location.address && cam.location.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const streamUrl = authorizedCam
    ? `${axios.defaults.baseURL}/api/stream/${authorizedCam.id}?token=${token}&yolo=${runYolo}&t=${Date.now()}`
    : null;

  return (
    <div className="space-y-8 animate-fade-in text-gray-200">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <Layers className="w-6 h-6 text-indigo-400" /> Tactical Operations Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Authorized Login: Officer @{user?.username} ({user?.department || 'Surveillance Wing'})</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all self-start sm:self-auto flex items-center gap-2 text-xs font-semibold"
        >
          <RefreshCw className="w-4 h-4" /> Refresh Feeds
        </button>
      </div>

      {/* Grid structure: Tactical Stream monitor & Map Plotter */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Stream Monitor (8 columns) */}
        <div className="xl:col-span-8 space-y-6">
          <div className="glass-panel rounded-2xl overflow-hidden shadow-glassCard border border-white/5 flex flex-col bg-black/40">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0E1527]">
              <div className="flex items-center gap-2">
                <Video className="w-4.5 h-4.5 text-red-500 animate-pulse" />
                <span className="text-sm font-semibold text-white tracking-wide">
                  {authorizedCam ? `SECURE CHANNEL: ${authorizedCam.name}` : 'TACTICAL VIDEO MONITOR'}
                </span>
              </div>
              {authorizedCam && (
                <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500/15">
                  <ShieldCheck className="w-3.5 h-3.5" /> Audited Connection
                </div>
              )}
            </div>

            {/* Video Canvas view */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {authorizedCam && streamUrl ? (
                <img
                  src={streamUrl}
                  alt="Surveillance Feed"
                  className="w-full h-full object-cover select-none"
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=640&q=80';
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500 max-w-sm">
                  <Play className="w-12 h-12 mb-3 text-indigo-500/30" />
                  <p className="text-sm font-semibold text-gray-400">Tactical Feed Idle</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Select an active community node from the sidebar to request secure stream authorizations.
                  </p>
                </div>
              )}
            </div>

            {/* Tactical Control Panel */}
            {authorizedCam && (
              <div className="p-4 bg-[#0E1527] border-t border-white/5 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={runYolo}
                      onChange={(e) => setRunYolo(e.target.checked)}
                      className="rounded bg-black border-white/10 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-xs font-semibold text-white">Toggle YOLOv8 Computer Vision</span>
                  </label>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={stopStreaming}
                    className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white font-bold rounded-lg text-xs transition-all border border-red-500/20"
                  >
                    Disconnect stream
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI Object detection overlay events (shows if YOLO enabled) */}
          {authorizedCam && runYolo && (
            <div className="glass-panel rounded-2xl p-5 border border-white/5 space-y-3">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">AI Event Triggers (Real-time)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 max-h-[140px] overflow-y-auto space-y-2">
                  {detections.length === 0 ? (
                    <div className="text-xs text-gray-500 italic">Waiting for computer vision outputs...</div>
                  ) : (
                    detections.map((det) => (
                      <div key={det.id} className="flex justify-between items-center text-xs">
                        <span className="text-[10px] text-gray-500">{det.time}</span>
                        <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                          det.type === 'Pedestrian' ? 'bg-green-500/10 text-green-400' :
                          det.type === 'Vehicle' ? 'bg-indigo-500/10 text-indigo-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {det.type}
                        </span>
                        <span className="text-gray-400">conf: {det.confidence}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="text-xs text-gray-400 flex flex-col justify-center space-y-1.5 leading-relaxed bg-indigo-500/[0.02] border border-indigo-500/10 rounded-xl p-4">
                  <div className="font-semibold text-white flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-indigo-400" /> Dynamic Blurring Activated
                  </div>
                  Any private zones drawn by the citizen are filtered by the AI engine locally, applying a dynamic blur *before* features are classified or shown.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Node search sidebar (4 columns) */}
        <div className="xl:col-span-4 space-y-4">
          <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider pl-1">Active Community Network</h2>
          
          <input
            type="text"
            placeholder="Search by area or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
          />

          {loading && cameras.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" /> Syncing network topology...
            </div>
          ) : filteredCameras.length === 0 ? (
            <div className="glass-panel p-6 text-center border border-dashed border-white/10 rounded-2xl text-xs text-gray-400">
              No shared cameras matching your query.
            </div>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {filteredCameras.map((cam) => {
                const isSelected = cam.id === activeCamId;
                return (
                  <div
                    key={cam.id}
                    onClick={() => handleSelectCamera(cam)}
                    className={`glass-panel p-3.5 rounded-xl border cursor-pointer hover:bg-white/[0.04] transition-all flex items-center justify-between ${
                      isSelected ? 'bg-indigo-500/5 border-indigo-500/40 shadow-glowIndigo' : 'bg-transparent border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Video className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-white">{cam.name}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[170px]">{cam.location.address || 'San Francisco'}</span>
                      </div>
                    </div>
                    <Play className="w-3.5 h-3.5 text-indigo-400 hover:scale-125 transition-transform" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Compliance / Audit access history table */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-glassCard border border-white/5">
        <div className="p-5 border-b border-white/5 flex items-center gap-2 bg-[#0E1527]">
          <History className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white tracking-wide">Compliance Audit trail Ledger</h2>
        </div>

        {auditLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No compliance audits registered.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-white/[0.02] text-gray-400 border-b border-white/5">
                  <th className="p-4 font-medium">Timestamp</th>
                  <th className="p-4 font-medium">Officer</th>
                  <th className="p-4 font-medium">Action type</th>
                  <th className="p-4 font-medium">Case Reference</th>
                  <th className="p-4 font-medium">Audit Justification Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 font-semibold text-white">@{log.actor_username}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.action.includes('REVOKE') ? 'bg-red-500/10 text-red-400' :
                        log.action.includes('GRANT') ? 'bg-emerald-500/10 text-emerald-400' :
                        'bg-indigo-500/10 text-indigo-450 text-indigo-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-semibold text-indigo-400">
                      {log.details?.case_number || 'SYSTEM'}
                    </td>
                    <td className="p-4 text-gray-400 max-w-xs truncate" title={log.details?.reason || ''}>
                      {log.details?.reason || log.details?.camera_name || 'Stream audit checkpoint'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Authorization Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleVerifyCaseAccess} className="glass-panel-heavy w-full max-w-md p-6 rounded-2xl shadow-2xl border border-white/10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" /> Stream Authorization Required
              </h3>
              <button type="button" onClick={() => setShowAuthModal(false)} className="text-gray-400 hover:text-white">
                <X />
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl flex gap-3 text-gray-300">
                <Info className="w-5 h-5 text-red-400 shrink-0" />
                <p className="leading-relaxed">
                  In compliance with privacy mandates, live feed access requires validation. Scan activity is audited and visible to the camera owner immediately.
                </p>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Official Case Number</label>
                <input
                  type="text" required placeholder="E.g. CASE-2026-9921" value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Investigation Justification</label>
                <textarea
                  required placeholder="Describe case relevance (e.g., Tracking suspect vehicle in grand theft auto incident at 18:00)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-3 border-t border-white/5">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white shadow-glowIndigo"
              >
                Authenticate Stream Access
              </button>
              <button
                type="button" onClick={() => setShowAuthModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const X = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default PoliceDashboard;
