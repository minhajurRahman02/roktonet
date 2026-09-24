import { useNavigate } from 'react-router-dom';
import { Grid3x3 } from 'lucide-react';
import RoktimShell from './page/RoktimShell';
import DistrictGrid from './page/DistrictGrid';
import { Section, SeeMore } from './page/primitives';

// The "show all 64" destination for the district grid.
//
// A page of its own rather than an expanding block on the main page: 64 cells
// plus the table twin is roughly three screens, and unfolding that in the
// middle of the main page would push the model card so far down that nobody
// would reach it. It also means the grid is linkable on its own.

const SECTIONS = [{ id: 'grid', label: 'All districts', short: 'Districts', icon: Grid3x3 }];

export default function RoktimDistrictsPage() {
  const navigate = useNavigate();

  return (
    <RoktimShell sections={SECTIONS} activeId="grid">
      <div className="pt-20">
        <Section
          id="grid"
          eyebrow="Small multiples · 64 districts"
          title="Every district's dengue year"
          blurb="Each cell shares the same 52-week axis and is scaled to its own maximum, so the shapes are comparable and the heights are not. The vertical rule marks the current week. Pick one to open it in the curve explorer."
          action={
            <SeeMore to="/admin/roktim" back>
              Back to Roktim
            </SeeMore>
          }
        >
          <DistrictGrid
            showTable
            onSelect={(unit) => navigate(`/admin/roktim?district=${encodeURIComponent(unit)}`)}
          />
        </Section>
      </div>
    </RoktimShell>
  );
}
