export const LIGHTING_PRESETS = [
  { id: 'none', label: 'Default / AI Bebas', prompt: '' },
  { id: 'golden_hour', label: 'Golden Hour (Hangat Sore)', prompt: 'warm golden hour lighting, long soft shadows, glowing atmospheric backlight' },
  { id: 'volumetric', label: 'God Rays / Volumetric', prompt: 'dramatic volumetric lighting, visible light rays breaking through, atmospheric haze' },
  { id: 'studio_softbox', label: 'Studio Softbox (Komersial)', prompt: 'clean professional studio lighting, dual diffused softboxes, even exposure, subtle fill' },
  { id: 'moody_rim', label: 'Moody Rim Light (Siluet)', prompt: 'cinematic rim lighting, high contrast chiaroscuro, crisp edge highlights, dark backdrop' },
  { id: 'cyber_neon', label: 'Cinematic Neon / Night', prompt: 'vibrant cinematic dual-tone neon lighting, cyan and magenta accents, reflective highlights' },
  { id: 'soft_overcast', label: 'Soft Overcast (Alami Baur)', prompt: 'diffused natural daylight, overcast sky soft illumination, neutral color temperature' },
];

export const LENS_PRESETS = [
  { id: 'none', label: 'Default / AI Bebas', prompt: '' },
  { id: 'lens_35mm', label: '35mm Prime (Dokumenter / Alami)', prompt: 'shot on 35mm prime lens, natural field of view, realistic street photography perspective' },
  { id: 'lens_85mm', label: '85mm Portrait (Bokeh Lembut)', prompt: 'shot on 85mm f/1.4 telephoto lens, shallow depth of field, creamy creamy bokeh background' },
  { id: 'lens_macro', label: 'Macro 100mm (Detail Tekstur)', prompt: 'shot on 100mm macro lens, ultra close-up, extreme micro-texture details in sharp focus' },
  { id: 'lens_wide', label: 'Wide Angle 16mm (Lanskap Luas)', prompt: 'captured with 16mm ultra-wide angle lens, expansive dynamic perspective, deep focus' },
  { id: 'lens_drone', label: 'Drone Top-Down (Aerial Bird-Eye)', prompt: 'aerial drone top-down perspective, high altitude bird-eye composition, structured geometry' },
];

export const FILM_PRESETS = [
  { id: 'none', label: 'Default / AI Bebas', prompt: '' },
  { id: 'kodak_portra', label: 'Kodak Portra 400 (Warna Hangat)', prompt: 'Kodak Portra 400 color profile, warm natural skin tones, fine organic film grain' },
  { id: 'fujifilm_velvia', label: 'Fujifilm Velvia (Saturasi Kaya)', prompt: 'Fujifilm Velvia color science, rich saturated colors, high dynamic contrast' },
  { id: 'clean_hdr', label: 'Crisp Commercial Digital', prompt: 'crisp ultra-sharp commercial digital render, pristine high dynamic range, zero noise' },
  { id: 'bw_grain', label: 'Monokrom Kontras Tinggi', prompt: 'timeless black and white, Ilford HP5 style, deep blacks, rich tonal graduation, subtle grain' },
];

export const PROHIBIT_OPTIONS_IMAGE = [
  { id: 'no_humans', label: 'Tanpa manusia / model', negative: 'people, human face, person, man, woman, crowd, hands' },
  { id: 'no_text', label: 'Tanpa teks / logo / simbol', negative: 'text, typography, words, letters, logos, labels, watermark, signatures' },
  { id: 'no_clutter', label: 'Latar sangat bersih / minimalis', negative: 'cluttered background, messy scene, distracting elements, junk' },
  { id: 'no_dark_shadows', label: 'Tanpa bayangan pekat / keras', negative: 'pitch black shadows, harsh contrast, crushed blacks, underexposed areas' },
  { id: 'no_saturated', label: 'Warna natural (hindari oversaturated)', negative: 'oversaturated colors, radioactive glow, garish chromatic aberration' },
];

export const PROHIBIT_OPTIONS_VIDEO = [
  { id: 'no_humans', label: 'Tanpa manusia / model', negative: 'people, human face, person, man, woman, crowd, hands' },
  { id: 'no_text', label: 'Tanpa teks / subtitle / UI', negative: 'text, typography, subtitles, credits, overlay, watermark, UI elements, labels' },
  { id: 'no_jitter', label: 'Kamera stabil (tanpa goyang tripod)', negative: 'shaky camera, jitter, chaotic motion, rapid unpredictable panning' },
  { id: 'no_morphing', label: 'Tanpa artefak morphing / distort', negative: 'morphing artifacts, melting limbs, warping shapes, flickering textures, frame jitter' },
  { id: 'no_cuts', label: 'Single continuous take (tanpa cut)', negative: 'fast cuts, abrupt scene transition, jump cuts, montage' },
];

export const MOTION_INTENSITY_LEVELS = [
  { level: 1, label: '1 - Nyaris Diam (Subtle / Still)', prompt: 'nearly static shot, extremely subtle micro-movement, gentle organic breathing motion, calm tranquil tempo' },
  { level: 2, label: '2 - Lambat & Tenang (Gentle)', prompt: 'slow gentle natural motion, smooth pacing, tranquil peaceful ambiance, relaxed speed' },
  { level: 3, label: '3 - Sedang / Alami (Balanced)', prompt: 'moderate balanced real-time motion, natural fluid physics, realistic commercial pacing' },
  { level: 4, label: '4 - Dinamis & Aktif (Dynamic)', prompt: 'brisk dynamic motion, active movements, energetic composition, lively visual tempo' },
  { level: 5, label: '5 - Sangat Dramatis (High Energy)', prompt: 'high energy dramatic motion, fast sweeping action, intense cinematic momentum' },
];
