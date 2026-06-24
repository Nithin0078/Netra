import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, ShieldAlert, Lock, Unlock, Eye, History, AlertTriangle } from 'lucide-react';

const ConsentCenter = () => {
  const [cameras, setCameras] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const camerasRes = await axios.get('/api/citizen/cameras');
      setCameras(camerasRes.data);

      const logsRes = await axios.get('/api/citizen/audit-logs');
      setAuditLogs(logsRes.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch consent data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleConsent = async (cameraId, currentStatus) => {
    try {
      await axios.post(`/api/citizen/cameras/${cameraId}/consent?consent=${!currentStatus}`);
      // Refresh local camera state and log trails
      setCameras(cameras.map(cam => 
        cam.id === cameraId ? { ...cam, consent_shared: !currentStatus } : cam
      ));
      
      // Fetch updated logs to reflect the consent change log entry
      const logsRes = await axios.get('/api/citizen/audit-logs');
      setAuditLogs(logsRes.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to modify sharing authorization');
    }
  };

  const sharedCount = cameras.filter(c => c.consent_shared).length;

  if (loading && cameras.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3"></div>
        Syncing consent ledger...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Citizen Consent Control Center</h1>
        <p className="text-sm text-gray-400 mt-1">
          Explicitly grant or revoke real-time police stream authorization. Unsharing immediately severes active officer views.
        </p>
      </div>

      {/* Stats summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between shadow-glassCard">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wider block">Total Owned Feeds</span>
            <span className="text-2xl font-bold text-white mt-1 block">{cameras.length}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
            <Eye className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between shadow-glassCard">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wider block">Shared with Law Enforcement</span>
            <span className="text-2xl font-bold text-emerald-400 mt-1 block">{sharedCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between shadow-glassCard">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wider block">Protected / Private</span>
            <span className="text-2xl font-bold text-amber-500 mt-1 block">{cameras.length - sharedCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex gap-4 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 items-start">
        <AlertTriangle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-gray-300 leading-relaxed">
          <span className="font-semibold text-white">How Netra sharing works:</span> Officers can only request connections to cameras flagged with <span className="text-emerald-400 font-semibold">Consent Shared</span>. To stream your camera, they are legally required to file an active investigation case number and supply a written justification. This access is recorded below.
        </div>
      </div>

      {/* Table grid of cameras with consent toggle switches */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-glassCard border border-white/5">
        <div className="p-5 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">Camera Access Matrix</h2>
        </div>

        {cameras.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No registered cameras. Visit the dashboard to pair your first CCTV node.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-white/[0.02] text-gray-400 border-b border-white/5">
                  <th className="p-4 font-medium">Camera Node Name</th>
                  <th className="p-4 font-medium">Physical Location</th>
                  <th className="p-4 font-medium">Privacy Masks</th>
                  <th className="p-4 font-medium">Authorization Status</th>
                  <th className="p-4 font-medium text-right">Consent Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cameras.map((camera) => (
                  <tr key={camera.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 font-semibold text-white">{camera.name}</td>
                    <td className="p-4 text-xs text-gray-300">
                      {camera.location.address || `Lat: ${camera.location.latitude}, Lng: ${camera.location.longitude}`}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/5 text-gray-400">
                        {camera.privacy_zones?.length || 0} Zone(s) Masked
                      </span>
                    </td>
                    <td className="p-4">
                      {camera.consent_shared ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 animate-pulse">
                          <Unlock className="w-3 h-3" /> Shared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/10">
                          <Lock className="w-3 h-3" /> Private
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleToggleConsent(camera.id, camera.consent_shared)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          camera.consent_shared
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20'
                            : 'bg-emerald-500 text-gray-950 hover:bg-emerald-600 shadow-glowGreen'
                        }`}
                      >
                        {camera.consent_shared ? 'Revoke Access' : 'Share Feed'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Police query logs for auditing */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-glassCard border border-white/5">
        <div className="p-5 border-b border-white/5 flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Access & Audit History Log</h2>
        </div>

        {auditLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No query logs registered yet. Your feeds have not been accessed by law enforcement.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-white/[0.02] text-gray-400 border-b border-white/5">
                  <th className="p-4 font-medium">Timestamp</th>
                  <th className="p-4 font-medium">Officer / Actor</th>
                  <th className="p-4 font-medium">Activity</th>
                  <th className="p-4 font-medium">Case Reference</th>
                  <th className="p-4 font-medium">Investigation Purpose / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 text-xs text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">@{log.actor_username}</span>
                        <span className="text-[10px] text-gray-400 capitalize">{log.actor_role}</span>
                      </div>
                    </td>
                    <td className="p-4 text-xs text-gray-300">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.action.includes('REVOKE') ? 'bg-red-500/10 text-red-400' :
                        log.action.includes('GRANT') ? 'bg-emerald-500/10 text-emerald-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-indigo-400">
                      {log.details?.case_number || 'N/A'}
                    </td>
                    <td className="p-4 text-xs text-gray-400 max-w-xs truncate" title={log.details?.reason || ''}>
                      {log.details?.reason || log.details?.camera_name || 'System event'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsentCenter;
