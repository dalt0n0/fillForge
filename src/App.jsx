import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import SignatureModal from './components/SignatureModal.jsx';
import {
  addCheckBoxToPdf,
  addSignatureToPdf,
  addTextFieldToPdf,
  addTextToPdf,
  createBlankPdf,
  getFormFields,
  setFormFieldValue
} from './pdf/pdfUtils.js';

GlobalWorkerOptions.workerSrc = workerSrc;

const TOOL = {
  PAN: 'pan',
  TEXT: 'text',
  TEXT_FIELD: 'text-field',
  CHECKBOX: 'checkbox',
  SIGNATURE: 'signature'
};

const emptyDocTips = [
  'Drop a PDF to start filling forms and signatures.',
  'Create a blank PDF and build your form from scratch.',
  'Export polished PDFs with signatures included.'
];

const placementDefaults = {
  [TOOL.TEXT_FIELD]: { width: 220, height: 36 },
  [TOOL.CHECKBOX]: { width: 28, height: 28 },
  [TOOL.SIGNATURE]: { width: 200, height: 80 }
};

const textFontOptions = [
  { label: 'Helvetica', value: 'helvetica' },
  { label: 'Times', value: 'times' },
  { label: 'Courier', value: 'courier' }
];

const createDraftId = () =>
  `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const bytesToBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
};

const base64ToBytes = (base64) =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

const fileToBytes = async (file) => {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const App = () => {
  const viewerScrollRef = useRef(null);
  const pageViewportsRef = useRef([]);
  const pageOffsetsRef = useRef([]);
  const pageElementsRef = useRef([]);
  const renderTokenRef = useRef(0);
  const dragStateRef = useRef(null);
  const lastScaleRef = useRef(1.05);
  const fileInputRef = useRef(null);
  const textFieldDragRef = useRef(null);
  const textFieldDraftRef = useRef(null);
  const fieldNameDraftRef = useRef('');
  const textDragRef = useRef(null);
  const textDraftBoxRef = useRef(null);

  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfName, setPdfName] = useState('Untitled.pdf');
  const [pageCount, setPageCount] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [activeTool, setActiveTool] = useState(TOOL.PAN);
  const [scale, setScale] = useState(1.05);
  const [textDraft, setTextDraft] = useState('');
  const [fieldNameDraft, setFieldNameDraft] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [formFields, setFormFields] = useState([]);
  const [fieldDrafts, setFieldDrafts] = useState({});
  const [drafts, setDrafts] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [textFieldDraft, setTextFieldDraft] = useState(null);
  const [textDraftBox, setTextDraftBox] = useState(null);
  const [thumbnails, setThumbnails] = useState([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [certificateName, setCertificateName] = useState('');
  const [certificateData, setCertificateData] = useState('');
  const [certificatePassword, setCertificatePassword] = useState('');
  const [showCertModal, setShowCertModal] = useState(false);
  const [certForm, setCertForm] = useState({
    commonName: '',
    organization: '',
    orgUnit: '',
    country: 'US',
    state: '',
    locality: '',
    email: '',
    password: '',
    validityYears: 2
  });
  const [signerName, setSignerName] = useState('');
  const [signReason, setSignReason] = useState('');
  const [signLocation, setSignLocation] = useState('');
  const [signContact, setSignContact] = useState('');
  const [includeVisualSignature, setIncludeVisualSignature] = useState(true);
  const [signError, setSignError] = useState('');
  const [isSigned, setIsSigned] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const statusTimerRef = useRef(null);
  const hasDesktopBridge = typeof window !== 'undefined' && !!window.pdfApi;
  const canCreateCertificate =
    typeof window !== 'undefined' && !!window.pdfApi?.createCertificate;
  const editingLocked = isSigned;

  const flashStatus = useCallback((message, tone = 'error') => {
    setStatusMessage({ message, tone });
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  }, []);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) || null,
    [drafts, selectedDraftId]
  );

  useEffect(() => {
    if (!selectedDraft || selectedDraft.type !== TOOL.TEXT) return;
    const scrollEl = viewerScrollRef.current;
    if (!scrollEl) return;
    const element = scrollEl.querySelector(
      `[data-draft-id="${selectedDraft.id}"] [contenteditable]`
    );
    if (!element) return;
    const focusTimer = window.setTimeout(() => {
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [selectedDraft]);

  useEffect(() => {
    textFieldDraftRef.current = textFieldDraft;
  }, [textFieldDraft]);

  useEffect(() => {
    textDraftBoxRef.current = textDraftBox;
  }, [textDraftBox]);

  useEffect(() => {
    fieldNameDraftRef.current = fieldNameDraft;
  }, [fieldNameDraft]);

  const refreshFormFields = useCallback(async (bytes) => {
    if (!bytes) {
      setFormFields([]);
      return;
    }

    try {
      const fields = await getFormFields(bytes);
      setFormFields(fields);
      const draftState = {};
      fields.forEach((field) => {
        draftState[field.name] = field.value ?? '';
      });
      setFieldDrafts(draftState);
    } catch (error) {
      console.error('Failed to read form fields', error);
      setFormFields([]);
    }
  }, []);

  const capturePageOffsets = useCallback(() => {
    const scrollEl = viewerScrollRef.current;
    if (!scrollEl) return;

    const scrollRect = scrollEl.getBoundingClientRect();
    pageOffsetsRef.current = pageElementsRef.current.map((wrapper) => {
      if (!wrapper) return null;
      const canvas = wrapper.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left - scrollRect.left + scrollEl.scrollLeft,
        top: rect.top - scrollRect.top + scrollEl.scrollTop,
        width: rect.width,
        height: rect.height
      };
    });
  }, []);

  const renderThumbnails = useCallback(async (pdfDoc, token) => {
    const results = [];
    for (let pageIndex = 0; pageIndex < pdfDoc.numPages; pageIndex += 1) {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 0.2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (context) {
        await page.render({ canvasContext: context, viewport }).promise;
      }

      if (renderTokenRef.current !== token) return;
      results.push({ pageIndex, url: canvas.toDataURL('image/png') });
    }

    setThumbnails(results);
  }, []);

  const renderPdf = useCallback(
    async (bytes) => {
      if (!bytes || !viewerScrollRef.current) return;

      const currentToken = renderTokenRef.current + 1;
      renderTokenRef.current = currentToken;
      setIsRendering(true);

      const safeBytes =
        bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
      const loadingTask = getDocument({ data: safeBytes });
      const pdfDoc = await loadingTask.promise;
      if (renderTokenRef.current !== currentToken) return;

      const container = viewerScrollRef.current;
      container.innerHTML = '';
      pageElementsRef.current = [];
      const viewports = [];

      for (let pageIndex = 0; pageIndex < pdfDoc.numPages; pageIndex += 1) {
        const page = await pdfDoc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const wrapper = document.createElement('div');
        const canvasWrap = document.createElement('div');

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.dataset.pageIndex = String(pageIndex);

        wrapper.className = 'page';
        canvasWrap.className = 'page-canvas';
        canvasWrap.appendChild(canvas);
        wrapper.appendChild(canvasWrap);
        container.appendChild(wrapper);

        const context = canvas.getContext('2d');
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
        }

        pageElementsRef.current[pageIndex] = wrapper;
        viewports[pageIndex] = viewport;
      }

      pageViewportsRef.current = viewports;
      setPageCount(pdfDoc.numPages);
      requestAnimationFrame(capturePageOffsets);
      renderThumbnails(pdfDoc, currentToken);
      setIsRendering(false);
    },
    [capturePageOffsets, renderThumbnails, scale]
  );

  useEffect(() => {
    if (!pdfBytes) return;
    renderPdf(pdfBytes);
    refreshFormFields(pdfBytes);
  }, [pdfBytes, renderPdf, refreshFormFields]);

  useEffect(() => {
    if (pdfBytes) return;
    setThumbnails([]);
    setPageCount(0);
    setDrafts([]);
    setSelectedDraftId(null);
  }, [pdfBytes]);

  useEffect(() => {
    const scrollEl = viewerScrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      const offsets = pageOffsetsRef.current;
      if (!offsets.length) return;
      const scrollTop = scrollEl.scrollTop;
      let current = 0;
      offsets.forEach((offset, index) => {
        if (!offset) return;
        if (scrollTop + 40 >= offset.top) {
          current = index;
        }
      });
      setActivePageIndex(current);
    };

    handleScroll();
    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [pageCount]);

  useEffect(() => {
    const handleResize = () => capturePageOffsets();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [capturePageOffsets]);
  useEffect(() => {
    const lastScale = lastScaleRef.current;
    if (drafts.length && lastScale && scale !== lastScale) {
      const ratio = scale / lastScale;
      setDrafts((current) =>
        current.map((draft) => ({
          ...draft,
          x: draft.x * ratio,
          y: draft.y * ratio,
          width: draft.width * ratio,
          height: draft.height * ratio
        }))
      );
    }
    lastScaleRef.current = scale;
  }, [drafts.length, scale]);

  const handleOpenDialog = async () => {
    if (window.pdfApi?.openPdf) {
      const result = await window.pdfApi.openPdf();
      if (!result) return;
      setPdfBytes(base64ToBytes(result.data));
      setPdfName(result.name || 'Opened.pdf');
      setActivePageIndex(0);
      setDrafts([]);
      setSelectedDraftId(null);
      setIsSigned(false);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFilePick = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const bytes = await fileToBytes(file);
    setPdfBytes(bytes);
    setPdfName(file.name || 'Opened.pdf');
    setActivePageIndex(0);
    setDrafts([]);
    setSelectedDraftId(null);
    setIsSigned(false);
  };

  const handleNewBlank = async () => {
    const bytes = await createBlankPdf();
    setPdfBytes(bytes);
    setPdfName('Untitled.pdf');
    setActivePageIndex(0);
    setDrafts([]);
    setSelectedDraftId(null);
    setIsSigned(false);
  };

  const normalizePdfBytes = (value) => {
    if (!value) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (typeof value === 'string') {
      try {
        return base64ToBytes(value);
      } catch {
        return null;
      }
    }
    return null;
  };

  const hasPdfHeader = (bytes) => {
    if (!bytes || bytes.length < 4) return false;
    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    return header === '%PDF';
  };

  const handleExport = async () => {
    if (!pdfBytes) return;
    setSignError('');
    let nextBytes = normalizePdfBytes(pdfBytes);
    let didSign = false;

    if (!nextBytes || !hasPdfHeader(nextBytes)) {
      const message = 'PDF data is invalid. Please reopen the document.';
      setSignError(message);
      flashStatus(message);
      return;
    }

    let savePath = null;
    if (window.pdfApi?.savePdfPath) {
      try {
        const result = await window.pdfApi.savePdfPath({ name: pdfName });
        if (!result?.path) return;
        savePath = result.path;
      } catch (error) {
        console.error('Save dialog failed', error);
        flashStatus('Save dialog failed. Please try again.');
        return;
      }
    }

    const resolveDraftRect = (draft) => {
      const viewport = pageViewportsRef.current[draft.pageIndex];
      if (!viewport) return null;
      const [pdfX1, pdfY1] = viewport.convertToPdfPoint(draft.x, draft.y);
      const [pdfX2, pdfY2] = viewport.convertToPdfPoint(
        draft.x + draft.width,
        draft.y + draft.height
      );
      return {
        pageIndex: draft.pageIndex,
        x: Math.min(pdfX1, pdfX2),
        y: Math.min(pdfY1, pdfY2),
        width: Math.abs(pdfX2 - pdfX1),
        height: Math.abs(pdfY2 - pdfY1)
      };
    };

    try {
      const ensurePdf = (bytes, context) => {
        if (!bytes || !hasPdfHeader(bytes)) {
          throw new Error(`Invalid PDF data after ${context}.`);
        }
      };

      for (const draft of drafts) {
        const rect = resolveDraftRect(draft);
        if (!rect) continue;

        if (draft.type === TOOL.TEXT) {
          const textY = rect.y + rect.height - Math.min(draft.size || 16, rect.height);
          const size = draft.size || 16;
          nextBytes = await addTextToPdf(nextBytes, {
            pageIndex: rect.pageIndex,
            x: rect.x + 4,
            y: textY,
            text: draft.text || '',
            size,
            fontFamily: draft.fontFamily || 'helvetica',
            fontWeight: draft.fontWeight || 'normal',
            fontStyle: draft.fontStyle || 'normal',
            underline: Boolean(draft.underline),
            color: draft.color || '#0d1117',
            maxWidth: Math.max(rect.width - 8, 40),
            lineHeight: size * 1.2
          });
          ensurePdf(nextBytes, 'adding text');
        } else if (draft.type === TOOL.TEXT_FIELD) {
          nextBytes = await addTextFieldToPdf(nextBytes, {
            pageIndex: rect.pageIndex,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            name: draft.fieldName || undefined
          });
          ensurePdf(nextBytes, 'adding text field');
        } else if (draft.type === TOOL.CHECKBOX) {
          nextBytes = await addCheckBoxToPdf(nextBytes, {
            pageIndex: rect.pageIndex,
            x: rect.x,
            y: rect.y,
            size: Math.min(rect.width, rect.height),
            name: draft.fieldName || undefined
          });
          ensurePdf(nextBytes, 'adding checkbox');
        } else if (draft.type === TOOL.SIGNATURE) {
          if (!includeVisualSignature) continue;
          if (!draft.dataUrl) continue;
          nextBytes = await addSignatureToPdf(nextBytes, {
            pageIndex: rect.pageIndex,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            dataUrl: draft.dataUrl
          });
          ensurePdf(nextBytes, 'adding signature');
        }
      }

      const signatureDrafts = drafts.filter((draft) => draft.type === TOOL.SIGNATURE);
      const signatureDraft = signatureDrafts[signatureDrafts.length - 1];
      if (signatureDraft && certificateData) {
        if (!window.pdfApi?.signPdf) {
          const message = 'Digital signing is only available in the desktop app.';
          setSignError(message);
          flashStatus(message);
          return;
        }

        const rect = resolveDraftRect(signatureDraft);
        if (!rect) return;

        const result = await window.pdfApi.signPdf({
          pdfBase64: bytesToBase64(nextBytes),
          certBase64: certificateData,
          password: certificatePassword,
          name: signerName,
          reason: signReason,
          location: signLocation,
          contactInfo: signContact,
          pageIndex: rect.pageIndex,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        });

        if (result?.error) {
          setSignError(result.error);
          flashStatus(result.error);
          return;
        }

        if (result?.data) {
          nextBytes = base64ToBytes(result.data);
          ensurePdf(nextBytes, 'signing');
          didSign = true;
        }
      }
    } catch (error) {
      console.error('Export failed', error);
      const message = 'Export failed. Please try again or reopen the PDF.';
      setSignError(message);
      flashStatus(message);
      return;
    }

    const data = bytesToBase64(nextBytes);

    try {
      if (window.pdfApi?.writePdf && savePath) {
        await window.pdfApi.writePdf({ path: savePath, data });
      } else if (window.pdfApi?.savePdf) {
        await window.pdfApi.savePdf({ name: pdfName, data });
      } else {
        const blob = new Blob([nextBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = pdfName || 'fillforge-export.pdf';
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Write failed', error);
      const message = 'Failed to write the PDF. Please try again.';
      setSignError(message);
      flashStatus(message);
      return;
    }

    if (savePath) {
      flashStatus('Export complete.', 'success');
    }

    setPdfBytes(nextBytes);
    setDrafts([]);
    setSelectedDraftId(null);
    if (didSign) {
      if (!pdfName.toLowerCase().includes('signed')) {
        setPdfName(pdfName.replace(/\\.pdf$/i, '') + '-signed.pdf');
      }
      setIsSigned(true);
    }
  };

  const handleCanvasClick = async (event) => {
    if (!pdfBytes || isSigned) return;
    if (activeTool === TOOL.PAN) {
      setSelectedDraftId(null);
      return;
    }
    if (activeTool === TOOL.TEXT_FIELD || activeTool === TOOL.TEXT) {
      return;
    }

    const canvas = event.target.closest('canvas');
    if (!canvas) return;

    const pageIndex = Number(canvas.dataset.pageIndex || 0);
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const viewport = pageViewportsRef.current[pageIndex];
    if (!viewport) return;

    const defaults = placementDefaults[activeTool] || { width: 140, height: 40 };
    let width = defaults.width;
    let height = defaults.height;

    if (activeTool === TOOL.SIGNATURE && !signatureDataUrl) return;

    const maxX = viewport.width - width;
    const maxY = viewport.height - height;

    const draft = {
      id: createDraftId(),
      type: activeTool,
      pageIndex,
      x: clamp(clickX - width / 2, 0, maxX),
      y: clamp(clickY - height / 2, 0, maxY),
      width,
      height
    };

    if (activeTool === TOOL.TEXT_FIELD || activeTool === TOOL.CHECKBOX) {
      draft.fieldName = fieldNameDraft.trim();
    }

    if (activeTool === TOOL.SIGNATURE) {
      draft.dataUrl = signatureDataUrl;
    }

    setDrafts((current) => [...current, draft]);
    setSelectedDraftId(draft.id);
  };

  const handleTextFieldPointerMove = useCallback((event) => {
    const drag = textFieldDragRef.current;
    if (!drag) return;
    const viewport = pageViewportsRef.current[drag.pageIndex];
    if (!viewport) return;

    drag.didDrag = true;
    const x = clamp(event.clientX - drag.rect.left, 0, viewport.width);
    const y = clamp(event.clientY - drag.rect.top, 0, viewport.height);
    const left = Math.min(drag.startX, x);
    const top = Math.min(drag.startY, y);
    const width = Math.abs(x - drag.startX);
    const height = Math.abs(y - drag.startY);

    setTextFieldDraft({
      pageIndex: drag.pageIndex,
      x: left,
      y: top,
      width,
      height
    });
  }, []);

  const handleTextFieldPointerUp = useCallback(() => {
    const drag = textFieldDragRef.current;
    if (!drag) return;
    window.removeEventListener('pointermove', handleTextFieldPointerMove);
    window.removeEventListener('pointerup', handleTextFieldPointerUp);

    const draftState = textFieldDraftRef.current;
    textFieldDragRef.current = null;

    if (!draftState || draftState.width < 8 || draftState.height < 8) {
      setTextFieldDraft(null);
      return;
    }

    const draft = {
      id: createDraftId(),
      type: TOOL.TEXT_FIELD,
      pageIndex: draftState.pageIndex,
      x: draftState.x,
      y: draftState.y,
      width: draftState.width,
      height: draftState.height,
      fieldName: fieldNameDraftRef.current.trim()
    };

    setTextFieldDraft(null);
    setDrafts((current) => [...current, draft]);
    setSelectedDraftId(draft.id);
  }, []);

  const handleTextPointerMove = useCallback((event) => {
    const drag = textDragRef.current;
    if (!drag) return;
    const viewport = pageViewportsRef.current[drag.pageIndex];
    if (!viewport) return;

    drag.didDrag = true;
    const x = clamp(event.clientX - drag.rect.left, 0, viewport.width);
    const y = clamp(event.clientY - drag.rect.top, 0, viewport.height);
    const left = Math.min(drag.startX, x);
    const top = Math.min(drag.startY, y);
    const width = Math.abs(x - drag.startX);
    const height = Math.abs(y - drag.startY);

    setTextDraftBox({
      pageIndex: drag.pageIndex,
      x: left,
      y: top,
      width,
      height
    });
  }, []);

  const handleTextPointerUp = useCallback(() => {
    const drag = textDragRef.current;
    if (!drag) return;
    window.removeEventListener('pointermove', handleTextPointerMove);
    window.removeEventListener('pointerup', handleTextPointerUp);

    const draftState = textDraftBoxRef.current;
    textDragRef.current = null;

    const minWidth = 140;
    const minHeight = 32;
    const viewport = pageViewportsRef.current[drag.pageIndex];
    const width = Math.max(draftState?.width || 0, minWidth);
    const height = Math.max(draftState?.height || 0, minHeight);
    const startX = draftState?.x ?? drag.startX;
    const startY = draftState?.y ?? drag.startY;
    const maxX = viewport ? Math.max(viewport.width - width, 0) : 0;
    const maxY = viewport ? Math.max(viewport.height - height, 0) : 0;

    const draft = {
      id: createDraftId(),
      type: TOOL.TEXT,
      pageIndex: drag.pageIndex,
      x: clamp(startX, 0, maxX),
      y: clamp(startY, 0, maxY),
      width,
      height,
      text: textDraft.trim(),
      size: clamp(Math.round(height * 0.6), 10, 36),
      fontFamily: 'helvetica',
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
      color: '#0d1117'
    };

    setTextDraftBox(null);
    setDrafts((current) => [...current, draft]);
    setSelectedDraftId(draft.id);
  }, [textDraft]);

  const handleViewerPointerDown = useCallback(
    (event) => {
      if (!pdfBytes || isSigned || editingLocked) return;
      if (activeTool !== TOOL.TEXT_FIELD && activeTool !== TOOL.TEXT) return;
      if (event.target.closest('.draft-overlay')) return;

      const canvas = event.target.closest('canvas');
      if (!canvas) return;

      event.preventDefault();
      const pageIndex = Number(canvas.dataset.pageIndex || 0);
      const rect = canvas.getBoundingClientRect();
      const startX = event.clientX - rect.left;
      const startY = event.clientY - rect.top;

      if (activeTool === TOOL.TEXT_FIELD) {
        textFieldDragRef.current = {
          pageIndex,
          rect,
          startX,
          startY,
          didDrag: false
        };

        setTextFieldDraft({
          pageIndex,
          x: startX,
          y: startY,
          width: 1,
          height: 1
        });

        window.addEventListener('pointermove', handleTextFieldPointerMove);
        window.addEventListener('pointerup', handleTextFieldPointerUp);
      } else if (activeTool === TOOL.TEXT) {
        textDragRef.current = {
          pageIndex,
          rect,
          startX,
          startY,
          didDrag: false
        };

        setTextDraftBox({
          pageIndex,
          x: startX,
          y: startY,
          width: 1,
          height: 1
        });

        window.addEventListener('pointermove', handleTextPointerMove);
        window.addEventListener('pointerup', handleTextPointerUp);
      }
    },
    [
      activeTool,
      editingLocked,
      isSigned,
      pdfBytes,
      handleTextFieldPointerMove,
      handleTextFieldPointerUp,
      handleTextPointerMove,
      handleTextPointerUp
    ]
  );


  useEffect(() => {
    if (activeTool === TOOL.TEXT_FIELD || activeTool === TOOL.TEXT) return;
    if (textFieldDragRef.current) {
      textFieldDragRef.current = null;
    }
    setTextFieldDraft(null);
    window.removeEventListener('pointermove', handleTextFieldPointerMove);
    window.removeEventListener('pointerup', handleTextFieldPointerUp);
    if (textDragRef.current) {
      textDragRef.current = null;
    }
    setTextDraftBox(null);
    window.removeEventListener('pointermove', handleTextPointerMove);
    window.removeEventListener('pointerup', handleTextPointerUp);
  }, [
    activeTool,
    handleTextFieldPointerMove,
    handleTextFieldPointerUp,
    handleTextPointerMove,
    handleTextPointerUp
  ]);
  
  const handleFieldCommit = async (field) => {
    const value = fieldDrafts[field.name];
    const nextBytes = await setFormFieldValue(pdfBytes, field.name, value);
    setPdfBytes(nextBytes);
  };

  const handleCheckboxCommit = async (field, checked) => {
    const nextDrafts = { ...fieldDrafts, [field.name]: checked };
    setFieldDrafts(nextDrafts);
    const nextBytes = await setFormFieldValue(pdfBytes, field.name, checked);
    setPdfBytes(nextBytes);
  };

  const handleThumbClick = (index) => {
    const target = pageElementsRef.current[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleLoadCertificate = async () => {
    setSignError('');
    if (window.pdfApi?.openCertificate) {
      const result = await window.pdfApi.openCertificate();
      if (!result) return;
      setCertificateName(result.name || 'certificate.p12');
      setCertificateData(result.data || '');
      return;
    }
  };

  const handleCreateCertificate = async () => {
    if (!canCreateCertificate) {
      flashStatus(
        hasDesktopBridge
          ? 'Desktop bridge is out of date. Please restart the desktop app.'
          : 'Certificate creation is only available in the desktop app.'
      );
      return;
    }
    const result = await window.pdfApi.createCertificate(certForm);
    if (!result) return;
    if (result.error) {
      flashStatus(result.error);
      return;
    }
    setCertificateName(result.name || 'certificate.p12');
    setCertificateData(result.data || '');
    setCertificatePassword(certForm.password || '');
    setShowCertModal(false);
    flashStatus('Certificate created.', 'success');
  };

  const updateDraft = useCallback((draftId, updates) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === draftId ? { ...draft, ...updates } : draft))
    );
  }, []);

  const removeDraft = useCallback((draftId) => {
    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    setSelectedDraftId((current) => (current === draftId ? null : current));
  }, []);

  const clampDraft = useCallback((next) => {
    const viewport = pageViewportsRef.current[next.pageIndex];
    if (!viewport) return next;
    const width = Math.min(next.width, viewport.width);
    const height = Math.min(next.height, viewport.height);
    const maxX = Math.max(0, viewport.width - width);
    const maxY = Math.max(0, viewport.height - height);

    return {
      ...next,
      width,
      height,
      x: clamp(next.x, 0, maxX),
      y: clamp(next.y, 0, maxY)
    };
  }, []);

  const handleDraftPointerDown = (event, draft) => {
    if (editingLocked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedDraftId(draft.id);

    dragStateRef.current = {
      id: draft.id,
      startX: event.clientX,
      startY: event.clientY,
      draft,
      mode: 'move',
      handle: ''
    };

    window.addEventListener('pointermove', handleDraftPointerMove);
    window.addEventListener('pointerup', handleDraftPointerUp);
  };

  const handleDraftHandlePointerDown = (event, draft, handle) => {
    if (editingLocked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedDraftId(draft.id);

    dragStateRef.current = {
      id: draft.id,
      startX: event.clientX,
      startY: event.clientY,
      draft,
      mode: 'resize',
      handle
    };

    window.addEventListener('pointermove', handleDraftPointerMove);
    window.addEventListener('pointerup', handleDraftPointerUp);
  };

  const handleDraftPointerMove = (event) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const minSize = drag.draft.type === TOOL.CHECKBOX ? 18 : 36;

    let next = { ...drag.draft };

    if (drag.mode === 'move') {
      next.x = drag.draft.x + deltaX;
      next.y = drag.draft.y + deltaY;
    } else if (drag.mode === 'resize') {
      if (drag.handle.includes('e')) {
        next.width = Math.max(minSize, drag.draft.width + deltaX);
      }
      if (drag.handle.includes('s')) {
        next.height = Math.max(minSize, drag.draft.height + deltaY);
      }
      if (drag.handle.includes('w')) {
        const newWidth = Math.max(minSize, drag.draft.width - deltaX);
        next.x = drag.draft.x + (drag.draft.width - newWidth);
        next.width = newWidth;
      }
      if (drag.handle.includes('n')) {
        const newHeight = Math.max(minSize, drag.draft.height - deltaY);
        next.y = drag.draft.y + (drag.draft.height - newHeight);
        next.height = newHeight;
      }
    }

    next = clampDraft(next);
    setDrafts((current) =>
      current.map((draft) => (draft.id === drag.id ? next : draft))
    );
  };

  const handleDraftPointerUp = () => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handleDraftPointerMove);
    window.removeEventListener('pointerup', handleDraftPointerUp);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img" focusable="false">
              <path
                d="M6 28h16l6-10h20l4 6h6v10H44l-4 6H18l-6-6H6V28z"
                fill="currentColor"
              />
              <path d="M10 40h28l6 6H16l-6-6z" fill="currentColor" />
              <rect x="22" y="46" width="12" height="10" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1>FillForge</h1>
          </div>
        </div>
        <div className="toolbar">
          <button
            className={activeTool === TOOL.PAN ? 'icon-button active' : 'icon-button'}
            onClick={() => setActiveTool(TOOL.PAN)}
            title="Select"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 3l6 14 2.5-5.5L19 11 5 3z"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            className={activeTool === TOOL.TEXT ? 'icon-button active' : 'icon-button'}
            onClick={() => setActiveTool(TOOL.TEXT)}
            title="Text"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 6V4h16v2h-7v14h-2V6H4z"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            className={
              activeTool === TOOL.TEXT_FIELD ? 'icon-button active' : 'icon-button'
            }
            onClick={() => setActiveTool(TOOL.TEXT_FIELD)}
            title="Text Field"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor" />
              <rect x="7" y="9" width="10" height="2" fill="#111" />
              <rect x="7" y="13" width="6" height="2" fill="#111" />
            </svg>
          </button>
          <button
            className={
              activeTool === TOOL.CHECKBOX ? 'icon-button active' : 'icon-button'
            }
            onClick={() => setActiveTool(TOOL.CHECKBOX)}
            title="Checkbox"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" />
              <path
                d="M7 12l3 3 7-7"
                stroke="#111"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className={
              activeTool === TOOL.SIGNATURE ? 'icon-button active' : 'icon-button'
            }
            onClick={() => setActiveTool(TOOL.SIGNATURE)}
            title="Sign"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 15c3-4 6-6 9-3 2 2 4 2 7-2"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M3 19h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {statusMessage && (
          <div className={`status-pill ${statusMessage.tone}`}>
            {statusMessage.message}
          </div>
        )}
        <div className="actions">
          <div className="zoom-controls topbar-zoom">
            <button
              className="ghost zoom-trigger"
              onClick={() => setShowZoom((current) => !current)}
            >
              {Math.round(scale * 100)}%
            </button>
            {showZoom && (
              <div className="zoom-pop">
                <input
                  type="range"
                  min="0.6"
                  max="2"
                  step="0.05"
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFilePick}
            hidden
          />
          <button className="ghost" onClick={handleOpenDialog}>
            Open PDF
          </button>
          <button className="ghost" onClick={handleNewBlank}>
            New Blank
          </button>
          <button className="primary" onClick={handleExport}>
            Export PDF
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="thumbrail">
          <div className="thumbrail-header">
            <h3>Pages</h3>
            <span>{pageCount || '—'}</span>
          </div>
          <div className="thumbrail-list">
            {thumbnails.map((thumb) => (
              <button
                key={thumb.pageIndex}
                className={
                  activePageIndex === thumb.pageIndex ? 'thumb active' : 'thumb'
                }
                onClick={() => handleThumbClick(thumb.pageIndex)}
              >
                <img src={thumb.url} alt={`Page ${thumb.pageIndex + 1}`} />
                <span>{thumb.pageIndex + 1}</span>
              </button>
            ))}
          </div>
        </aside>

        <section
          className="viewer"
          onClick={handleCanvasClick}
          onPointerDown={handleViewerPointerDown}
        >
          {!pdfBytes && (
            <div className="empty-state">
              <h2>Start a new PDF workflow</h2>
              <p>{emptyDocTips[Math.floor(Math.random() * emptyDocTips.length)]}</p>
              <div className="empty-actions">
                <button className="primary" onClick={handleOpenDialog}>
                  Open a PDF
                </button>
                <button className="ghost" onClick={handleNewBlank}>
                  Create blank PDF
                </button>
              </div>
            </div>
          )}
          <div className="viewer-scroll" ref={viewerScrollRef}>
            {drafts.map((draft) => {
              const offset = pageOffsetsRef.current[draft.pageIndex];
              if (!offset) return null;
              const isSelected = draft.id === selectedDraftId;
              const style = {
                left: offset.left + draft.x,
                top: offset.top + draft.y,
                width: draft.width,
                height: draft.height
              };

              return (
                <div
                  key={draft.id}
                  className={`draft-overlay ${draft.type === TOOL.TEXT ? 'text-draft' : ''} ${
                    isSelected ? 'selected' : ''
                  }`}
                  style={style}
                  data-draft-id={draft.id}
                  onPointerDown={(event) => handleDraftPointerDown(event, draft)}
                >
                  {draft.type === TOOL.TEXT && (
                    <>
                      {isSelected && !editingLocked && (
                        <div
                          className="text-toolbar"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <button
                            className={draft.fontWeight === 'bold' ? 'active' : ''}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateDraft(draft.id, {
                                fontWeight:
                                  draft.fontWeight === 'bold' ? 'normal' : 'bold'
                              });
                            }}
                            type="button"
                          >
                            B
                          </button>
                          <button
                            className={draft.fontStyle === 'italic' ? 'active' : ''}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateDraft(draft.id, {
                                fontStyle:
                                  draft.fontStyle === 'italic' ? 'normal' : 'italic'
                              });
                            }}
                            type="button"
                          >
                            I
                          </button>
                          <button
                            className={draft.underline ? 'active' : ''}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateDraft(draft.id, {
                                underline: !draft.underline
                              });
                            }}
                            type="button"
                          >
                            U
                          </button>
                          <select
                            value={draft.fontFamily || 'helvetica'}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateDraft(draft.id, { fontFamily: event.target.value });
                            }}
                          >
                            {textFontOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="10"
                            max="48"
                            value={draft.size || 16}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateDraft(draft.id, {
                                size: Number(event.target.value) || 16
                              });
                            }}
                          />
                          <input
                            type="color"
                            value={draft.color || '#0d1117'}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateDraft(draft.id, { color: event.target.value });
                            }}
                          />
                        </div>
                      )}
                      <div
                        className="draft-text"
                        contentEditable={!editingLocked}
                        suppressContentEditableWarning
                        data-placeholder="Type here"
                        style={{
                          fontSize: draft.size || 16,
                          fontFamily:
                            draft.fontFamily === 'times'
                              ? "'Times New Roman', serif"
                              : draft.fontFamily === 'courier'
                                ? "'Courier New', monospace"
                                : "'Helvetica Neue', Arial, sans-serif",
                          fontWeight: draft.fontWeight || 'normal',
                          fontStyle: draft.fontStyle || 'normal',
                          textDecoration: draft.underline ? 'underline' : 'none',
                          color: draft.color || '#0d1117'
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onFocus={() => setSelectedDraftId(draft.id)}
                        onInput={(event) =>
                          updateDraft(draft.id, {
                            text: event.currentTarget.textContent || ''
                          })
                        }
                      >
                        {draft.text}
                      </div>
                    </>
                  )}
                  {draft.type === TOOL.TEXT_FIELD && (
                    <span className="draft-label">
                      {draft.fieldName || 'Text field'}
                    </span>
                  )}
                  {draft.type === TOOL.CHECKBOX && (
                    <div className="draft-checkbox" />
                  )}
                  {draft.type === TOOL.SIGNATURE && draft.dataUrl && (
                    <img src={draft.dataUrl} alt="Signature" />
                  )}

                  {isSelected && !editingLocked && (
                    <>
                      <button
                        className="handle handle-nw"
                        onPointerDown={(event) =>
                          handleDraftHandlePointerDown(event, draft, 'nw')
                        }
                      />
                      <button
                        className="handle handle-ne"
                        onPointerDown={(event) =>
                          handleDraftHandlePointerDown(event, draft, 'ne')
                        }
                      />
                      <button
                        className="handle handle-sw"
                        onPointerDown={(event) =>
                          handleDraftHandlePointerDown(event, draft, 'sw')
                        }
                      />
                      <button
                        className="handle handle-se"
                        onPointerDown={(event) =>
                          handleDraftHandlePointerDown(event, draft, 'se')
                        }
                      />
                    </>
                  )}
                </div>
              );
            })}
            {textFieldDraft && activeTool === TOOL.TEXT_FIELD && (
              (() => {
                const offset = pageOffsetsRef.current[textFieldDraft.pageIndex];
                if (!offset) return null;
                const style = {
                  left: offset.left + textFieldDraft.x,
                  top: offset.top + textFieldDraft.y,
                  width: textFieldDraft.width,
                  height: textFieldDraft.height
                };
                return (
                  <div className="draft-overlay drafting" style={style}>
                    <span className="draft-label">
                      {fieldNameDraft.trim() || 'Text field'}
                    </span>
                  </div>
                );
              })()
            )}
            {textDraftBox && activeTool === TOOL.TEXT && (
              (() => {
                const offset = pageOffsetsRef.current[textDraftBox.pageIndex];
                if (!offset) return null;
                const style = {
                  left: offset.left + textDraftBox.x,
                  top: offset.top + textDraftBox.y,
                  width: textDraftBox.width,
                  height: textDraftBox.height
                };
                return (
                  <div className="draft-overlay drafting text-draft" style={style}>
                    <div className="draft-text" data-placeholder="Type here">
                      {textDraft.trim() || 'Text'}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
          {isRendering && <div className="loading-overlay">Rendering pages…</div>}
          {editingLocked && (
            <div className="signed-banner">
              Digitally signed. Editing is locked to preserve signature validity.
            </div>
          )}
        </section>

        <aside className="inspector">
          <div className="panel">
            <h3>Document</h3>
            <div className="panel-row">
              <span>File</span>
              <strong>{pdfName}</strong>
            </div>
            <div className="panel-row">
              <span>Pages</span>
              <strong>{pageCount || '—'}</strong>
            </div>
            <div className="panel-row">
              <span>Status</span>
              <strong>{isSigned ? 'Signed' : 'Editable'}</strong>
            </div>
          </div>

          <div className="panel">
            <h3>Tool settings</h3>
            {activeTool === TOOL.TEXT && (
              <div className="panel-stack">
                <div className="hint">
                  Click and drag on the PDF to draw a text box. Edit directly on the
                  page with the floating toolbar.
                </div>
              </div>
            )}

            {activeTool === TOOL.TEXT_FIELD && (
              <div className="panel-stack">
                <label>Field name</label>
                <input
                  value={fieldNameDraft}
                  onChange={(event) => setFieldNameDraft(event.target.value)}
                  placeholder="Auto-generated if blank"
                  disabled={editingLocked}
                />
                <div className="hint">
                  Click and drag on the PDF to draw the text field.
                </div>
              </div>
            )}

            {activeTool === TOOL.CHECKBOX && (
              <div className="panel-stack">
                <label>Field name</label>
                <input
                  value={fieldNameDraft}
                  onChange={(event) => setFieldNameDraft(event.target.value)}
                  placeholder="Auto-generated if blank"
                  disabled={editingLocked}
                />
                <div className="hint">
                  Click the PDF to place. Drag or resize until export.
                </div>
              </div>
            )}

            {activeTool === TOOL.SIGNATURE && (
              <div className="panel-stack">
                <label>Signature</label>
                {signatureDataUrl ? (
                  <img src={signatureDataUrl} alt="Signature" className="signature-preview" />
                ) : (
                  <div className="placeholder">No signature yet.</div>
                )}
                <button
                  className="ghost"
                  onClick={() => setShowSignatureModal(true)}
                  disabled={editingLocked}
                >
                  Create signature
                </button>
                <div className="hint">
                  Click the PDF to place. Drag or resize until export.
                </div>
                <label>Certificate (P12/PFX)</label>
                <div className="row">
                  <button
                    className="ghost"
                    onClick={handleLoadCertificate}
                    disabled={editingLocked}
                  >
                    Load certificate
                  </button>
                  <button
                    className="ghost"
                    onClick={() => setShowCertModal(true)}
                    disabled={editingLocked || !canCreateCertificate}
                  >
                    Create certificate
                  </button>
                  <span className="chip">
                    {certificateName || 'Not loaded'}
                  </span>
                </div>
                <label>Password</label>
                <input
                  type="password"
                  value={certificatePassword}
                  onChange={(event) => setCertificatePassword(event.target.value)}
                  placeholder="Optional passphrase"
                  disabled={editingLocked}
                />
                <label>Signer name</label>
                <input
                  value={signerName}
                  onChange={(event) => setSignerName(event.target.value)}
                  placeholder="Full name"
                  disabled={editingLocked}
                />
                <label>Reason</label>
                <input
                  value={signReason}
                  onChange={(event) => setSignReason(event.target.value)}
                  placeholder="Approval, agreement, etc."
                  disabled={editingLocked}
                />
                <label>Location</label>
                <input
                  value={signLocation}
                  onChange={(event) => setSignLocation(event.target.value)}
                  placeholder="City, State"
                  disabled={editingLocked}
                />
                <label>Contact</label>
                <input
                  value={signContact}
                  onChange={(event) => setSignContact(event.target.value)}
                  placeholder="Email or phone"
                  disabled={editingLocked}
                />
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={includeVisualSignature}
                    onChange={(event) => setIncludeVisualSignature(event.target.checked)}
                    disabled={editingLocked}
                  />
                  Include signature image
                </label>
                <div className="hint">
                  Export applies the digital signature if a certificate is loaded.
                </div>
                {signError && <p className="error-text">{signError}</p>}
                <p className="hint">
                  Digital signing locks edits to keep the signature valid.
                </p>
              </div>
            )}
          </div>

          {selectedDraft && (
            <div className="panel">
              <h3>Selected element</h3>
              <div className="panel-row">
                <span>Type</span>
                <strong>{selectedDraft.type}</strong>
              </div>
              <div className="panel-row">
                <span>Page</span>
                <strong>{selectedDraft.pageIndex + 1}</strong>
              </div>
              {selectedDraft.type === TOOL.TEXT && (
                <div className="panel-stack">
                  <p className="hint">
                    Edit text directly on the page. Use the floating toolbar for
                    styling.
                  </p>
                </div>
              )}
              {(selectedDraft.type === TOOL.TEXT_FIELD ||
                selectedDraft.type === TOOL.CHECKBOX) && (
                <div className="panel-stack">
                  <label>Field name</label>
                  <input
                    value={selectedDraft.fieldName || ''}
                    onChange={(event) =>
                      updateDraft(selectedDraft.id, { fieldName: event.target.value })
                    }
                    disabled={editingLocked}
                  />
                </div>
              )}
              {selectedDraft.type === TOOL.SIGNATURE && (
                <div className="panel-stack">
                  <label>Signature preview</label>
                  {selectedDraft.dataUrl ? (
                    <img
                      src={selectedDraft.dataUrl}
                      alt="Signature"
                      className="signature-preview"
                    />
                  ) : (
                    <div className="placeholder">No signature data.</div>
                  )}
                </div>
              )}
              <button
                className="ghost"
                onClick={() => removeDraft(selectedDraft.id)}
                disabled={editingLocked}
              >
                Remove element
              </button>
            </div>
          )}

          <div className="panel">
            <h3>Form fields</h3>
            {formFields.length === 0 ? (
              <p className="muted">No form fields found.</p>
            ) : (
              <div className="field-list">
                {formFields.map((field) => (
                  <div className="field-item" key={field.name}>
                    <div className="field-header">
                      <strong>{field.name}</strong>
                      <span>{field.type}</span>
                    </div>
                    {field.type === 'text' && (
                      <input
                        value={fieldDrafts[field.name] ?? ''}
                        onChange={(event) =>
                          setFieldDrafts({
                            ...fieldDrafts,
                            [field.name]: event.target.value
                          })
                        }
                        onBlur={() => handleFieldCommit(field)}
                        disabled={editingLocked}
                      />
                    )}
                    {field.type === 'checkbox' && (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={Boolean(fieldDrafts[field.name])}
                          onChange={(event) =>
                            handleCheckboxCommit(field, event.target.checked)
                          }
                          disabled={editingLocked}
                        />
                        Mark checked
                      </label>
                    )}
                    {(field.type === 'dropdown' || field.type === 'option-list') && (
                      <select
                        value={fieldDrafts[field.name] ?? ''}
                        onChange={(event) => {
                          setFieldDrafts({
                            ...fieldDrafts,
                            [field.name]: event.target.value
                          });
                        }}
                        onBlur={() => handleFieldCommit(field)}
                        disabled={editingLocked}
                      >
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    {field.type === 'radio' && (
                      <input
                        value={fieldDrafts[field.name] ?? ''}
                        onChange={(event) =>
                          setFieldDrafts({
                            ...fieldDrafts,
                            [field.name]: event.target.value
                          })
                        }
                        onBlur={() => handleFieldCommit(field)}
                        placeholder="Selected value"
                        disabled={editingLocked}
                      />
                    )}
                    {field.type === 'unknown' && (
                      <p className="muted">Unsupported field type.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>

      <SignatureModal
        open={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={(dataUrl) => {
          setSignatureDataUrl(dataUrl);
          setShowSignatureModal(false);
        }}
      />

      {showCertModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>Create signing certificate</h3>
                <p>Generate a self-signed certificate for testing or internal use.</p>
              </div>
              <button className="ghost" onClick={() => setShowCertModal(false)}>
                Close
              </button>
            </div>
            <div className="panel-stack">
              <label>Common name</label>
              <input
                value={certForm.commonName}
                onChange={(event) =>
                  setCertForm({ ...certForm, commonName: event.target.value })
                }
                placeholder="Full name"
              />
              <label>Organization</label>
              <input
                value={certForm.organization}
                onChange={(event) =>
                  setCertForm({ ...certForm, organization: event.target.value })
                }
                placeholder="Company"
              />
              <label>Org unit</label>
              <input
                value={certForm.orgUnit}
                onChange={(event) =>
                  setCertForm({ ...certForm, orgUnit: event.target.value })
                }
                placeholder="Department"
              />
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Country</label>
                  <input
                    value={certForm.country}
                    onChange={(event) =>
                      setCertForm({ ...certForm, country: event.target.value })
                    }
                    placeholder="US"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>State</label>
                  <input
                    value={certForm.state}
                    onChange={(event) =>
                      setCertForm({ ...certForm, state: event.target.value })
                    }
                    placeholder="CA"
                  />
                </div>
              </div>
              <label>City</label>
              <input
                value={certForm.locality}
                onChange={(event) =>
                  setCertForm({ ...certForm, locality: event.target.value })
                }
                placeholder="San Francisco"
              />
              <label>Email</label>
              <input
                value={certForm.email}
                onChange={(event) =>
                  setCertForm({ ...certForm, email: event.target.value })
                }
                placeholder="you@company.com"
              />
              <label>Password</label>
              <input
                type="password"
                value={certForm.password}
                onChange={(event) =>
                  setCertForm({ ...certForm, password: event.target.value })
                }
                placeholder="Required to protect the certificate"
              />
              <label>Validity (years)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={certForm.validityYears}
                onChange={(event) =>
                  setCertForm({
                    ...certForm,
                    validityYears: Number(event.target.value)
                  })
                }
              />
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setShowCertModal(false)}>
                Cancel
              </button>
              <button className="primary" onClick={handleCreateCertificate}>
                Generate certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
