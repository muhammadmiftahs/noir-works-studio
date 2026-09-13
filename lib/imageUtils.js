// Helper gambar sisi-klien yang dipakai bersama oleh Prompt Generator (upload
// gambar referensi) dan Metadata Generator (upload foto batch). Disatukan di
// sini supaya tidak ada logika duplikat antara dua komponen.

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Gagal membaca file.'));
    r.readAsDataURL(file);
  });
}

// Mengubah ukuran gambar ke maksimal `maxDim` piksel (sisi terpanjang) dan
// mengompresnya jadi JPEG, lalu mengembalikan base64 siap kirim ke Anthropic
// API. Mengecilkan ukuran gambar penting supaya payload request tetap kecil
// dan biaya token vision tidak membengkak.
export function resizeImageToBase64(dataUrl, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const out = canvas.toDataURL('image/jpeg', quality);
      resolve({ base64: out.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar (file mungkin rusak atau formatnya tidak didukung).'));
    img.src = dataUrl;
  });
}
