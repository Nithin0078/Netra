import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import PrivacyMaskCanvas from '../../components/PrivacyMaskCanvas';
import {
  Video, Eye, Plus, ShieldAlert, ShieldCheck, Trash2, Key,
  X, Compass, MapPin, ExternalLink, RefreshCw, AlertTriangle
} from 'lucide-react';

const CitizenDashboard = () => {
  const { user, token, logout, setupMfa, confirmMfa } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals / Editors state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null); // Camera being masked
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [activePreviewId, setActivePreviewId] = useState(null); // Camera ID for streaming preview

  // Add camera fields
  const [camName, setCamName] = useState('');
  const [camUrl, setCamUrl] = useState('demo_rtsp_stream_01'); // Preset mock URL
  const [camLat, setCamLat] = useState('37.7749');
  const [camLng, setCamLng] = useState('-122.4194');
  const [camAddress, setCamAddress] = useState('123 Mission St, San Francisco, CA');

  // MFA fields
  const [mfaData, setMfaData] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState(false);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/citizen/cameras');
      setCameras(res.data);
      if (res.data.length > 0 && !activePreviewId) {
        setActivePreviewId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load camera devices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const handleAddCamera = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: camName,
        stream_url: camUrl,
        location: {
          latitude: parseFloat(camLat),
          longitude: parseFloat(camLng),
          address: camAddress
        },
        consent_shared: false
      };
      
      const res = await axios.post('/api/citizen/cameras', payload);
      setCameras([...cameras, res.data]);
      setActivePreviewId(res.data.id);
      
      // Reset fields
      setCamName('');
      setCamUrl('demo_rtsp_stream_01');
      setShowAddModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add camera feed');
    }
  };

  const handleDeleteCamera = async (id) => {
    if (!window.confirm('Are you sure you want to remove this camera? All privacy zone coordinates will be permanently deleted.')) return;
    try {
      await axios.delete(`/api/citizen/cameras/${id}`);
      setCameras(cameras.filter(cam => cam.id !== id));
      if (activePreviewId === id) {
        setActivePreviewId(null);
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete camera device');
    }
  };

  const handleSavePrivacyZones = async (updatedZones) => {
    try {
      const res = await axios.put(`/api/citizen/cameras/${editingCamera.id}`, {
        privacy_zones: updatedZones
      });
      
      // Update camera array
      setCameras(cameras.map(cam => cam.id === editingCamera.id ? res.data : cam));
      setEditingCamera(null);
      // Reload active stream image component trigger
      const currentActive = activePreviewId;
      setActivePreviewId(null);
      setTimeout(() => setActivePreviewId(currentActive), 100);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update privacy polygons');
    }
  };

  const handleMfaSetup = async () => {
    try {
      const data = await setupMfa();
      setMfaData(data);
      setMfaError('');
      setMfaSuccess(false);
      setShowMfaModal(true);
    } catch (err) {
      alert(err || 'Failed to configure MFA settings');
    }
  };

  const handleMfaConfirm = async (e) => {
    e.preventDefault();
    try {
      await confirmMfa(mfaCode);
      setMfaSuccess(true);
      setMfaError('');
      setTimeout(() => {
        setShowMfaModal(false);
        setMfaData(null);
        setMfaCode('');
      }, 2000);
    } catch (err) {
      setMfaError(err);
    }
  };

  const activeCamera = cameras.find(c => c.id === activePreviewId);
  const streamUrl = activeCamera
    ? `${axios.defaults.baseURL}/api/stream/${activeCamera.id}?token=${token}&yolo=false&t=${Date.now()}`
    : null;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Citizen Surveillance Node Manager</h1>
          <p className="text-sm text-gray-400 mt-0.5">Welcome back, @{user?.username}. Protect your home and manage community access.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-xl shadow-glowIndigo text-sm transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Pair New Node
        </button>
      </div>

      {/* MFA Setup Banner */}
      {!user?.mfa_enabled && (
        <div className="glass-panel border-amber-500/20 bg-amber-500/[0.02] p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Secure Account Multi-Factor Authentication</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Enable time-based TOTP MFA code locks to block unauthorized access to surveillance profiles.
              </p>
            </div>
          </div>
          <button
            onClick={handleMfaSetup}
            className="px-4 py-2 bg-amber-500 text-gray-950 font-bold rounded-lg text-xs hover:bg-amber-600 transition-colors flex items-center gap-1 w-full md:w-auto justify-center"
          >
            <Key className="w-3.5 h-3.5" /> Bind MFA Device
          </button>
        </div>
      )}

      {/* Main dashboard content layout */}
      {editingCamera ? (
        <div className="glass-panel p-6 rounded-2xl shadow-2xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">Adjust Privacy Zones: {editingCamera.name}</h2>
            <button onClick={() => setEditingCamera(null)} className="p-1 rounded bg-white/5 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <PrivacyMaskCanvas
            snapshotUrl={null} // Falls back to local preset images internally
            initialZones={editingCamera.privacy_zones || []}
            onSave={handleSavePrivacyZones}
            onCancel={() => setEditingCamera(null)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Active Preview Column */}
          <div className="lg:col-span-8 space-y-6">
            <div className="glass-panel rounded-2xl overflow-hidden shadow-glassCard border border-white/5 flex flex-col bg-black/40">
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0E1527]">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-white">
                    {activeCamera ? `CCTV Live Feed: ${activeCamera.name}` : 'No Active Feed'}
                  </span>
                </div>
                {activeCamera && (
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${activeCamera.consent_shared ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-xs text-gray-400">{activeCamera.consent_shared ? 'Sharing Enabled' : 'Access Restricted'}</span>
                  </div>
                )}
              </div>

              {/* Feed screen */}
              <div className="relative aspect-video bg-black flex items-center justify-center">
                {activeCamera && streamUrl ? (
                  <img
                    src={streamUrl}
                    alt="CCTV stream"
                    className="w-full h-full object-cover select-none"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=640&q=80';
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                    <Eye className="w-12 h-12 mb-3 text-gray-600" />
                    <p className="text-sm">Select a paired camera feed from the sidebar to inspect the node.</p>
                  </div>
                )}
              </div>

              {/* Actions bar */}
              {activeCamera && (
                <div className="p-4 bg-[#0E1527] border-t border-white/5 flex flex-wrap gap-3 items-center justify-between">
                  <div className="text-xs text-gray-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" /> {activeCamera.location.address || 'Address undefined'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingCamera(activeCamera)}
                      className="px-4 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white font-semibold rounded-lg text-xs transition-all border border-indigo-500/20"
                    >
                      Draw Privacy Masks ({activeCamera.privacy_zones?.length || 0})
                    </button>
                    <button
                      onClick={() => handleDeleteCamera(activeCamera.id)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-all"
                      title="Decommission camera"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CCTV sidebar node list */}
          <div className="lg:col-span-4 space-y-4">
            <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider pl-1">Surveillance Nodes</h2>
            
            {loading && cameras.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" /> Syncing feeds...
              </div>
            ) : cameras.length === 0 ? (
              <div className="glass-panel p-6 text-center border border-dashed border-white/10 rounded-2xl text-xs text-gray-400">
                You have not paired any cameras yet. Connect a node to secure your perimeter.
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {cameras.map((cam) => {
                  const isActive = cam.id === activePreviewId;
                  return (
                    <div
                      key={cam.id}
                      onClick={() => setActivePreviewId(cam.id)}
                      className={`glass-panel p-3.5 rounded-xl border cursor-pointer hover:bg-white/[0.04] transition-all flex items-center justify-between ${
                        isActive ? 'bg-indigo-500/5 border-indigo-500/40 shadow-glowIndigo' : 'bg-transparent border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-500/10 text-indigo-400' : 'bg-white/5 text-gray-400'}`}>
                          <Video className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-white">{cam.name}</span>
                          <span className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[150px]">{cam.location.address || 'San Francisco'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {cam.consent_shared ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-400" title="Sharing active" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-gray-500" title="Sharing disabled" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pair Node Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAddCamera} className="glass-panel-heavy w-full max-w-md p-6 rounded-2xl shadow-2xl border border-white/10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h3 className="text-base font-bold text-white">Pair CCTV Camera Node</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Camera Name</label>
                <input
                  type="text" required placeholder="e.g. Front Door Lane" value={camName}
                  onChange={(e) => setCamName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-gray-300 font-semibold mb-1">RTSP Stream Address / ID</label>
                <input
                  type="text" required placeholder="e.g. rtsp://192.168.1.100/h264" value={camUrl}
                  onChange={(e) => setCamUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Street Address</label>
                <input
                  type="text" placeholder="123 Mission St, San Francisco" value={camAddress}
                  onChange={(e) => setCamAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Latitude</label>
                  <input
                    type="text" placeholder="37.7749" value={camLat}
                    onChange={(e) => setCamLat(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Longitude</label>
                  <input
                    type="text" placeholder="-122.4194" value={camLng}
                    onChange={(e) => setCamLng(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-3 border-t border-white/5">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white shadow-glowIndigo"
              >
                Configure Node
              </button>
              <button
                type="button" onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-white"
              >
                Discard
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MFA Register Modal */}
      {showMfaModal && mfaData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleMfaConfirm} className="glass-panel-heavy w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-white/10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <Key className="w-5 h-5 text-amber-500" /> Bind Google Authenticator
              </h3>
              <button type="button" onClick={() => setShowMfaModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {mfaSuccess ? (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-6 h-6 animate-pulse" />
                </div>
                <h4 className="text-sm font-semibold text-white">MFA Enrollment Verified</h4>
                <p className="text-xs text-gray-400">TOTP device binding finalized.</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-gray-400 leading-relaxed text-[11px]">
                  Scan the QR code below using Google Authenticator or Microsoft Authenticator, then enter the generated 6-digit verification token.
                </p>

                <div className="flex justify-center p-3 rounded-xl bg-white bg-opacity-95 max-w-[160px] mx-auto border border-white/15">
                  <img src={mfaData.qr_code_data_uri} alt="MFA QR Code" className="w-full h-auto block" />
                </div>

                <div className="text-center font-mono select-all text-xs bg-white/5 p-2 rounded text-indigo-300">
                  Code: {mfaData.secret}
                </div>

                {mfaError && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                    {mfaError}
                  </div>
                )}

                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Enter Verification Code</label>
                  <input
                    type="text" required placeholder="E.g., 552103" value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    maxLength={6}
                    className="w-full text-center tracking-widest font-mono text-sm px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-3 border-t border-white/5">
                  <button
                    type="submit"
                    className="w-full py-2.5 font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-gray-950"
                  >
                    Complete Binding
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default CitizenDashboard;
