# 📱 iPad PDF Studio (pdf-lib Editor)

เว็บแอปพลิเคชันสำหรับแก้ไขไฟล์ PDF แนบรูปภาพ (PNG/JPG) เซ็นลายเซ็นด้วย Apple Pencil และจัดการหน้ากระดาษ พัฒนาด้วย **React + Tailwind CSS + pdf-lib + PDF.js** รองรับการใช้งานบน **iPadOS (Safari / Web App)** อย่างสมบูรณ์แบบ

## ✨ ฟีเจอร์หลัก (Features)
- 🖼️ **Embed Images (PNG / JPG):** แทรกรูปภาพจากอัลบั้มหรือกล้อง iPad ลงในหน้า PDF ด้วย `pdfDoc.embedPng()` และ `pdfDoc.embedJpg()`
- ✏️ **Edit & Whiteout Text:** เพิ่มกล่องข้อความใหม่ หรือวางกล่องสีขาวปิดทับคำเดิมใน PDF พร้อมรองรับภาษาไทยความละเอียดสูง (Retina DPI)
- ✍️ **Apple Pencil Signature Pad:** วาดลายเซ็นพื้นหลังใสและฝังลงในหน้าเอกสารทันที
- 📄 **Page Management:** เพิ่มหน้าเปล่า (`addPage`), ทำซ้ำหน้า (`copyPages`), หมุนหน้า 90° (`setRotation`), และลบหน้า (`removePage`)
- 📤 **iPad Native Share Sheet:** ส่งออกไฟล์ PDF เข้าแอป **Files, GoodNotes, Notability หรือ AirDrop** ได้โดยตรงผ่าน Web Share API

## 🚀 วิธีติดตั้งและรันโปรเจกต์ (Quick Start)

```bash
git clone https://github.com/your-username/ipad-pdf-studio.git
cd ipad-pdf-studio
npm install
npm run dev -- --host
```

## 📱 วิธีเพิ่มเป็นแอปบนหน้าจอโฮม iPad (Add to Home Screen)
1. เปิดลิงก์เว็บจาก **GitHub Pages** หรือ **Vercel** ด้วยเบราว์เซอร์ **Safari** บน iPad
2. แตะปุ่ม **Share (แชร์)** ด้านบนขวา
3. เลือก **"Add to Home Screen" (เพิ่มไปยังหน้าจอโฮม)** เพื่อใช้งานแบบเต็มจอเหมือนแอป Native