import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Type,
  PenTool,
  Plus,
  Trash2,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Copy,
  Layers,
  Check,
  X,
  Move,
  Maximize2,
  Eraser,
  Code,
  Upload,
  FilePlus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  Eye,
  Sliders,
  Stamp,
  Smartphone,
  AlertCircle
} from 'lucide-react';

const PDF_LIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const PRESET_STAMPS = [
  { id: 'approved', label: 'อนุมัติแล้ว (APPROVED)', color: '#10b981', border: '#059669', sub: 'APPROVED' },
  { id: 'urgent', label: 'ด่วนที่สุด (URGENT)', color: '#ef4444', border: '#dc2626', sub: 'URGENT' },
  { id: 'certified', label: 'สำเนาถูกต้อง (CERTIFIED)', color: '#3b82f6', border: '#2563eb', sub: 'CERTIFIED COPY' },
  { id: 'paid', label: 'ชำระเงินแล้ว (PAID)', color: '#8b5cf6', border: '#7c3aed', sub: 'PAID IN FULL' }
];

function createStampDataUrl(stamp) {
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.strokeStyle = stamp.border;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(12, 12, canvas.width - 24, canvas.height - 24, 16);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(22, 22, canvas.width - 44, canvas.height - 44, 10);
  ctx.stroke();

  ctx.fillStyle = stamp.color;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stamp.label.split(' ')[0], canvas.width / 2, 68);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(stamp.sub, canvas.width / 2, 112);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

function renderTextOverlayToPng(item) {
  const scale = 3; // High DPI for crisp Retina/iPad export
  const canvas = document.createElement('canvas');
  const width = Math.max(40, item.width);
  const height = Math.max(24, item.height);
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  if (item.bgColor && item.bgColor !== 'transparent') {
    ctx.fillStyle = item.bgColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 4);
    ctx.fill();
  }

  if (item.borderColor && item.borderColor !== 'transparent') {
    ctx.strokeStyle = item.borderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(1, 1, width - 2, height - 2, 4);
    ctx.stroke();
  }

  ctx.fillStyle = item.color || '#0f172a';
  const fontWeight = item.bold ? 'bold' : 'normal';
  const fontSize = item.fontSize || 18;
  ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Sarabun", "Prompt", sans-serif`;
  ctx.textBaseline = 'top';

  const lines = (item.text || '').split('\n');
  const lineHeight = fontSize * 1.3;
  lines.forEach((line, index) => {
    ctx.fillText(line, 8, 6 + index * lineHeight);
  });

  return canvas.toDataURL('image/png');
}

async function imageSourceToBytes(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 400;
      canvas.height = img.naturalHeight || img.height || 300;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const isJpg = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg');
      const mime = isJpg ? 'image/jpeg' : 'image/png';
      const normalizedDataUrl = canvas.toDataURL(mime, 0.95);
      const base64 = normalizedDataUrl.split(',')[1];
      const binaryString = window.atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      resolve({ bytes, isJpg });
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

export default function App() {
  const [libsReady, setLibsReady] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('กำลังเตรียมระบบแก้ไข PDF สำหรับ iPad...');
  const [pdfBytes, setPdfBytes] = useState(null);
  const [fileName, setFileName] = useState('Sample-Document.pdf');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 595, height: 842 });
  const [zoom, setZoom] = useState(1);

  // Overlays stored by page number (1-indexed): { id, page, type: 'image'|'text'|'whiteout'|'signature', x, y, width, height, ... }
  const [overlays, setOverlays] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  // Modals & UI panels
  const [showSignModal, setShowSignModal] = useState(false);
  const [showStampModal, setShowStampModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [toast, setToast] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  // Signature pad state
  const [penColor, setPenColor] = useState('#1d4ed8');
  const [penWidth, setPenWidth] = useState(3.5);
  const signCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  // Refs for PDF rendering & pointer interactions
  const pdfCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const dragStateRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3200);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          if (existing.getAttribute('data-loaded') === 'true') return resolve();
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', reject);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
          script.setAttribute('data-loaded', 'true');
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });

    async function initLibraries() {
      try {
        await Promise.all([loadScript(PDF_LIB_URL), loadScript(PDF_JS_URL)]);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
        }
        if (isMounted) {
          setLibsReady(true);
        }
      } catch (err) {
        console.error('Failed to load PDF libraries:', err);
        if (isMounted) {
          setLoadingMsg('ไม่สามารถโหลดไลบรารี PDF ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
        }
      }
    }

    initLibraries();
    return () => {
      isMounted = false;
    };
  }, []);

  const generateSamplePdf = useCallback(async () => {
    if (!window.PDFLib) return;
    try {
      setLoadingMsg('กำลังสร้างเอกสาร PDF ตัวอย่างด้วย pdf-lib...');
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const pdfDoc = await PDFDocument.create();
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Page 1: Inspection / Purchase Order Form
      const page1 = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page1.getSize();

      // Header Banner
      page1.drawRectangle({
        x: 0,
        y: height - 95,
        width,
        height: 95,
        color: rgb(0.09, 0.15, 0.28)
      });

      page1.drawText('IPAD PDF STUDIO - WORK ORDER & APPROVAL', {
        x: 40,
        y: height - 48,
        size: 18,
        font: fontBold,
        color: rgb(1, 1, 1)
      });

      page1.drawText('Document No: WO-2026-0891   |   Date: 14 Oct 2026   |   Status: Pending Review', {
        x: 40,
        y: height - 72,
        size: 10,
        font: fontRegular,
        color: rgb(0.75, 0.82, 0.95)
      });

      // Info Box
      page1.drawRectangle({
        x: 40,
        y: height - 210,
        width: width - 80,
        height: 90,
        color: rgb(0.96, 0.97, 0.99),
        borderColor: rgb(0.82, 0.86, 0.92),
        borderWidth: 1
      });

      page1.drawText('PROJECT & CLIENT INFORMATION', {
        x: 55,
        y: height - 142,
        size: 11,
        font: fontBold,
        color: rgb(0.15, 0.25, 0.45)
      });

      page1.drawText('Client Name: Siam Smart Innovation Co., Ltd.', {
        x: 55,
        y: height - 165,
        size: 11,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2)
      });

      page1.drawText('Location: Bangkok / Sakon Nakhon Branch Office', {
        x: 55,
        y: height - 185,
        size: 11,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2)
      });

      // Table Header
      const tableTop = height - 250;
      page1.drawRectangle({
        x: 40,
        y: tableTop,
        width: width - 80,
        height: 28,
        color: rgb(0.15, 0.38, 0.85)
      });

      page1.drawText('#', { x: 52, y: tableTop + 9, size: 10, font: fontBold, color: rgb(1, 1, 1) });
      page1.drawText('Description / Item Specification', { x: 85, y: tableTop + 9, size: 10, font: fontBold, color: rgb(1, 1, 1) });
      page1.drawText('Qty', { x: 390, y: tableTop + 9, size: 10, font: fontBold, color: rgb(1, 1, 1) });
      page1.drawText('Amount (THB)', { x: 460, y: tableTop + 9, size: 10, font: fontBold, color: rgb(1, 1, 1) });

      const rows = [
        ['01', 'iPad Pro Field Inspection & Site Survey Package', '1 Set', '24,500.00'],
        ['02', 'Cloud PDF Document Workflow Integration (pdf-lib)', '1 Lic', '18,000.00'],
        ['03', 'On-site Equipment Installation & Calibration', '2 Days', '12,000.00']
      ];

      rows.forEach((r, idx) => {
        const rowY = tableTop - (idx + 1) * 34;
        page1.drawRectangle({
          x: 40,
          y: rowY,
          width: width - 80,
          height: 34,
          color: idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.98, 1),
          borderColor: rgb(0.88, 0.9, 0.94),
          borderWidth: 0.7
        });
        page1.drawText(r[0], { x: 52, y: rowY + 12, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        page1.drawText(r[1], { x: 85, y: rowY + 12, size: 10, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
        page1.drawText(r[2], { x: 390, y: rowY + 12, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        page1.drawText(r[3], { x: 460, y: rowY + 12, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      });

      // Photo Attachment Dropzone Box on PDF
      page1.drawRectangle({
        x: 40,
        y: 230,
        width: width - 80,
        height: 185,
        color: rgb(0.98, 0.99, 1),
        borderColor: rgb(0.65, 0.75, 0.92),
        borderWidth: 1.5
      });

      page1.drawText('SITE PHOTO / IMAGE ATTACHMENT AREA (Embed PNG / JPG Here)', {
        x: 55,
        y: 390,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.35, 0.65)
      });

      page1.drawText('Tap "Add Image (PNG / JPG)" on the top toolbar to insert photos from your iPad.', {
        x: 55,
        y: 368,
        size: 10,
        font: fontRegular,
        color: rgb(0.45, 0.5, 0.6)
      });

      // Signature Boxes at Bottom
      page1.drawRectangle({
        x: 40,
        y: 70,
        width: 240,
        height: 125,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.78, 0.82, 0.88),
        borderWidth: 1
      });
      page1.drawText('INSPECTOR / PREPARED BY:', {
        x: 55,
        y: 172,
        size: 10,
        font: fontBold,
        color: rgb(0.3, 0.35, 0.45)
      });
      page1.drawText('Sign here with Apple Pencil or Finger', {
        x: 55,
        y: 85,
        size: 9,
        font: fontRegular,
        color: rgb(0.6, 0.65, 0.7)
      });

      page1.drawRectangle({
        x: 315,
        y: 70,
        width: 240,
        height: 125,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.78, 0.82, 0.88),
        borderWidth: 1
      });
      page1.drawText('AUTHORIZED APPROVAL STAMP:', {
        x: 330,
        y: 172,
        size: 10,
        font: fontBold,
        color: rgb(0.3, 0.35, 0.45)
      });
      page1.drawText('Place approval stamp or signature here', {
        x: 330,
        y: 85,
        size: 9,
        font: fontRegular,
        color: rgb(0.6, 0.65, 0.7)
      });

      const savedBytes = await pdfDoc.save();
      setPdfBytes(savedBytes);
      setFileName('WorkOrder-Sample.pdf');
      setCurrentPage(1);

      // Add a helpful initial sample text annotation so user immediately sees how interactive overlays work
      const initialOverlay = [
        {
          id: 'sample-note-1',
          page: 1,
          type: 'text',
          x: 60,
          y: 475,
          width: 310,
          height: 58,
          text: 'หมายเหตุ: ตรวจสอบหน้างานเรียบร้อยแล้ว\nสามารถลาก ย่อ/ขยาย หรือแตะเพื่อแก้ไขข้อความนี้ได้ทันที',
          fontSize: 15,
          color: '#1e3a8a',
          bgColor: '#eff6ff',
          borderColor: '#93c5fd',
          bold: true
        }
      ];
      setOverlays(initialOverlay);
      setHistory([initialOverlay]);
      setHistoryIndex(0);
      setSelectedId('sample-note-1');
    } catch (err) {
      console.error('Error generating sample PDF:', err);
    }
  }, []);

  useEffect(() => {
    if (libsReady && !pdfBytes) {
      generateSamplePdf();
    }
  }, [libsReady, pdfBytes, generateSamplePdf]);

  useEffect(() => {
    if (!libsReady || !pdfBytes || !window.pdfjsLib) return;
    let isCancelled = false;
    let renderTask = null;

    async function renderPage() {
      try {
        // Clone Uint8Array so pdf.js worker does not detach our main pdfBytes buffer
        const dataCopy = new Uint8Array(pdfBytes);
        const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
        const pdf = await loadingTask.promise;

        if (isCancelled) return;
        setPageCount(pdf.numPages);

        const safePageNum = Math.min(Math.max(1, currentPage), pdf.numPages);
        if (safePageNum !== currentPage) {
          setCurrentPage(safePageNum);
          return;
        }

        const page = await pdf.getPage(safePageNum);
        if (isCancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        setPageDimensions({ width: baseViewport.width, height: baseViewport.height });

        // Render at high devicePixelRatio for sharp Retina iPad display
        const dpr = Math.min(window.devicePixelRatio || 2, 2.5);
        const renderViewport = page.getViewport({ scale: dpr });

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;

        const ctx = canvas.getContext('2d');
        renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport
        });
        await renderTask.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      }
    }

    renderPage();
    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [libsReady, pdfBytes, currentPage]);

  const commitOverlays = useCallback(
    (nextOverlays) => {
      setOverlays(nextOverlays);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, nextOverlays];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setOverlays(history[nextIndex]);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setOverlays(history[nextIndex]);
      setSelectedId(null);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setPdfBytes(bytes);
      setFileName(file.name);
      setCurrentPage(1);
      setOverlays([]);
      setHistory([[]]);
      setHistoryIndex(0);
      setSelectedId(null);
      showToast(`เปิดไฟล์ "${file.name}" สำเร็จแล้ว`);
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถอ่านไฟล์ PDF นี้ได้', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl !== 'string') return;

      const img = new Image();
      img.onload = () => {
        const aspect = (img.naturalWidth || 300) / (img.naturalHeight || 200);
        const maxWidth = 220;
        const width = maxWidth;
        const height = Math.round(maxWidth / aspect);

        const newItem = {
          id: `img-${Date.now()}`,
          page: currentPage,
          type: 'image',
          name: file.name,
          dataUrl,
          x: Math.round(pageDimensions.width / 2 - width / 2),
          y: Math.round(pageDimensions.height / 2 - height / 2),
          width,
          height,
          opacity: 1
        };

        const next = [...overlays, newItem];
        commitOverlays(next);
        setSelectedId(newItem.id);
        showToast('แทรกรูปภาพแล้ว ลากเพื่อจัดวางตำแหน่งได้เลย');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddText = (isWhiteout = false) => {
    const newItem = {
      id: `txt-${Date.now()}`,
      page: currentPage,
      type: isWhiteout ? 'whiteout' : 'text',
      x: Math.round(pageDimensions.width / 2 - 120),
      y: Math.round(pageDimensions.height / 2 - 30),
      width: isWhiteout ? 220 : 240,
      height: isWhiteout ? 44 : 56,
      text: isWhiteout ? 'ข้อความใหม่ทับจุดเดิม' : 'แตะเพื่อพิมพ์ข้อความ...',
      fontSize: 16,
      color: '#0f172a',
      bgColor: isWhiteout ? '#ffffff' : 'transparent',
      borderColor: isWhiteout ? 'transparent' : 'transparent',
      bold: false
    };
    const next = [...overlays, newItem];
    commitOverlays(next);
    setSelectedId(newItem.id);
    showToast(isWhiteout ? 'เพิ่มกล่องปิดทับข้อความเดิมแล้ว' : 'เพิ่มกล่องข้อความแล้ว');
  };

  const handleAddStamp = (stamp) => {
    const dataUrl = createStampDataUrl(stamp);
    const newItem = {
      id: `stamp-${Date.now()}`,
      page: currentPage,
      type: 'image',
      name: `${stamp.id}.png`,
      dataUrl,
      x: Math.round(pageDimensions.width - 245),
      y: Math.round(pageDimensions.height - 175),
      width: 185,
      height: 72,
      opacity: 0.95
    };
    const next = [...overlays, newItem];
    commitOverlays(next);
    setSelectedId(newItem.id);
    setShowStampModal(false);
    showToast(`เพิ่มตราประทับ "${stamp.label.split(' ')[0]}" แล้ว`);
  };

  const startDrawingSignature = (e) => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pt = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
    isDrawingRef.current = true;
    lastPointRef.current = pt;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = penColor;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, penWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const moveDrawingSignature = (e) => {
    if (!isDrawingRef.current) return;
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pt = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth * 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
  };

  const stopDrawingSignature = () => {
    isDrawingRef.current = false;
  };

  const clearSignaturePad = () => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignatureToPage = () => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const newItem = {
      id: `sig-${Date.now()}`,
      page: currentPage,
      type: 'signature',
      name: 'Signature.png',
      dataUrl,
      x: 75,
      y: Math.round(pageDimensions.height - 175),
      width: 170,
      height: 75,
      opacity: 1
    };
    const next = [...overlays, newItem];
    commitOverlays(next);
    setSelectedId(newItem.id);
    setShowSignModal(false);
    showToast('วางลายเซ็นลงบนหน้า PDF แล้ว');
  };

  const handleOverlayPointerDown = (e, item, mode = 'move') => {
    e.stopPropagation();
    setSelectedId(item.id);

    // Avoid hijacking pointer if user is actively editing text input inside
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      id: item.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height
    };
  };

  const handleOverlayPointerMove = (e) => {
    const st = dragStateRef.current;
    if (!st) return;
    e.stopPropagation();

    const dx = (e.clientX - st.startX) / zoom;
    const dy = (e.clientY - st.startY) / zoom;

    setOverlays((prev) =>
      prev.map((item) => {
        if (item.id !== st.id) return item;
        if (st.mode === 'move') {
          const nextX = Math.max(0, Math.min(pageDimensions.width - 30, Math.round(st.origX + dx)));
          const nextY = Math.max(0, Math.min(pageDimensions.height - 20, Math.round(st.origY + dy)));
          return { ...item, x: nextX, y: nextY };
        } else if (st.mode === 'resize') {
          const nextW = Math.max(45, Math.round(st.origW + dx));
          const nextH = Math.max(28, Math.round(st.origH + dy));
          return { ...item, width: nextW, height: nextH };
        }
        return item;
      })
    );
  };

  const handleOverlayPointerUp = () => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, overlays];
      });
      setHistoryIndex((prev) => prev + 1);
    }
  };

  const handleAddBlankPage = async () => {
    if (!window.PDFLib || !pdfBytes) return;
    try {
      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pdfDoc.addPage([pageDimensions.width || 595.28, pageDimensions.height || 841.89]);
      const updatedBytes = await pdfDoc.save();
      setPdfBytes(updatedBytes);
      const newTotal = pdfDoc.getPageCount();
      setPageCount(newTotal);
      setCurrentPage(newTotal);
      showToast(`เพิ่มหน้าเปล่าหน้าที่ ${newTotal} ด้วย pdf-lib แล้ว`);
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการเพิ่มหน้า', 'error');
    }
  };

  const handleDuplicatePage = async () => {
    if (!window.PDFLib || !pdfBytes) return;
    try {
      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [currentPage - 1]);
      pdfDoc.insertPage(currentPage, copiedPage);
      const updatedBytes = await pdfDoc.save();
      setPdfBytes(updatedBytes);
      setPageCount(pdfDoc.getPageCount());
      setCurrentPage(currentPage + 1);
      showToast(`ทำซ้ำหน้าที่ ${currentPage} เรียบร้อยแล้ว`);
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถทำซ้ำหน้าได้', 'error');
    }
  };

  const handleRotatePage = async () => {
    if (!window.PDFLib || !pdfBytes) return;
    try {
      const { PDFDocument, degrees } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(currentPage - 1);
      const currentRotation = page.getRotation().angle || 0;
      page.setRotation(degrees((currentRotation + 90) % 360));
      const updatedBytes = await pdfDoc.save();
      setPdfBytes(updatedBytes);
      showToast('หมุนหน้าเอกสาร 90° เรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถหมุนหน้าเอกสารได้', 'error');
    }
  };

  const handleDeleteCurrentPage = async () => {
    if (!window.PDFLib || !pdfBytes || pageCount <= 1) {
      showToast('เอกสารต้องมีอย่างน้อย 1 หน้า', 'error');
      return;
    }
    try {
      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pdfDoc.removePage(currentPage - 1);
      const updatedBytes = await pdfDoc.save();

      // Adjust overlays for removed page
      const filteredOverlays = overlays
        .filter((item) => item.page !== currentPage)
        .map((item) => (item.page > currentPage ? { ...item, page: item.page - 1 } : item));

      commitOverlays(filteredOverlays);
      setPdfBytes(updatedBytes);
      const nextCount = pdfDoc.getPageCount();
      setPageCount(nextCount);
      setCurrentPage(Math.min(currentPage, nextCount));
      showToast('ลบหน้าเอกสารเรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถลบหน้าเอกสารได้', 'error');
    }
  };

  const buildFinalPdfBytes = async () => {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const item of overlays) {
      const pageIndex = item.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { height: pageHeight } = page.getSize();

      // Convert top-left screen coordinates (x, y) to bottom-left PDF coordinates (pdfX, pdfY)
      const pdfX = item.x;
      const pdfY = pageHeight - item.y - item.height;

      if (item.type === 'image' || item.type === 'signature') {
        const { bytes, isJpg } = await imageSourceToBytes(item.dataUrl);
        const embeddedImg = isJpg
          ? await pdfDoc.embedJpg(bytes)
          : await pdfDoc.embedPng(bytes);

        page.drawImage(embeddedImg, {
          x: pdfX,
          y: pdfY,
          width: item.width,
          height: item.height,
          opacity: item.opacity ?? 1
        });
      } else if (item.type === 'text' || item.type === 'whiteout') {
        const hasNonAscii = /[^\x20-\x7E\r\n]/.test(item.text || '');

        if (!hasNonAscii && item.bgColor === 'transparent' && item.borderColor === 'transparent') {
          // Pure printable ASCII text: can use native pdf-lib drawText directly
          const hex = (item.color || '#0f172a').replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
          const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
          const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

          const fontToUse = item.bold ? helveticaBold : helveticaFont;
          const fontSize = item.fontSize || 16;
          const lines = (item.text || '').split('\n');
          lines.forEach((line, idx) => {
            page.drawText(line, {
              x: pdfX + 6,
              y: pageHeight - item.y - fontSize - 4 - idx * (fontSize * 1.3),
              size: fontSize,
              font: fontToUse,
              color: rgb(r, g, b)
            });
          });
        } else {
          // Thai / Unicode text or styled callout box: embed high-DPI crisp PNG via pdf-lib
          const textPngDataUrl = renderTextOverlayToPng(item);
          const { bytes } = await imageSourceToBytes(textPngDataUrl);
          const embeddedTextImg = await pdfDoc.embedPng(bytes);
          page.drawImage(embeddedTextImg, {
            x: pdfX,
            y: pdfY,
            width: item.width,
            height: item.height
          });
        }
      }
    }

    return await pdfDoc.save();
  };

  const handleExportPdf = async (useShareSheet = false) => {
    if (!libsReady || !pdfBytes) return;
    setIsExporting(true);
    try {
      const finalBytes = await buildFinalPdfBytes();
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const outName = fileName.replace(/\.pdf$/i, '') + '-edited.pdf';

      if (useShareSheet && navigator.canShare) {
        const fileObj = new File([blob], outName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [fileObj] })) {
          await navigator.share({
            files: [fileObj],
            title: outName,
            text: 'แก้ไขและแนบรูปด้วย iPad PDF Studio (pdf-lib)'
          });
          showToast('แชร์ไฟล์ PDF ไปยัง iPad สำเร็จแล้ว');
          setIsExporting(false);
          return;
        }
      }

      // Standard browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast(`บันทึกไฟล์ "${outName}" สำเร็จแล้ว!`);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Export PDF failed:', err);
        showToast('เกิดข้อผิดพลาดในการส่งออกไฟล์ PDF', 'error');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const updateSelectedOverlay = (patch) => {
    if (!selectedId) return;
    const next = overlays.map((item) => (item.id === selectedId ? { ...item, ...patch } : item));
    commitOverlays(next);
  };

  const deleteSelectedOverlay = () => {
    if (!selectedId) return;
    const next = overlays.filter((item) => item.id !== selectedId);
    commitOverlays(next);
    setSelectedId(null);
    showToast('ลบวัตถุที่เลือกแล้ว');
  };

  const selectedItem = overlays.find((item) => item.id === selectedId) || null;
  const pageOverlays = overlays.filter((item) => item.page === currentPage);

  const generateDeveloperCode = () => {
    return `import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * ตัวอย่างโค้ด JavaScript / TypeScript สำหรับแก้ไข PDF และแทรกรูปภาพ (PNG/JPG)
 * รองรับทั้ง Web App (React / Vue / Next.js) และ React Native
 */
export async function editPdfWithImages(
  existingPdfBytes: ArrayBuffer | Uint8Array,
  imageBytes: ArrayBuffer | Uint8Array,
  imageType: 'png' | 'jpg'
): Promise<Uint8Array> {
  // 1. โหลดไฟล์ PDF ต้นฉบับเข้าสู่ pdf-lib
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  // ลงทะเบียน fontkit หากต้องการฝังฟอนต์ภาษาไทย (.ttf) เช่น Sarabun
  pdfDoc.registerFontkit(fontkit);

  // 2. ดึงหน้าเอกสารที่ต้องการแก้ไข (หน้าแรกคือ index 0)
  const pages = pdfDoc.getPages();
  const page = pages[${currentPage - 1}];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // 3. Embed รูปภาพสกุล PNG หรือ JPG เข้าไปในเอกสาร PDF
  const embeddedImage =
    imageType === 'png'
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

  // 4. วาดรูปภาพลงในตำแหน่งที่ต้องการ (พิกัด PDF นับ (0,0) จากมุมซ้ายล่าง)
  page.drawImage(embeddedImage, {
    x: ${selectedItem ? selectedItem.x : 80},
    y: pageHeight - ${selectedItem ? selectedItem.y : 250} - ${selectedItem ? selectedItem.height : 120},
    width: ${selectedItem ? selectedItem.width : 180},
    height: ${selectedItem ? selectedItem.height : 120},
    opacity: ${selectedItem?.opacity ?? 1},
  });

  // 5. การแก้ไขข้อความเดิม (วาดกล่องสีขาวปิดทับจุดเดิม แล้วเขียนข้อความใหม่ทับ)
  page.drawRectangle({
    x: 60,
    y: pageHeight - 480,
    width: 240,
    height: 36,
    color: rgb(1, 1, 1), // สีขาวปิดทับคำเดิม
  });

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Updated Status: APPROVED', {
    x: 68,
    y: pageHeight - 468,
    size: 14,
    font,
    color: rgb(0.08, 0.25, 0.65),
  });

  // 6. บันทึกและส่งออกเป็น Uint8Array (นำไปสร้าง Blob หรือแชร์บน iPad ได้ทันที)
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}`;
  };

  if (!libsReady) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 select-none">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mb-4 animate-pulse">
          <FileText className="w-8 h-8 text-blue-400" />
        </div>
        <h1 className="text-xl font-bold tracking-tight mb-2">iPad PDF Studio (pdf-lib)</h1>
        <p className="text-slate-400 text-sm text-center max-w-md">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none font-sans">
      {/* Hidden File Inputs for PDF and Image (PNG/JPG) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handlePdfUpload}
        className="hidden"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-2xl border backdrop-blur-md transition-all bg-slate-900/95 border-slate-700 text-white text-sm font-medium">
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header Bar (Optimized for iPad Touch Targets) */}
      <header className="h-16 bg-slate-900/95 border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-2 shrink-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2.5 rounded-xl border transition-colors ${
              showSidebar
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="แถบจัดการหน้าเอกสาร"
          >
            <Layers className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-white truncate max-w-[160px] sm:max-w-[240px]">
                {fileName}
              </span>
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                <Smartphone className="w-3 h-3" /> iPad Ready • pdf-lib
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              หน้าที่ {currentPage} จาก {pageCount} • แตะหรือลากวัตถุบนหน้ากระดาษเพื่อแก้ไข
            </p>
          </div>
        </div>

        {/* Center Floating Tool Pill */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700/80 shadow-inner">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition"
            title="เปิดไฟล์ PDF จากเครื่อง/iPad"
          >
            <Upload className="w-4 h-4 text-sky-400" />
            <span className="hidden lg:inline">เปิด PDF</span>
          </button>

          <div className="w-px h-6 bg-slate-700 mx-0.5" />

          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm active:scale-95 transition"
            title="แนบรูปภาพ PNG หรือ JPG"
          >
            <ImageIcon className="w-4 h-4" />
            <span>แนบรูปภาพ</span>
          </button>

          <button
            onClick={() => handleAddText(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition"
            title="เพิ่มข้อความลงใน PDF"
          >
            <Type className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">เพิ่มข้อความ</span>
          </button>

          <button
            onClick={() => handleAddText(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition"
            title="ปิดทับข้อความเดิมแล้วพิมพ์ใหม่"
          >
            <Eraser className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">ลบ/แก้คำเดิม</span>
          </button>

          <button
            onClick={() => setShowSignModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition"
            title="เซ็นชื่อด้วย Apple Pencil หรือนิ้ว"
          >
            <PenTool className="w-4 h-4 text-purple-400" />
            <span className="hidden md:inline">ลายเซ็น</span>
          </button>

          <button
            onClick={() => setShowStampModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 active:scale-95 transition"
            title="เพิ่มตราประทับสำเร็จรูป"
          >
            <Stamp className="w-4 h-4 text-rose-400" />
            <span className="hidden xl:inline">ตราประทับ</span>
          </button>
        </div>

        {/* Right Actions: Undo/Redo, Code View & Export PDF */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-35 hover:bg-slate-700 active:scale-95 transition"
            title="ย้อนกลับ (Undo)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-35 hover:bg-slate-700 active:scale-95 transition"
            title="ทำซ้ำ (Redo)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowCodeModal(true)}
            className="p-2.5 sm:px-3 sm:py-2 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 hover:bg-slate-700 flex items-center gap-1.5 text-xs sm:text-sm font-medium active:scale-95 transition"
            title="ดูโค้ด pdf-lib (JS/TS)"
          >
            <Code className="w-4 h-4" />
            <span className="hidden xl:inline">โค้ด pdf-lib</span>
          </button>

          <button
            onClick={() => handleExportPdf(true)}
            disabled={isExporting}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium active:scale-95 transition"
            title="แชร์ไปยังแอป Files / GoodNotes บน iPad"
          >
            <Share2 className="w-4 h-4 text-sky-400" />
            <span className="hidden lg:inline">แชร์บน iPad</span>
          </button>

          <button
            onClick={() => handleExportPdf(false)}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-900/30 active:scale-95 transition"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'กำลังสร้าง...' : 'บันทึก PDF'}</span>
          </button>
        </div>
      </header>

      {}
      {selectedItem && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 z-20 shadow-md">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {selectedItem.type === 'image' && 'รูปภาพ (PNG/JPG)'}
              {selectedItem.type === 'signature' && 'ลายเซ็น (PNG)'}
              {selectedItem.type === 'text' && 'กล่องข้อความ'}
              {selectedItem.type === 'whiteout' && 'กล่องปิดทับข้อความเดิม'}
            </span>

            {(selectedItem.type === 'text' || selectedItem.type === 'whiteout') && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">ขนาดอักษร:</span>
                  <button
                    onClick={() =>
                      updateSelectedOverlay({ fontSize: Math.max(10, (selectedItem.fontSize || 16) - 2) })
                    }
                    className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono w-7 text-center">{selectedItem.fontSize || 16}</span>
                  <button
                    onClick={() =>
                      updateSelectedOverlay({ fontSize: Math.min(48, (selectedItem.fontSize || 16) + 2) })
                    }
                    className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">สีอักษร:</span>
                  {['#0f172a', '#1d4ed8', '#dc2626', '#047857', '#7c3aed'].map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSelectedOverlay({ color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        selectedItem.color === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">พื้นหลัง:</span>
                  {[
                    { label: 'ใส', value: 'transparent' },
                    { label: 'ขาวทึบ (ปิดคำเดิม)', value: '#ffffff' },
                    { label: 'เหลืองไฮไลท์', value: '#fef08a' },
                    { label: 'ฟ้าอ่อน', value: '#eff6ff' }
                  ].map((bg) => (
                    <button
                      key={bg.value}
                      onClick={() => updateSelectedOverlay({ bgColor: bg.value })}
                      className={`px-2 py-1 rounded-lg text-xs border transition ${
                        selectedItem.bgColor === bg.value
                          ? 'bg-blue-600/30 border-blue-400 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {(selectedItem.type === 'image' || selectedItem.type === 'signature') && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">ความโปร่งใส (Opacity):</span>
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={selectedItem.opacity ?? 1}
                  onChange={(e) => updateSelectedOverlay({ opacity: parseFloat(e.target.value) })}
                  className="w-28 accent-blue-500"
                />
                <span className="text-xs font-mono text-slate-300">
                  {Math.round((selectedItem.opacity ?? 1) * 100)}%
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden md:inline">
              พิกัด PDF: X={selectedItem.x}, Y={Math.round(pageDimensions.height - selectedItem.y - selectedItem.height)}
            </span>
            <button
              onClick={deleteSelectedOverlay}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ลบชิ้นนี้</span>
            </button>
          </div>
        </div>
      )}

      {}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar for Page Management via pdf-lib */}
        {showSidebar && (
          <aside className="w-60 sm:w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col justify-between p-3.5 shrink-0 z-20 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  จัดการหน้าด้วย pdf-lib
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                  {pageCount} หน้า
                </span>
              </div>

              {/* Page Selector Pills */}
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => {
                  const countOnPage = overlays.filter((o) => o.page === pageNum).length;
                  const isCurrent = pageNum === currentPage;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setCurrentPage(pageNum);
                        setSelectedId(null);
                      }}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between h-20 ${
                        isCurrent
                          ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                          : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">หน้า {pageNum}</span>
                        <FileText className={`w-4 h-4 ${isCurrent ? 'text-blue-400' : 'text-slate-500'}`} />
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {countOnPage > 0 ? `แก้ไข ${countOnPage} จุด` : 'ต้นฉบับ'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Page Operations (Add / Duplicate / Rotate / Delete) */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <p className="text-xs font-semibold text-slate-400">คำสั่งจัดการหน้ากระดาษ</p>
                <button
                  onClick={handleAddBlankPage}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
                >
                  <FilePlus className="w-4 h-4 text-emerald-400" />
                  <span>เพิ่มหน้าเปล่า (addPage)</span>
                </button>

                <button
                  onClick={handleDuplicatePage}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
                >
                  <Copy className="w-4 h-4 text-sky-400" />
                  <span>ทำซ้ำหน้านี้ (copyPages)</span>
                </button>

                <button
                  onClick={handleRotatePage}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
                >
                  <RotateCw className="w-4 h-4 text-amber-400" />
                  <span>หมุนหน้า 90° (setRotation)</span>
                </button>

                <button
                  onClick={handleDeleteCurrentPage}
                  disabled={pageCount <= 1}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 border border-slate-700 disabled:opacity-40 text-xs font-medium text-rose-300 transition"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>ลบหน้านี้ (removePage)</span>
                </button>
              </div>

              {/* Layer List on Current Page */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <p className="text-xs font-semibold text-slate-400">
                  เลเยอร์ที่แนบในหน้า {currentPage} ({pageOverlays.length})
                </p>
                {pageOverlays.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">ยังไม่มีรูปหรือข้อความที่แนบในหน้านี้</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {pageOverlays.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer border transition ${
                          selectedId === item.id
                            ? 'bg-blue-600/25 border-blue-500 text-white'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate max-w-[140px]">
                          {item.type === 'image' && `🖼️ ${item.name || 'รูปภาพ'}`}
                          {item.type === 'signature' && '✍️ ลายเซ็น'}
                          {item.type === 'text' && `📝 ${item.text}`}
                          {item.type === 'whiteout' && `⬜ ${item.text}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Reset to Sample PDF Button */}
            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={generateSamplePdf}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>รีเซ็ตเอกสารตัวอย่าง</span>
              </button>
            </div>
          </aside>
        )}

        {/* Center Interactive PDF Canvas Area */}
        <main
          ref={containerRef}
          onClick={() => setSelectedId(null)}
          className="flex-1 overflow-auto bg-slate-950 flex flex-col items-center p-4 sm:p-8 relative"
        >
          {/* Interactive Page Container */}
          <div
            className="relative bg-white shadow-2xl rounded-sm transition-transform origin-top"
            style={{
              width: pageDimensions.width * zoom,
              height: pageDimensions.height * zoom
            }}
          >
            {/* Rendered PDF Background Canvas */}
            <canvas
              ref={pdfCanvasRef}
              className="w-full h-full block pointer-events-none"
            />

            {/* Interactive Overlay Layer (Images, Signatures, Text, Whiteout) */}
            <div
              className="absolute inset-0"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                width: pageDimensions.width,
                height: pageDimensions.height
              }}
            >
              {pageOverlays.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(item.id);
                    }}
                    onPointerDown={(e) => handleOverlayPointerDown(e, item, 'move')}
                    onPointerMove={handleOverlayPointerMove}
                    onPointerUp={handleOverlayPointerUp}
                    style={{
                      position: 'absolute',
                      left: item.x,
                      top: item.y,
                      width: item.width,
                      height: item.height,
                      touchAction: 'none'
                    }}
                    className={`group cursor-move transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-blue-500 shadow-lg z-20'
                        : 'hover:ring-1 hover:ring-blue-400/70 z-10'
                    }`}
                  >
                    {/* Image or Signature Content */}
                    {(item.type === 'image' || item.type === 'signature') && (
                      <img
                        src={item.dataUrl}
                        alt={item.name || 'PDF Attachment'}
                        draggable={false}
                        style={{ opacity: item.opacity ?? 1 }}
                        className="w-full h-full object-fill select-none pointer-events-none"
                      />
                    )}

                    {/* Editable Text or Whiteout Box */}
                    {(item.type === 'text' || item.type === 'whiteout') && (
                      <textarea
                        value={item.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOverlays((prev) =>
                            prev.map((o) => (o.id === item.id ? { ...o, text: val } : o))
                          );
                        }}
                        onBlur={() => commitOverlays(overlays)}
                        style={{
                          fontSize: `${item.fontSize || 16}px`,
                          color: item.color || '#0f172a',
                          backgroundColor: item.bgColor || 'transparent',
                          borderColor: item.borderColor || 'transparent',
                          fontWeight: item.bold ? 'bold' : 'normal',
                          lineHeight: 1.3
                        }}
                        className="w-full h-full p-1.5 resize-none focus:outline-none font-sans overflow-hidden rounded"
                      />
                    )}

                    {/* Floating Drag Handle & Resize Corner for iPad Touch */}
                    {isSelected && (
                      <>
                        {/* Top Drag Pill */}
                        <div className="absolute -top-7 left-0 bg-blue-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-t-md flex items-center gap-1 shadow">
                          <Move className="w-3 h-3" />
                          <span>ลากย้าย</span>
                        </div>

                        {/* Delete Button on Top-Right Corner */}
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSelectedOverlay();
                          }}
                          className="absolute -top-3.5 -right-3.5 w-7 h-7 rounded-full bg-rose-600 text-white shadow-md flex items-center justify-center hover:bg-rose-500 active:scale-90"
                          title="ลบ"
                        >
                          <X className="w-4 h-4" />
                        </button>

                        {/* Bottom-Right Touch Resize Handle */}
                        <div
                          onPointerDown={(e) => handleOverlayPointerDown(e, item, 'resize')}
                          onPointerMove={handleOverlayPointerMove}
                          onPointerUp={handleOverlayPointerUp}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-3.5 -right-3.5 w-8 h-8 rounded-full bg-blue-600 border-2 border-white text-white shadow-lg flex items-center justify-center cursor-nwse-resize active:scale-110"
                          title="ลากเพื่อย่อ/ขยายขนาด"
                        >
                          <Maximize2 className="w-3.5 h-3.5 rotate-90" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Floating Bottom Zoom & Page Navigation Bar (iPadOS style) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3.5 py-2 rounded-2xl shadow-2xl"
          >
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-xl hover:bg-slate-800 disabled:opacity-35 text-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 text-slate-200">
              หน้า {currentPage} / {pageCount}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="p-1.5 rounded-xl hover:bg-slate-800 disabled:opacity-35 text-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-slate-700 mx-1" />

            <button
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-200"
              title="ซูมออก"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono w-12 text-center text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.15).toFixed(2)))}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-200"
              title="ซูมเข้า"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>

      {}
      {showSignModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">วาดลายเซ็น / เขียนด้วย Apple Pencil</h3>
                <p className="text-xs text-slate-400">
                  ลายเซ็นจะถูกแปลงเป็น PNG พื้นหลังใสและฝังลงใน PDF ด้วย pdfDoc.embedPng()
                </p>
              </div>
              <button
                onClick={() => setShowSignModal(false)}
                className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pen Color & Thickness Controls */}
            <div className="flex items-center justify-between bg-slate-800/80 px-3.5 py-2.5 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">สีปากกา:</span>
                {[
                  { color: '#1d4ed8', label: 'น้ำเงิน' },
                  { color: '#0f172a', label: 'ดำ' },
                  { color: '#dc2626', label: 'แดง' }
                ].map((p) => (
                  <button
                    key={p.color}
                    onClick={() => setPenColor(p.color)}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      penColor === p.color ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: p.color }}
                    title={p.label}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">ขนาดเส้น:</span>
                <input
                  type="range"
                  min="1.5"
                  max="7"
                  step="0.5"
                  value={penWidth}
                  onChange={(e) => setPenWidth(parseFloat(e.target.value))}
                  className="w-24 accent-blue-500"
                />
              </div>
            </div>

            {/* Touch / Pencil Signature Canvas */}
            <div className="bg-white rounded-2xl overflow-hidden border-2 border-dashed border-slate-600 relative">
              <canvas
                ref={signCanvasRef}
                width={600}
                height={260}
                style={{ touchAction: 'none' }}
                onPointerDown={startDrawingSignature}
                onPointerMove={moveDrawingSignature}
                onPointerUp={stopDrawingSignature}
                onPointerLeave={stopDrawingSignature}
                className="w-full h-52 cursor-crosshair block"
              />
              <span className="absolute bottom-2 right-3 text-[11px] text-slate-400 pointer-events-none">
                เซ็นชื่อในกรอบนี้ (รองรับ iPad Touch & Apple Pencil)
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={clearSignaturePad}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                ล้างกระดาน
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSignModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={saveSignatureToPage}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg transition"
                >
                  แทรกลายเซ็นลงใน PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {showStampModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">เลือกตราประทับ (Embed PNG Stamp)</h3>
                <p className="text-xs text-slate-400">คลิกเลือกเพื่อฝังตราประทับลงบนหน้า PDF ปัจจุบัน</p>
              </div>
              <button
                onClick={() => setShowStampModal(false)}
                className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {PRESET_STAMPS.map((st) => (
                <button
                  key={st.id}
                  onClick={() => handleAddStamp(st)}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition group"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: st.color }}
                    />
                    <span className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                      {st.label}
                    </span>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300">
                    แทรก PNG
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[88vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-amber-400" />
                  <span>โค้ด TypeScript / JavaScript สำหรับไลบรารี pdf-lib</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  สามารถคัดลอกไปใช้ในโปรเจกต์ Web App (React / Next.js) หรือ React Native ได้ทันที
                </p>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <pre className="my-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-auto flex-1 leading-relaxed select-text">
              {generateDeveloperCode()}
            </pre>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                ติดตั้งผ่าน npm: <code className="text-amber-300">npm install pdf-lib @pdf-lib/fontkit</code>
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(generateDeveloperCode());
                  showToast('คัดลอกโค้ด TypeScript เรียบร้อยแล้ว');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
              >
                คัดลอกโค้ด (Copy Code)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}