import { useReveal } from '../../hooks/useReveal';
import EcgDivider from '../molecules/EcgDivider';

// Roktim, introduced on the public page.
//
// THE TENSION THIS SECTION HAS TO HOLD
//
// It is meant to look like a product launch, and Roktim ships a documented
// negative result: nothing beat naive persistence across 72 walk-forward
// evaluations, and there is no live admissions feed. Hype over that would
// be found out in about ten seconds by anyone who opens the model card.
//
// So the craft is loud and the claims are exact. The headline owns the
// limitation rather than hiding from it, BETA sits next to the wordmark as
// ROKTIM_UI_SPEC.md §1 requires on every surface, and the seasonal-only
// caveat is body text in its own card rather than a footnote.
//
// REMOVABILITY
//
// Per the spec's removability test, deleting Roktim means dropping one
// table, one route file and one folder. This component is a fourth thing,
// so it is deliberately self-contained: it imports nothing from src/roktim/
// and holds no state. Removing the module means deleting this file and its
// two lines in Landing.jsx.

const MODEL_FACTS = [
  { value: '1,639', label: 'SOURCE PDFS' },
  { value: '72', label: 'WALK-FORWARD EVALS' },
  { value: '64', label: 'DISTRICTS' },
  { value: '41–91', suffix: '%', label: 'COVERAGE, PER DISTRICT' },
];

export default function RoktimLaunchSection() {
  const introRef = useReveal();
  const curveRef = useReveal();
  const caveatRef = useReveal();
  const factsRef = useReveal({ stagger: true });

  // Fixed positions rather than random so the field is identical on every
  // render and across a rebuild. Random sparkles look the same to a viewer
  // and make the component non-deterministic to screenshot or diff.
  const sparks = [
    [6, 12, 2, 0], [14, 78, 1.5, 1.2], [22, 34, 2.5, 2.1], [29, 62, 1.5, 0.6],
    [35, 8, 2, 3.0], [41, 88, 1.5, 1.8], [47, 25, 2.5, 0.3], [53, 70, 2, 2.6],
    [58, 45, 1.5, 1.1], [64, 15, 2, 3.3], [70, 82, 2.5, 0.9], [76, 38, 1.5, 2.3],
    [82, 58, 2, 1.5], [88, 20, 1.5, 3.6], [92, 74, 2.5, 0.4], [18, 50, 2, 2.9],
  ];

  return (
    <section id="roktim" className="relative overflow-hidden" style={{ background: '#0B0912' }}>
      <div className="rkl-mesh">
        <div className="rkl-bloom" style={{ width: 560, height: 560, top: -160, left: -120 }} />
        <div className="rkl-bloom" style={{ width: 460, height: 460, bottom: -140, right: -100, animationDelay: '-22s' }} />
        <div className="rkl-bloom" style={{ width: 380, height: 380, top: '38%', left: '46%', animationDelay: '-44s', opacity: 0.32 }} />
      </div>

      {/* The seams. A heartbeat at the boundary rather than a gradient
          fade: this section sits between two greens, and something had to
          carry the eye across without pretending the colours are related. */}
      <EcgDivider position="top" />
      <EcgDivider position="bottom" />

      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {sparks.map(([top, left, size, delay]) => (
          <span
            key={`${top}-${left}`}
            className="rk-sparkle"
            style={{ top: `${top}%`, left: `${left}%`, width: size, height: size, animationDelay: `${delay}s` }}
          />
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-32 pb-32 relative">
        <div ref={introRef} className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2.5 rkl-pill px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#8474CE', boxShadow: '0 0 8px #8474CE' }} />
            <span className="mono text-[11px] tracking-wide" style={{ color: '#C4B8F5' }}>INTRODUCING</span>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <svg width="56" height="56" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="rk-hero-stroke" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#4A3F7A" />
                  <stop offset="42%" stopColor="#8474CE" />
                  <stop offset="68%" stopColor="#C4B8F5" />
                  <stop offset="100%" stopColor="#7A6BC0" />
                  <animateTransform
                    attributeName="gradientTransform" type="translate"
                    values="-.12 0; .12 0; -.12 0" dur="7s" repeatCount="indefinite"
                  />
                </linearGradient>
                <filter id="rk-hero-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="3.2" />
                </filter>
              </defs>
              <path
                d="M8 80 C28 78 38 74 48 62 C58 50 62 24 74 24 C84 24 88 46 92 58"
                stroke="url(#rk-hero-stroke)" strokeWidth="7" strokeLinecap="round"
                filter="url(#rk-hero-glow)" opacity="0.85"
              />
              <path
                d="M8 80 C28 78 38 74 48 62 C58 50 62 24 74 24 C84 24 88 46 92 58"
                stroke="url(#rk-hero-stroke)" strokeWidth="7" strokeLinecap="round" className="rkl-draw"
              />
            </svg>
            <div className="flex items-center gap-2.5">
              <span className="font-display font-bold text-4xl rkl-grad-text">Roktim</span>
              <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: '#2A2640', color: '#C4B8F5' }}>
                BETA
              </span>
            </div>
          </div>

          <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight mb-5" style={{ color: '#E8E3FB' }}>
            An advisory module that tells you<br className="hidden sm:block" /> when{' '}
            <span className="rkl-grad-text">not</span> to trust it.
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#9A93B8' }}>
            Roktim forecasts dengue hospital admissions per district and turns them into an expected
            blood-demand band, so an elective procedure can be scheduled around a surge instead of into one.
          </p>
        </div>

        <div ref={curveRef} className="rkl-card mt-14 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <p className="font-display font-semibold text-lg" style={{ color: '#E8E3FB' }}>
                Dhaka · seasonal demand outlook
              </p>
              <p className="mono text-[11px] mt-1" style={{ color: '#6E6790' }}>
                Expected admissions per week · 80% interval
              </p>
            </div>
            <div className="rkl-pill px-3 py-1.5">
              <span className="mono text-[11px]" style={{ color: '#C4B8F5' }}>PEAK SEASON · EARLY OCTOBER</span>
            </div>
          </div>

          <svg viewBox="0 0 800 220" className="w-full" style={{ maxHeight: 230 }} role="img" aria-label="Seasonal dengue admissions curve for Dhaka">
            <g stroke="#2A2640" strokeWidth="1">
              <line x1="40" y1="30" x2="780" y2="30" />
              <line x1="40" y1="80" x2="780" y2="80" />
              <line x1="40" y1="130" x2="780" y2="130" />
              <line x1="40" y1="180" x2="780" y2="180" />
            </g>
            {/* Uncertainty band behind the line, per the spec's chart table:
                one series, band as part of it, never a second colour. */}
            <path
              d="M40,178 C130,176 190,170 250,150 C310,130 350,70 430,44 C500,22 540,60 610,96 C680,132 730,160 780,170
                 L780,186 C730,176 680,150 610,116 C540,80 500,44 430,66 C350,92 310,150 250,168 C190,184 130,188 40,190 Z"
              fill="#6455A8" fillOpacity="0.22"
            />
            <path
              d="M40,182 C130,180 190,174 250,158 C310,140 350,58 430,54 C500,50 540,84 610,106 C680,128 730,158 780,176"
              fill="none" stroke="#8474CE" strokeWidth="2.6" strokeLinecap="round" className="rkl-draw"
            />
            <g>
              <line x1="430" y1="30" x2="430" y2="196" stroke="#C4B8F5" strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
              <circle cx="430" cy="54" r="5" fill="#C4B8F5" />
              <circle cx="430" cy="54" r="10" fill="none" stroke="#C4B8F5" strokeOpacity="0.35" />
              <text x="430" y="212" textAnchor="middle" fontSize="11" fill="#C4B8F5" fontFamily="IBM Plex Mono">8 Oct</text>
            </g>
            <text x="40" y="212" fontSize="11" fill="#6E6790" fontFamily="IBM Plex Mono">Jan</text>
            <text x="780" y="212" textAnchor="end" fontSize="11" fill="#6E6790" fontFamily="IBM Plex Mono">Dec</text>
          </svg>

          <div className="mt-6 pt-5 flex flex-wrap gap-3" style={{ borderTop: '1px solid #2A2640' }}>
            <p className="text-sm leading-relaxed flex-1 min-w-[260px]" style={{ color: '#9A93B8' }}>
              <span style={{ color: '#E8E3FB' }}>8 October falls in peak dengue season.</span>{' '}
              Demand in this district is historically at its highest in early October. Consider arranging
              donors in advance rather than reserving from stock.
            </p>
            <p className="mono text-[11px] self-end" style={{ color: '#6E6790' }}>
              Based on seasonal history, 2022–2026
            </p>
          </div>
        </div>

        <div ref={caveatRef} className="rkl-card mt-4 p-6 flex flex-wrap items-center gap-4">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: '#2A2640' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C4B8F5" strokeWidth="2" strokeLinecap="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
          <p className="text-sm leading-relaxed flex-1 min-w-[260px]" style={{ color: '#9A93B8' }}>
            <span style={{ color: '#E8E3FB' }}>Roktim is currently seasonal only.</span>{' '}
            It reads historical patterns, not today&apos;s ward. It cannot detect a surge that is happening
            right now, and it says so on every advisory it produces rather than leaving you to assume
            otherwise.
          </p>
        </div>

        <div ref={factsRef} className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {MODEL_FACTS.map((f) => (
            <div key={f.label} className="rkl-card p-5 text-center">
              <p className="font-display font-bold text-2xl" style={{ color: '#E8E3FB' }}>
                {f.value}
                {f.suffix && <span className="text-base">{f.suffix}</span>}
              </p>
              <p className="mono text-[10px] mt-1.5" style={{ color: '#6E6790' }}>{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
