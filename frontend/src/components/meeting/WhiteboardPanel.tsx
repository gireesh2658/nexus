import React, { useEffect, useRef, useState } from 'react';
import { Pen, Eraser, Trash2 } from 'lucide-react';
import { socketService } from '../../services/socket';
import { useParams } from 'react-router-dom';

const WhiteboardPanel: React.FC = () => {
  const { id: meetingId } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#7C3AED');
  const [lineWidth, setLineWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match container
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        // Save current drawing
        const data = canvas.toDataURL();
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        // Restore drawing
        const img = new Image();
        img.src = data;
        img.onload = () => ctx.drawImage(img, 0, 0);
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const socket = socketService.getSocket();
    if (!socket) return;

    const handleDrawLine = (data: { x0: number; y0: number; x1: number; y1: number; color: string; lineWidth: number }) => {
      ctx.beginPath();
      ctx.moveTo(data.x0 * canvas.width, data.y0 * canvas.height);
      ctx.lineTo(data.x1 * canvas.width, data.y1 * canvas.height);
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    };

    const handleClear = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    socket.on('draw-line', handleDrawLine);
    socket.on('draw-clear', handleClear);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      socket.off('draw-line', handleDrawLine);
      socket.off('draw-clear', handleClear);
    };
  }, []);

  const currentPos = useRef({ x: 0, y: 0 });

  const drawLine = (x0: number, y0: number, x1: number, y1: number, emit: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawColor = isEraser ? '#000000' : color;
    const drawWidth = isEraser ? lineWidth * 3 : lineWidth;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawWidth;
    ctx.lineCap = 'round';
    
    // Eraser hack: use destination-out for transparency if we wanted a truly transparent board
    // but since we render it over a solid dark background, drawing with #000000 or the bg color works too.
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.stroke();

    if (!emit) return;
    const w = canvas.width;
    const h = canvas.height;

    const socket = socketService.getSocket();
    socket?.emit('draw-line', {
      meetingId,
      x0: x0 / w,
      y0: y0 / h,
      x1: x1 / w,
      y1: y1 / h,
      color: drawColor,
      lineWidth: drawWidth
    });
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top
    };
  };

  const onMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getCoordinates(e);
    currentPos.current = pos;
  };

  const onMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  const onMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getCoordinates(e);
    drawLine(currentPos.current.x, currentPos.current.y, pos.x, pos.y, true);
    currentPos.current = pos;
  };

  const handleClearBoard = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      const socket = socketService.getSocket();
      socket?.emit('draw-clear', { meetingId });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-nexus-bg/90 backdrop-blur-3xl border-l border-white/5 relative">
      <div className="p-3 border-b border-white/5 bg-white/5 flex flex-wrap items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-sm">Whiteboard</h2>
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
            <button 
              onClick={() => setIsEraser(false)} 
              className={`p-1.5 rounded-md transition-colors ${!isEraser ? 'bg-nexus-primary text-white' : 'text-nexus-muted hover:text-white'}`}
            >
              <Pen className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsEraser(true)} 
              className={`p-1.5 rounded-md transition-colors ${isEraser ? 'bg-nexus-primary text-white' : 'text-nexus-muted hover:text-white'}`}
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {!isEraser && (
            <input 
              type="color" 
              value={color} 
              onChange={(e) => setColor(e.target.value)} 
              className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
            />
          )}
          <input 
            type="range" 
            min="1" max="20" 
            value={lineWidth} 
            onChange={(e) => setLineWidth(parseInt(e.target.value))} 
            className="w-20 accent-nexus-primary"
          />
          <div className="w-px h-5 bg-white/10" />
          <button onClick={handleClearBoard} className="p-1.5 text-nexus-danger hover:bg-nexus-danger/20 rounded-md transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 w-full h-full relative cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseOut={onMouseUp}
          onMouseMove={onMouseMove}
          onTouchStart={onMouseDown}
          onTouchEnd={onMouseUp}
          onTouchCancel={onMouseUp}
          onTouchMove={onMouseMove}
          className="w-full h-full touch-none"
        />
      </div>
    </div>
  );
};

export default WhiteboardPanel;
