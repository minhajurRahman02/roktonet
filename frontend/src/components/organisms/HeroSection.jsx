export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-primary text-white">
      <div className="blob-a absolute w-96 h-96 rounded-full bg-primary-light opacity-30 -top-24 -left-24" />
      <div className="blob-b absolute w-72 h-72 rounded-full bg-primary-light opacity-20 -bottom-20 -right-10" />

      <div className="max-w-6xl mx-auto px-6 py-24 md:py-28 relative z-10 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="mono text-xs text-white/60 mb-4 tracking-wide">APART FROM ONLY DONOR FINDING</p>
          <h1 className="font-display font-bold text-4xl md:text-5xl leading-tight mb-5">
            Blood allocation <br />optimized, not just <br />searched for.
          </h1>
          <p className="text-white/75 text-base max-w-md mb-8 leading-relaxed">
            RoktoNet tracks real blood inventory across hospitals and banks, then uses a constrained optimization
            engine to decide who gets it — by compatibility, urgency, expiry, and fairness. Donor apps connect
            people. We decide.
          </p>
          <div className="flex gap-3">
            <a
              href="#become-donor"
              className="bg-white text-primary font-medium px-5 py-3 rounded-lg text-sm hover:bg-white/90 transition-colors duration-300"
            >
              Become a donor
            </a>
            <a
              href="#how-it-works"
              className="border border-white/30 text-white font-medium px-5 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors duration-300"
            >
              See how it works
            </a>
          </div>
        </div>

        {/* animated hospital request network -- 4 nodes, each cycling
            through: request bubble pops in -> a blood drop travels in from
            a neighboring hospital -> bubble pops out. Staggered 1.75s apart
            (7s cycle / 4 nodes) so it reads as continuous flow. */}
        <div className="relative" style={{ height: 300 }}>
          <svg className="absolute inset-0 w-full h-full opacity-95" viewBox="0 0 340 260" preserveAspectRatio="xMidYMid meet">
            <path d="M290,50 Q170,10 50,50" fill="none" stroke="#3A6B58" strokeWidth="1.5" />
            <path d="M290,210 Q330,130 290,50" fill="none" stroke="#3A6B58" strokeWidth="1.5" />
            <path d="M50,210 Q170,250 290,210" fill="none" stroke="#3A6B58" strokeWidth="1.5" />
            <path d="M50,50 Q10,130 50,210" fill="none" stroke="#3A6B58" strokeWidth="1.5" />

            {[[50, 50], [290, 50], [290, 210], [50, 210]].map(([x, y]) => (
              <g key={`${x}-${y}`} transform={`translate(${x},${y})`}>
                <rect x="-13" y="-13" width="26" height="26" rx="4" fill="#2E6B57" />
                <rect x="-2" y="-8" width="4" height="16" fill="#F7F8F6" />
                <rect x="-8" y="-2" width="16" height="4" fill="#F7F8F6" />
              </g>
            ))}

            <path className="drop-1" d="M0,-4 C2,-4 4,-2 4,0 C4,2 2,4 0,4 C-2,4 -4,2 -4,0 C-4,-2 -2,-4 0,-4 Z" fill="#E8938C" />
            <path className="drop-2" d="M0,-4 C2,-4 4,-2 4,0 C4,2 2,4 0,4 C-2,4 -4,2 -4,0 C-4,-2 -2,-4 0,-4 Z" fill="#F0C57A" />
            <path className="drop-3" d="M0,-4 C2,-4 4,-2 4,0 C4,2 2,4 0,4 C-2,4 -4,2 -4,0 C-4,-2 -2,-4 0,-4 Z" fill="#E8938C" />
            <path className="drop-4" d="M0,-4 C2,-4 4,-2 4,0 C4,2 2,4 0,4 C-2,4 -4,2 -4,0 C-4,-2 -2,-4 0,-4 Z" fill="#F0C57A" />
          </svg>

          <div className="bubble bubble-1 absolute bg-white text-primary text-xs font-medium rounded-lg px-3 py-2 shadow-md" style={{ left: '2%', top: 0, width: 118, textAlign: 'center' }}>
            Need 2 unit O-!
          </div>
          <div className="bubble bubble-2 absolute bg-white text-primary text-xs font-medium rounded-lg px-3 py-2 shadow-md" style={{ right: 0, top: 0, width: 118, textAlign: 'center' }}>
            Need 1 unit A+!
          </div>
          <div className="bubble bubble-3 absolute bg-white text-primary text-xs font-medium rounded-lg px-3 py-2 shadow-md" style={{ right: 0, bottom: 0, width: 118, textAlign: 'center' }}>
            Need 3 unit B+!
          </div>
          <div className="bubble bubble-4 absolute bg-white text-primary text-xs font-medium rounded-lg px-3 py-2 shadow-md" style={{ left: '2%', bottom: 0, width: 118, textAlign: 'center' }}>
            Need 1 unit AB+!
          </div>
        </div>
      </div>
    </section>
  );
}
