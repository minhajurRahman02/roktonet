import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { RoktimMark, BetaBadge } from '../RoktimBrand';

// The page's opening. Its job is to say what Roktim is in one line and to put
// the module's real numbers in front of the reader before any chart does.
//
// The four figures are not decoration and not rounded for effect. 1,639 is the
// count of DGHS daily PDFs actually parsed; 72 is the number of walk-forward
// evaluations run in Stage 6B; 80.3% is the MEASURED coverage of an interval
// claiming 80%; 64 is every district in Bangladesh. They are the argument, so
// they lead.

const FIGURES = [
  { value: '1,639', label: 'source PDFs parsed' },
  { value: '72', label: 'walk-forward evaluations' },
  { value: '80.3%', label: 'measured interval coverage' },
  { value: '64', label: 'districts covered' },
];

export default function Hero({ status, generated, schemaVersion }) {
  const online = status === 'ok';

  return (
    <header className="px-5 sm:px-8 pt-24 pb-6 max-w-[1180px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="flex items-center gap-3 mb-5">
          <RoktimMark size={44} glow id="rk-page" />
          <h1 className="font-display font-bold text-[38px] sm:text-[46px] leading-none tracking-[-0.03em] rk-gradient-text">
            Roktim
          </h1>
          <BetaBadge tone="own" className="self-start mt-2" />
        </div>

        <p className="text-[16px] sm:text-[17px] text-roktim-ink max-w-[62ch] leading-relaxed">
          Roktim forecasts dengue-driven blood demand by district and says how confident it is.
          It advises on scheduled requests and never changes one.
        </p>

        <div className="mt-4 flex items-center gap-2.5 text-[12.5px]">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              online ? 'bg-[#8474CE] rk-pulse' : 'bg-roktim-dim'
            }`}
            aria-hidden="true"
          />
          <span className={online ? 'text-roktim-muted' : 'text-roktim-dim'}>
            {online ? 'Forecast service responding' : 'Forecast service not responding'}
          </span>
          {online && generated && (
            <span className="font-mono text-[10.5px] text-roktim-dim">
              model v{schemaVersion} · built {generated}
            </span>
          )}
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-px bg-roktim-hairline rounded-2xl overflow-hidden border border-roktim-hairline">
          {FIGURES.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
              className="bg-roktim-surface/85 backdrop-blur-[2px] px-4 py-4"
            >
              <p className="font-body font-semibold text-[27px] leading-none text-roktim-ink">
                {f.value}
              </p>
              <p className="text-[12px] text-roktim-muted mt-2 leading-snug">{f.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </header>
  );
}

Hero.propTypes = {
  status: PropTypes.string,
  generated: PropTypes.string,
  schemaVersion: PropTypes.number,
};
