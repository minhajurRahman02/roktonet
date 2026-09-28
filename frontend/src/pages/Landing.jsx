import LandingNav from '../components/organisms/LandingNav';
import HeroSection from '../components/organisms/HeroSection';
import PositioningSection from '../components/organisms/PositioningSection';
import BeforeAfterSection from '../components/organisms/BeforeAfterSection';
import FeaturesSection from '../components/organisms/FeaturesSection';
import ImpactSection from '../components/organisms/ImpactSection';
import BecomeDonorSection from '../components/organisms/BecomeDonorSection';
import RoktimLaunchSection from '../components/organisms/RoktimLaunchSection';
import LandingFooter from '../components/organisms/LandingFooter';
import BackToTopButton from '../components/atoms/BackToTopButton';

// Section order is the argument the page makes, in order:
//
//   Hero            what this is
//   Positioning     what it is not, since most readers arrive assuming
//                   it is a donor-finding app
//   Before/After    why it matters, on two clocks
//   Features        what was actually built, module by module
//   Impact          proof, read live from the database
//   Become a donor  the ask
//   Roktim          the flourish, last because it is the one part that is
//                   advisory rather than load-bearing, and because it takes
//                   the page into its own visual world that nothing should
//                   have to follow
//
// Removing Roktim means deleting its import and its element here, plus
// src/roktim/, the route file and the table. Nothing else references it.
export default function Landing() {
  return (
    <div id="top" className="bg-paper dark:bg-paper-dark text-textprimary dark:text-textprimary-dark">
      <LandingNav />
      <HeroSection />
      <PositioningSection />
      <BeforeAfterSection />
      <FeaturesSection />
      <ImpactSection />
      <BecomeDonorSection />
      <RoktimLaunchSection />
      <LandingFooter />
      <BackToTopButton />
    </div>
  );
}
