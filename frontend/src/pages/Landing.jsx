import LandingNav from '../components/organisms/LandingNav';
import HeroSection from '../components/organisms/HeroSection';
import PositioningSection from '../components/organisms/PositioningSection';
import BeforeAfterSection from '../components/organisms/BeforeAfterSection';
import FeaturesSection from '../components/organisms/FeaturesSection';
import ImpactSection from '../components/organisms/ImpactSection';
import BecomeDonorSection from '../components/organisms/BecomeDonorSection';
import LandingFooter from '../components/organisms/LandingFooter';
import BackToTopButton from '../components/atoms/BackToTopButton';

export default function Landing() {
  return (
    <div className="bg-paper dark:bg-paper-dark text-gray-900 dark:text-textprimary-dark transition-colors duration-300">
      <LandingNav />
      <span id="top" />

      <HeroSection />
      <PositioningSection />
      <BeforeAfterSection />
      <FeaturesSection />
      <ImpactSection />
      <BecomeDonorSection />
      <LandingFooter />
      <BackToTopButton />
    </div>
  );
}
