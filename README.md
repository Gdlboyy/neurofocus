# NeuroFocus

App web de **música funcional** (estilo Brain.fm) en un solo archivo HTML. Genera música en el
navegador con modulación de amplitud rápida para inducir concentración, relajación o sueño.

## Cómo usarla

1. Abre https://gdlboyy.github.io/neurofocus/ desde cualquier dispositivo, o `index.html` con doble clic (Chrome, Edge, Firefox o Safari). No necesita internet.
2. Elige un **modo** (la app preselecciona el mundo sonoro y el temporizador recomendados).
3. Pulsa **Play**. Deja pasar al menos 6 minutos; el efecto pleno llega a los ~15.
4. Ajusta volumen, intensidad de los pulsos, mundo sonoro y temporizador a tu gusto.

Cada modo tiene una tarjeta con **para qué sirve**, la frecuencia usada, el **nivel de evidencia**
científica, cómo usarlo y la fuente.

## Qué hay dentro

- 10 modos: Trabajo profundo (16 Hz), Aprendizaje (40 Hz), Enfoque tranquilo (14 Hz),
  Energía (20 Hz), Creatividad (8 Hz), Relajación (10 Hz), Meditación (6 Hz),
  Conciliar el sueño (rampa 10→3 Hz), Sueño profundo (rampa 3→0.8 Hz), Bloqueo de ruido.
- 10 mundos sonoros generados en vivo (sin archivos de audio).
- Reglas de construcción tomadas del estudio de Brain.fm (Communications Biology 2024) y su
  patente US 7,674,224: modulación solo en la banda 200 Hz–1 kHz, alineada al ritmo,
  varias tasas simultáneas, profundidad media, modulación de volumen + filtro + paneo,
  composición sin ganchos y rampas en los modos de sueño.

Diseño y decisiones: `docs/superpowers/specs/2026-09-10-neurofocus-html-design.md`.

## Aviso

No es un tratamiento médico ni sustituye una evaluación profesional de TDAH, insomnio o ansiedad.
No guarda ni envía datos; solo recuerda tus últimos ajustes en tu propio navegador.

## Auditoría de audio (para desarrolladores)

`tools/audit.mjs` graba 10 s de cada modo en Chrome sin ventana y mide: nivel (RMS), brillo
(centroide espectral, % de energía > 4 kHz), clics, variación lenta y —lo importante— cuánto
destaca el pulso a la frecuencia objetivo dentro de la banda 200 Hz–1 kHz (`mod_snr`).
Requiere `npm i playwright` y Chrome instalado. Criterios usados en la última auditoría:
RMS -25 ±2 dB en todos los mundos, centroide < 1 kHz, clics ≈ 0, `mod_snr` > 10.
