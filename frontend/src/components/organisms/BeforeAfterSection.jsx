export default function BeforeAfterSection() {
  return (
    <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20">
      <h2 className="font-display font-bold text-2xl text-center mb-2 dark:text-textprimary-dark">
        Manual allocation vs. optimized allocation
      </h2>
      <p className="text-gray-500 dark:text-textsecondary-dark text-center mb-10 max-w-xl mx-auto">
        The same request, handled two different ways.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* BEFORE: panicked nurses reporting to a stressed doctor */}
        <div className="hover-card border border-gray-200 dark:border-white/10 rounded-xl p-6 bg-white dark:bg-surface-dark overflow-hidden">
          <p className="mono text-xs text-gray-400 dark:text-textsecondary-dark mb-6">BEFORE — phone calls &amp; guesswork</p>

          <div className="relative" style={{ height: 300 }}>
            {/* doctor: top center, thought bubble above */}
            <div className="absolute" style={{ left: '50%', top: 0, transform: 'translateX(-50%)' }}>
              <div
                className="relative bg-critical-bg text-critical-text text-xs leading-snug rounded-xl px-3 py-2.5 mb-3 text-center"
                style={{ width: 192 }}
              >
                <span className="exclaim-badge">!</span>
                &quot;It&apos;s time to tell the patient he has to find the blood manually, himself.&quot;
                <span className="thought-dots">
                  <span style={{ width: 8, height: 8, left: 24, bottom: -14 }} />
                  <span style={{ width: 5, height: 5, left: 14, bottom: -22 }} />
                </span>
              </div>
              <div className="flex flex-col items-center mx-auto" style={{ width: 60 }}>
                <div className="char-head bg-gray-300" style={{ width: 32, height: 32, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 13, left: 8, width: 4, height: 4, borderRadius: '50%', background: '#3d3d3a' }} />
                  <div style={{ position: 'absolute', top: 13, right: 8, width: 4, height: 4, borderRadius: '50%', background: '#3d3d3a' }} />
                </div>
                <div className="torso bg-primary" style={{ width: 48, height: 44, marginTop: -2 }}>
                  <div className="arm bg-primary" style={{ left: -5, transform: 'rotate(8deg)' }} />
                  <div className="arm bg-primary" style={{ right: -5, transform: 'rotate(-8deg)' }} />
                </div>
              </div>
            </div>

            {/* 3 nurses in a row, bottom */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
              {[
                { text: 'Hospital A calls 4 banks, none pick up', color: '#5B7A8C' },
                { text: "Bank B's stock expires tomorrow — wasted", color: '#6B9080' },
                { text: 'Critical request waits behind a routine one', color: '#B8811F' },
              ].map((nurse) => (
                <div key={nurse.text} className="flex flex-col items-center" style={{ width: 88 }}>
                  <div
                    className="relative bg-critical-bg text-critical-text text-[11px] leading-snug rounded-lg px-2.5 py-2 mb-2 speech-tail-down text-center"
                    style={{ '--tail-color': '#FBEAEA', width: 88 }}
                  >
                    <span className="exclaim-badge" style={{ width: 15, height: 15, fontSize: 9 }}>
                      !
                    </span>
                    {nurse.text}
                  </div>
                  <div className="char-head bg-gray-300 mt-2" style={{ width: 26, height: 26 }} />
                  <div className="torso" style={{ width: 38, height: 32, background: nurse.color, marginTop: -2 }}>
                    <div className="arm" style={{ background: nurse.color, left: -4, height: 16, transform: 'rotate(8deg)' }} />
                    <div className="arm" style={{ background: nurse.color, right: -4, height: 16, transform: 'rotate(-8deg)' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="absolute bottom-0 left-0 right-0 border-t border-dashed border-gray-200 dark:border-white/10" />
          </div>
        </div>

        {/* AFTER: calm doctor at a clearly-resting patient's bedside */}
        <div className="hover-card border border-gray-200 dark:border-white/10 rounded-xl p-6 bg-white dark:bg-surface-dark overflow-hidden">
          <p className="mono text-xs text-gray-400 dark:text-textsecondary-dark mb-6">AFTER — the engine decides in seconds</p>

          <div className="relative flex items-center justify-center gap-8" style={{ height: 300 }}>
            <div className="flex flex-col items-center">
              <div
                className="bg-elective-bg text-elective-text text-xs leading-snug rounded-xl px-3 py-2.5 mb-3 speech-tail-side relative text-center"
                style={{ '--tail-color': '#E9F0EC', width: 160 }}
              >
                &quot;Found your O- blood nearby! Be patient, it&apos;s on the way!&quot;
              </div>
              <div className="char-head bg-gray-300 mt-2" style={{ width: 32, height: 32, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute', top: 13, left: 8, width: 9, height: 4,
                    border: '1.5px solid #3d3d3a', borderTop: 'none', borderRadius: '0 0 9px 9px',
                  }}
                />
              </div>
              <div className="torso bg-primary" style={{ width: 48, height: 44, marginTop: -2 }}>
                <div className="arm bg-primary" style={{ left: -5, transform: 'rotate(8deg)' }} />
                <div className="arm bg-primary" style={{ right: -5, transform: 'rotate(-8deg)' }} />
              </div>
            </div>

            {/* patient clearly lying in bed: pillow, head resting, elongated
                body under blanket, blanket fold lines for readability */}
            <div className="flex flex-col items-center">
              <div style={{ width: 130, height: 60, background: '#E9EFF2', border: '2px solid #5B7A8C', borderRadius: 10, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, left: 6, width: 26, height: 20, background: 'white', borderRadius: 6, border: '1px solid #dbe3e6' }} />
                <div className="char-head bg-gray-300" style={{ width: 20, height: 20, position: 'absolute', top: 10, left: 10 }}>
                  <div style={{ position: 'absolute', top: 9, left: 4, width: 5, height: 1.2, background: '#3d3d3a', borderRadius: 1 }} />
                  <div style={{ position: 'absolute', top: 9, right: 4, width: 5, height: 1.2, background: '#3d3d3a', borderRadius: 1 }} />
                </div>
                <div style={{ position: 'absolute', top: 14, left: 34, width: 88, height: 32, background: 'white', borderRadius: 16, border: '1px solid #dbe3e6' }} />
                <div style={{ position: 'absolute', top: 22, left: 44, width: 70, height: 1, background: '#dbe3e6' }} />
                <div style={{ position: 'absolute', top: 30, left: 44, width: 70, height: 1, background: '#dbe3e6' }} />
              </div>
              <div style={{ width: 130, height: 7, background: '#5B7A8C', borderRadius: '0 0 6px 6px' }} />
              <p className="mono text-[9px] text-gray-400 dark:text-textsecondary-dark mt-2">patient, resting</p>
            </div>

            <div className="absolute bottom-0 left-0 right-0 border-t border-dashed border-gray-200 dark:border-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}
