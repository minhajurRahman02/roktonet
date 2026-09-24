import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { modelInfo } from '../../api/roktim';
import { NAME_DISAGREEMENTS } from '../districts';
import { Card, Skeleton, StatTile } from './primitives';

// Section 7: how Roktim was built, how accurate it actually is, and what it
// cannot do.
//
// This is a first-class section, not a footnote, and it is the strongest
// material on the page. Everything above shows the module working; this is the
// part that says what the working means and where it stops. A module that
// ships a documented negative result has to be willing to print the negative
// result.

function Block({ title, children }) {
  return (
    <div className="p-5">
      <h3 className="font-display font-semibold text-[15px] text-roktim-ink mb-2">{title}</h3>
      <div className="text-[13px] text-roktim-muted leading-relaxed space-y-2.5">{children}</div>
    </div>
  );
}

Block.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node };

export default function ModelCard() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let live = true;
    modelInfo().then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, []);

  if (!info) return <Skeleton height={420} />;

  const seasonal = info.accuracy?.seasonal?.district?.['2'];
  const persistence = info.accuracy?.persistence?.district?.['2'];
  const conv = info.conversion || {};
  const spread = info.coverage_spread;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-roktim-hairline">
          {/* Deliberately NOT the single "80.3%" this tile used to show. That
              figure is a tier average, and the spread underneath it runs from
              41% to 91%. Leading with the average was the honest-looking
              version of a misleading claim. */}
          <StatTile
            value={
              spread
                ? `${(spread.worst.coverage * 100).toFixed(0)}–${(spread.best.coverage * 100).toFixed(0)}%`
                : '80.3%'
            }
            label={spread ? 'Coverage, across districts' : 'Measured coverage'}
            sub={
              spread
                ? `claim 80% · median ${(spread.median * 100).toFixed(0)}% · pooled 80.3%`
                : 'against an 80% claim'
            }
          />
          <StatTile
            value={persistence ? persistence.walkforward_mae.toFixed(1) : '·'}
            label="MAE, observed path"
            sub="district, 2 weeks out"
          />
          <StatTile
            value={seasonal ? seasonal.walkforward_mae.toFixed(1) : '·'}
            label="MAE, seasonal path"
            sub="the one production uses"
          />
          <StatTile
            value={`v${info.schema_version}`}
            label="Model artefact"
            sub={`built ${info.generated}`}
          />
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <Block title="Where the data came from">
            <p>
              Bangladesh&apos;s Directorate General of Health Services publishes a daily PDF of
              dengue hospital admissions by district. 1,639 of those reports, covering 2019 to
              2026, were collected and read automatically.
            </p>
            <p>
              The site hosting them went offline partway through the project, so every file was
              recovered from the Internet Archive. The PDFs are in Bangla and the same heading
              is printed with different letters in different years depending on the embedded
              font, so the parser ignores the Bangla entirely and finds the table by counting
              columns of digits.
            </p>
            <p className="text-roktim-ink">
              The check that it worked: the 2023 total comes out at 321,179 cases. DGHS&apos;s own
              published annual figure is 321,179, arrived at independently.
            </p>
          </Block>
        </Card>

        <Card>
          <Block title="Why the simplest method shipped">
            <p>
              72 walk-forward evaluations were run across 12 feature-set and target
              configurations, 3 horizons and 2 grains, including NASA POWER rainfall and
              temperature lagged 2 to 12 weeks, which is where the dengue literature points.
            </p>
            <p className="text-roktim-ink">
              Not one of them beat &quot;next week resembles this week&quot; by a margin that survived
              a paired Wilcoxon test. The closest was +9.5% at division level, one week out,
              with p = 0.322 and the margin resting on a single fold.
            </p>
            <p>
              So naive persistence is what ships. The weather data failed for a reason that can
              be stated exactly: NASA&apos;s grid is about 55 km across, so Dhaka and Manikganj
              receive identical readings, and Dhaka is most of the national signal.
            </p>
          </Block>
        </Card>
      </div>

      <Card className="border-roktim-brand/40">
        <Block title="What Roktim cannot do">
          <p>
            <span className="text-roktim-ink font-medium">It has no live data.</span> The
            validated estimator needs last week&apos;s actual admissions. RoktoNet sees blood
            requests, not government hospital statistics, so in production the service falls
            back to a seasonal average, which is about 2.5 times less accurate and cannot
            detect a surge at all. Every response says which path it took, and on this page
            every one of them says seasonal.
          </p>
          <p>
            <span className="text-roktim-ink font-medium">It only covers dengue.</span> Road
            trauma, obstetric complications and surgery also consume blood and are not in the
            dataset yet ({(info.excluded_demand || []).join(', ')}). Every figure here is a
            floor on real demand, never a ceiling.
          </p>
          <p>
            <span className="text-roktim-ink font-medium">
              One conversion number is a choice, not a citation.
            </span>{' '}
            How many dengue patients actually receive a transfusion is not precisely documented
            for Bangladesh. Published studies span{' '}
            {conv.transfusion_rate ? `${conv.transfusion_rate.low} to ${conv.transfusion_rate.high}` : '0.097 to 0.426'}
            ; {conv.transfusion_rate?.central ?? 0.22} is used. That makes every bag figure
            uncertain by a factor of about 8.8, which is why bags are always shown as a band.
          </p>
          <p>
            It does not, however, change the decision. The at-risk rule compares patients to
            patients, never bags, so the uncertain rate cancels out of the arithmetic. This was
            tested across 54 combinations of the conversion constants and the fulfilment
            decision never changed once.
          </p>
          <p>
            <span className="text-roktim-ink font-medium">One outbreak in the data.</span> 2023
            is the only full dengue epidemic in the record, so any claim about outbreak
            behaviour rests on a single event.
          </p>
          <p>
            <span className="text-roktim-ink font-medium">The band does not vary by week.</span>{' '}
            Residuals were pooled across the year, so coverage is correct on average, too tight
            at the seasonal peak and too wide off season.
          </p>
          {spread && (
            <p>
              <span className="text-roktim-ink font-medium">
                It does not vary by district either, and that is the bigger problem.
              </span>{' '}
              Volume tiers are defined by an absolute threshold, so one tier holds districts
              whose weekly admissions differ by orders of magnitude and they all share one
              fixed band width. Pooled coverage meets its 80% claim, but measured per district
              it runs from {(spread.worst.coverage * 100).toFixed(1)}% for{' '}
              {spread.worst.unit} up to {(spread.best.coverage * 100).toFixed(0)}% for the
              smallest, with a median of {(spread.median * 100).toFixed(0)}% and{' '}
              {spread.below_60pct} of {spread.units_measured} districts below 60%.{' '}
              {spread.worst.unit} is most of the national dengue signal, so the district the
              interval serves worst is the one that matters most.
            </p>
          )}
          {spread && (
            <p>
              This was found while building the curve explorer, not by the calibration report,
              which had no reason to look: the tier figures it prints are all correct. Every
              per-district figure above is measured on the same held-out weeks with the same
              bounds that are deployed, and it is published rather than summarised because the
              average was the thing doing the hiding. The bounds themselves are unchanged, so
              no decision has moved. Recalibrating on proportional rather than additive
              residuals is the actual fix and is deferred.
            </p>
          )}
        </Block>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <Block title="How the advisory reaches you">
            <p>
              The browser calls the forecast service directly. The Node backend is not in the
              advisory path at all, and is involved only afterwards to store the log row. That
              is what keeps the optimization engine and every existing route untouched.
            </p>
            <p>
              The trade, stated rather than buried: because the advisory is computed and posted
              by the browser, a modified client could write a log row Roktim never produced.
              Verifying it would mean the backend re-calling the forecast service, which
              reintroduces exactly the coupling this design avoids and would make an elective
              request depend on a free-tier service being awake. The log has no clinical
              authority and drives no decision, so the trade is bounded.
            </p>
            <p className="text-roktim-ink">
              Roktim can only ever add caution. It never blocks a request, never overrides the
              stock check, and if the service is down the system carries on without it.
            </p>
          </Block>
        </Card>

        <Card>
          <Block title="A naming disagreement, recorded">
            <p>
              RoktoNet and the forecast model learned their district names from different
              sources and disagree on five of the sixty-four. The names are translated at the
              boundary; the log stores the model&apos;s spelling, because that is what the
              advisory was computed against.
            </p>
            <ul className="font-mono text-[11.5px] text-roktim-dim space-y-1 pt-1">
              {NAME_DISAGREEMENTS.map((d) => (
                <li key={d.app}>
                  {d.app} <span className="text-roktim-muted">to</span> {d.model}
                </li>
              ))}
            </ul>
            <p className="pt-1">
              Worth recording because the failure it would have caused is invisible: an unknown
              district returns nothing, and Roktim renders nothing on nothing, so five
              districts would simply never have seen an advisory and it would have looked
              exactly like the service being asleep.
            </p>
          </Block>
        </Card>
      </div>

      <p className="font-mono text-[10.5px] text-roktim-dim">
        {info.source} · span {(info.data_span_weeks || []).join(' to ')} · horizons{' '}
        {(info.horizons_weeks || []).join('/')} weeks · levels{' '}
        {(info.interval_levels || []).join('/')}
      </p>
    </div>
  );
}
