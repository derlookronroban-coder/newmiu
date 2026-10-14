import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * ตัวอย่างโค้ด JavaScript / TypeScript สำหรับแก้ไข PDF และแทรกรูปภาพ (PNG/JPG)
 * รองรับทั้ง Web App (React / Next.js / Vite) และ React Native
 */
export async function editPdfWithImages(
  existingPdfBytes: ArrayBuffer | Uint8Array,
  imageBytes: ArrayBuffer | Uint8Array,
  imageType: 'png' | 'jpg'
): Promise<Uint8Array> {
  // 1. โหลดไฟล์ PDF ต้นฉบับเข้าสู่ pdf-lib
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  // 2. ดึงหน้าเอกสารที่ต้องการแก้ไข
  const pages = pdfDoc.getPages();
  const page = pages[0];
  const { height: pageHeight } = page.getSize();

  // 3. Embed รูปภาพสกุล PNG หรือ JPG เข้าไปในหน้า PDF
  const embeddedImage =
    imageType === 'png'
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

  // 4. วาดรูปภาพลงในพิกัดที่ต้องการ (พิกัด PDF นับ (0,0) จากมุมซ้ายล่าง)
  page.drawImage(embeddedImage, {
    x: 80,
    y: pageHeight - 250 - 120,
    width: 180,
    height: 120,
    opacity: 1,
  });

  // 5. การแก้ไขข้อความเดิม (วาดกล่องสีขาวปิดทับคำเดิม แล้วเขียนข้อความใหม่ทับ)
  page.drawRectangle({
    x: 56,
    y: pageHeight - 400,
    width: 280,
    height: 44,
    color: rgb(1, 1, 1),
  });

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('STATUS: APPROVED', {
    x: 64,
    y: pageHeight - 384,
    size: 15,
    font,
    color: rgb(0.11, 0.3, 0.85),
  });

  // 6. บันทึกและส่งออกเป็น Uint8Array
  return await pdfDoc.save();
}