import React, { useRef, useState, useEffect } from 'react';
import { Trash2, ShieldAlert, Check, X, RefreshCw } from 'lucide-react';

const PrivacyMaskCanvas = ({ snapshotUrl, initialZones = [], onSave, onCancel }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zones, setZones] = useState(initialZones);
  const [activePoints, setActivePoints] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

  // Resize canvas to match the image dimensions inside the container
  useEffect(() => {
    const img = new Image();
    img.src = snapshotUrl || 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=640&q=80';
    img.onload = () => {
      // Keep aspect ratio
      const containerWidth = containerRef.current?.offsetWidth || 640;
      const scale = containerWidth / img.width;
      const targetWidth = containerWidth;
      const targetHeight = img.height * scale;

      setDimensions({ width: targetWidth, height: targetHeight });
      imgRef.current = img;
      setImageLoaded(true);
    };
  }, [snapshotUrl]);

  // Redraw canvas loop
  useEffect(() => {
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw snapshot image background
    ctx.drawImage(imgRef.current, 0, 0, dimensions.width, dimensions.height);

    // 2. Draw existing completed zones
    zones.forEach((zone, index) => {
      if (zone.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(zone.points[0].x * dimensions.width, zone.points[0].y * dimensions.height);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i].x * dimensions.width, zone.points[i].y * dimensions.height);
      }
      ctx.closePath();

      // Semi-transparent red overlay for privacy blocks
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label zone
      const centroid = getCentroid(zone.points, dimensions.width, dimensions.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Inter, system-ui';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(`ZONE ${index + 1}`, centroid.x - 20, centroid.y + 4);
      ctx.shadowBlur = 0; // Reset
    });

    // 3. Draw active drawing points & lines
    if (activePoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(activePoints[0].x * dimensions.width, activePoints[0].y * dimensions.height);
      for (let i = 1; i < activePoints.length; i++) {
        ctx.lineTo(activePoints[i].x * dimensions.width, activePoints[i].y * dimensions.height);
      }
      
      ctx.strokeStyle = '#f59e0b'; // Amber warning line
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw dot handles on vertices
      activePoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x * dimensions.width, pt.y * dimensions.height, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [zones, activePoints, dimensions, imageLoaded]);

  // Helper to find center of polygon for text positioning
  const getCentroid = (points, w, h) => {
    let x = 0, y = 0;
    points.forEach((pt) => {
      x += pt.x * w;
      y += pt.y * h;
    });
    return { x: x / points.length, y: y / points.length };
  };

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / dimensions.width;
    const y = (e.clientY - rect.top) / dimensions.height;
    
    // Add point to current drawing list (normalized between 0 and 1)
    setActivePoints([...activePoints, { x, y }]);
  };

  const completeActiveZone = () => {
    if (activePoints.length < 3) {
      alert('A privacy mask polygon must have at least 3 points to enclose an area.');
      return;
    }
    const newZone = { points: activePoints };
    setZones([...zones, newZone]);
    setActivePoints([]);
  };

  const deleteZone = (indexToRemove) => {
    setZones(zones.filter((_, idx) => idx !== indexToRemove));
  };

  const clearActivePoints = () => {
    setActivePoints([]);
  };

  const handleSave = () => {
    onSave(zones);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 bg-[#0F162A]/90 border border-white/5 rounded-2xl shadow-2xl backdrop-blur-md">
      {/* Canvas column */}
      <div className="flex-1">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" /> Draw Restricted Areas
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Click inside the feed snapshot to draw a polygon. Click 3 or more points, then click "Complete Zone" to lock the mask. Area will be blurred on the live feed.
          </p>
        </div>

        <div ref={containerRef} className="relative overflow-hidden rounded-xl bg-black border border-white/10 select-none">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading reference feed...
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onClick={handleCanvasClick}
            className="block cursor-crosshair max-w-full"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="flex gap-2">
            <button
              onClick={completeActiveZone}
              disabled={activePoints.length < 3}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-400 text-gray-950 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Complete Zone ({activePoints.length} pts)
            </button>
            <button
              onClick={clearActivePoints}
              disabled={activePoints.length === 0}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Reset Path
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-gray-950 shadow-glowGreen transition-all flex items-center gap-1"
            >
              Save Mask Layout
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Control panel list column */}
      <div className="w-full lg:w-72 flex flex-col border-t lg:border-t-0 lg:border-l border-white/5 pt-6 lg:pt-0 lg:pl-6">
        <h4 className="font-semibold text-sm text-gray-200 mb-3 flex items-center justify-between">
          <span>Active Privacy Zones</span>
          <span className="bg-white/5 px-2 py-0.5 rounded text-xs text-indigo-400">{zones.length} mask(s)</span>
        </h4>

        {zones.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
            <ShieldAlert className="w-8 h-8 text-gray-500 mb-2" />
            <p className="text-xs text-gray-400">No privacy zones active. The entire feed is visible.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px]">
            {zones.map((zone, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white">Zone Mask #{idx + 1}</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">{zone.points.length} coordinates</span>
                </div>
                <button
                  onClick={() => deleteZone(idx)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-all"
                  title="Delete Zone"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivacyMaskCanvas;
