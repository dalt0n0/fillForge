import React, { useEffect, useRef, useState } from 'react';

const signatureFonts = [
  { label: 'Caveat', value: "'Caveat', 'Segoe Script', cursive" },
  { label: 'Pacifico', value: "'Pacifico', 'Segoe Script', cursive" },
  { label: 'Allura', value: "'Allura', 'Segoe Script', cursive" }
];

const SignatureModal = ({ open, onClose, onSave }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState('draw');
  const [signatureText, setSignatureText] = useState('');
  const [signatureFont, setSignatureFont] = useState(signatureFonts[0].value);
  const displayWidth = 520;
  const displayHeight = 180;

  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = displayWidth * ratio;
    canvas.height = displayHeight * ratio;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 3;
    context.strokeStyle = '#0d1117';
    context.clearRect(0, 0, displayWidth, displayHeight);
  }, [open, displayHeight, displayWidth]);

  useEffect(() => {
    if (!open) return;
    setIsDrawing(false);
  }, [open]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const handlePointerDown = (event) => {
    if (mode !== 'draw') return;
    event.preventDefault();
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    const { x, y } = getPoint(event);
    context.beginPath();
    context.moveTo(x, y);
    setIsDrawing(true);
  };

  const handlePointerMove = (event) => {
    if (mode !== 'draw') return;
    if (!isDrawing) return;
    event.preventDefault();
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    const { x, y } = getPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  const renderTextSignature = (textValue, fontFamily) => {
    const textCanvas = document.createElement('canvas');
    textCanvas.width = displayWidth;
    textCanvas.height = displayHeight;
    const context = textCanvas.getContext('2d');
    if (!context) return '';

    context.fillStyle = '#0d1117';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    let fontSize = 56;
    const maxWidth = displayWidth - 24;
    const minFontSize = 28;
    do {
      context.font = `${fontSize}px ${fontFamily}`;
      if (context.measureText(textValue).width <= maxWidth || fontSize <= minFontSize)
        break;
      fontSize -= 2;
    } while (fontSize > minFontSize);

    context.font = `${fontSize}px ${fontFamily}`;
    context.clearRect(0, 0, displayWidth, displayHeight);
    context.fillText(textValue, displayWidth / 2, displayHeight / 2);
    return textCanvas.toDataURL('image/png');
  };

  const handleSave = () => {
    if (mode === 'text') {
      const textValue = signatureText.trim();
      if (!textValue) return;
      const dataUrl = renderTextSignature(textValue, signatureFont);
      if (!dataUrl) return;
      onSave(dataUrl);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3>Create signature</h3>
            <p>Draw by hand or generate a text signature.</p>
          </div>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="signature-mode">
          <button
            className={mode === 'draw' ? 'active' : ''}
            onClick={() => setMode('draw')}
            type="button"
          >
            Draw
          </button>
          <button
            className={mode === 'text' ? 'active' : ''}
            onClick={() => setMode('text')}
            type="button"
          >
            Text
          </button>
        </div>
        {mode === 'draw' ? (
          <div
            className="signature-pad"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <canvas ref={canvasRef} />
          </div>
        ) : (
          <div className="signature-text-panel">
            <div className="panel-stack">
              <label>Signature text</label>
              <input
                value={signatureText}
                onChange={(event) => setSignatureText(event.target.value)}
                placeholder="Type your name"
              />
            </div>
            <div className="panel-stack">
              <label>Style</label>
              <select
                value={signatureFont}
                onChange={(event) => setSignatureFont(event.target.value)}
              >
                {signatureFonts.map((font) => (
                  <option key={font.label} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="signature-text-preview"
              style={{ fontFamily: signatureFont }}
            >
              {signatureText.trim() || 'Preview'}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="ghost" onClick={handleClear} disabled={mode !== 'draw'}>
            Clear
          </button>
          <button className="primary" onClick={handleSave}>
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureModal;
