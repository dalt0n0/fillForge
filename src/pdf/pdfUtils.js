import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb
} from 'pdf-lib';

const LETTER_PAGE = [612, 792];

const decodeBase64 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const dataUrlToBytes = (dataUrl) => {
  if (!dataUrl) return null;
  const base64 = dataUrl.split(',')[1];
  return decodeBase64(base64);
};

const resolvePage = (pdfDoc, pageIndex) => {
  const pages = pdfDoc.getPages();
  return pages[Math.min(pageIndex, pages.length - 1)] || pages[0];
};

const describeField = (field) => {
  if (field instanceof PDFTextField) {
    return { type: 'text', value: field.getText() || '' };
  }
  if (field instanceof PDFCheckBox) {
    return { type: 'checkbox', value: field.isChecked() };
  }
  if (field instanceof PDFDropdown) {
    return {
      type: 'dropdown',
      value: (field.getSelected() || [])[0] || '',
      options: field.getOptions()
    };
  }
  if (field instanceof PDFOptionList) {
    return {
      type: 'option-list',
      value: (field.getSelected() || [])[0] || '',
      options: field.getOptions()
    };
  }
  if (field instanceof PDFRadioGroup) {
    return {
      type: 'radio',
      value: field.getSelected() || ''
    };
  }
  return { type: 'unknown', value: '' };
};

const resolveFontName = (family, weight, style) => {
  const isBold = weight === 'bold';
  const isItalic = style === 'italic';
  const key = (family || 'helvetica').toLowerCase();

  if (key === 'times') {
    if (isBold && isItalic) return StandardFonts.TimesRomanBoldItalic;
    if (isBold) return StandardFonts.TimesRomanBold;
    if (isItalic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (key === 'courier') {
    if (isBold && isItalic) return StandardFonts.CourierBoldOblique;
    if (isBold) return StandardFonts.CourierBold;
    if (isItalic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique;
  if (isBold) return StandardFonts.HelveticaBold;
  if (isItalic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
};

const hexToRgb = (hex) => {
  if (!hex) return rgb(0.08, 0.1, 0.14);
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return rgb(0.08, 0.1, 0.14);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
};

const wrapText = (text, font, size, maxWidth) => {
  if (!text) return [''];
  if (!maxWidth) return text.split('\n');
  const lines = [];
  const paragraphs = text.split('\n');

  paragraphs.forEach((paragraph, index) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      const lineWidth = font.widthOfTextAtSize(testLine, size);
      if (lineWidth > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line || paragraph === '') {
      lines.push(line);
    }
    if (index < paragraphs.length - 1) {
      lines.push('');
    }
  });

  return lines;
};

export const createBlankPdf = async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage(LETTER_PAGE);
  pdfDoc.setTitle('Untitled FillForge PDF');
  return pdfDoc.save();
};

export const getFormFields = async (bytes) => {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  return form.getFields().map((field) => {
    const info = describeField(field);
    return {
      name: field.getName(),
      type: info.type,
      value: info.value,
      options: info.options || []
    };
  });
};

export const addTextToPdf = async (
  bytes,
  {
    pageIndex,
    x,
    y,
    text,
    size,
    fontFamily,
    fontWeight,
    fontStyle,
    underline,
    color,
    maxWidth,
    lineHeight
  }
) => {
  const pdfDoc = await PDFDocument.load(bytes);
  const page = resolvePage(pdfDoc, pageIndex);
  const fontName = resolveFontName(fontFamily, fontWeight, fontStyle);
  const font = await pdfDoc.embedFont(fontName);
  const ink = hexToRgb(color);

  const effectiveSize = size || 12;
  const effectiveLineHeight = lineHeight || effectiveSize * 1.2;
  const lines = wrapText(text || '', font, effectiveSize, maxWidth);

  lines.forEach((line, index) => {
    const lineY = y - index * effectiveLineHeight;
    page.drawText(line, {
      x,
      y: lineY,
      size: effectiveSize,
      font,
      color: ink
    });

    if (underline) {
      const width = font.widthOfTextAtSize(line || '', effectiveSize);
      const thickness = Math.max(effectiveSize / 16, 0.8);
      page.drawLine({
        start: { x, y: lineY - 2 },
        end: { x: x + width, y: lineY - 2 },
        thickness,
        color: ink
      });
    }
  });

  return pdfDoc.save();
};

export const addTextFieldToPdf = async (
  bytes,
  { pageIndex, x, y, width, height, name }
) => {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const page = resolvePage(pdfDoc, pageIndex);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fieldName = name || `TextField-${Date.now()}`;
  const textField = form.createTextField(fieldName);
  textField.addToPage(page, { x, y, width, height });
  form.updateFieldAppearances(font);

  return pdfDoc.save();
};

export const addCheckBoxToPdf = async (
  bytes,
  { pageIndex, x, y, size, name }
) => {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const page = resolvePage(pdfDoc, pageIndex);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fieldName = name || `Checkbox-${Date.now()}`;
  const checkBox = form.createCheckBox(fieldName);
  checkBox.addToPage(page, { x, y, width: size, height: size });
  form.updateFieldAppearances(font);

  return pdfDoc.save();
};

export const setFormFieldValue = async (bytes, fieldName, value) => {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let field = null;
  try {
    field = form.getField(fieldName);
  } catch (error) {
    return bytes;
  }
  if (!field) return bytes;

  if (field instanceof PDFTextField) {
    field.setText(String(value ?? ''));
  } else if (field instanceof PDFCheckBox) {
    if (value) {
      field.check();
    } else {
      field.uncheck();
    }
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    if (value) {
      field.select(String(value));
    }
  } else if (field instanceof PDFRadioGroup) {
    if (value) {
      field.select(String(value));
    }
  }

  form.updateFieldAppearances(font);
  return pdfDoc.save();
};

export const addSignatureToPdf = async (
  bytes,
  { pageIndex, x, y, width, height, dataUrl }
) => {
  const pdfDoc = await PDFDocument.load(bytes);
  const page = resolvePage(pdfDoc, pageIndex);
  const imageBytes = dataUrlToBytes(dataUrl);
  if (!imageBytes) return bytes;

  const pngImage = await pdfDoc.embedPng(imageBytes);
  let targetWidth = width;
  let targetHeight = height;

  if (!targetHeight) {
    const scale = width / pngImage.width;
    targetHeight = pngImage.height * scale;
  } else if (!targetWidth) {
    const scale = height / pngImage.height;
    targetWidth = pngImage.width * scale;
  }

  page.drawImage(pngImage, {
    x,
    y,
    width: targetWidth,
    height: targetHeight
  });

  return pdfDoc.save();
};
