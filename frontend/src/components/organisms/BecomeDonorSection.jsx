import { Link } from 'react-router-dom';

export default function BecomeDonorSection() {
  return (
    <section id="become-donor" className="bg-primary text-white">
      <div className="max-w-4xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <p className="mono text-xs text-white/60 mb-3">A REAL ACCOUNT, NOT JUST A FORM</p>
          <h2 className="font-display font-bold text-3xl mb-4">Become a donor</h2>
          <p className="text-white/75 text-sm leading-relaxed mb-5">
            Donor accounts are full RoktoNet accounts — log in anytime to see your own dashboard: donation history,
            eligibility countdown, and any urgent invites the system has matched you to.
          </p>
          <ul className="text-white/80 text-sm space-y-2">
            <li>· Track your donation history</li>
            <li>· See your next eligibility date</li>
            <li>· Respond to targeted urgent invites</li>
          </ul>
        </div>
        <div className="hover-card bg-white rounded-xl p-6 text-center">
          <p className="font-display font-semibold text-gray-900 mb-2">Ready when you are</p>
          <p className="text-xs text-gray-500 mb-4">Takes under a minute. Verify your email, and your dashboard is ready.</p>
          <Link
            to="/register"
            className="block bg-primary text-white font-medium px-5 py-3 rounded-lg text-sm hover:bg-primary-light transition-colors duration-300"
          >
            Create your donor account
          </Link>
        </div>
      </div>
    </section>
  );
}
