import { ArrowRight, Package, Plus } from 'lucide-react';
import './invite-welcome.css';

export function InviteWelcomeSteps() {
  return <ol className="invite-welcome-steps">
    <li>
      <div className="welcome-illustration welcome-activity" aria-hidden="true">
        <div className="welcome-contributions">{Array.from({length:35},(_,i)=><span key={i} style={{background:['#dce8da','#b8d6ac','#87b879','#578c60'][(i*7+Math.floor(i/5))%4]}}/>)}</div>
        <ArrowRight className="welcome-progress-arrow" size={22}/>
        <img src="/images/invite-level-6.svg" alt=""/>
      </div>
      <h3><span>1.</span> Activity in GitHub translates to progress in C.I.T.I.E.S</h3>
      <p>Earn XP from your GitHub commits and watch your tower grow as you build.</p>
    </li>
    <li>
      <div className="welcome-illustration welcome-customize" aria-hidden="true">
        <img src="/images/invite-level-6.svg" alt=""/>
        <div className="welcome-bricks"><ArrowRight size={24}/><Package size={30}/></div>
      </div>
      <h3><span>2.</span> Customize your tower</h3>
      <p>Use bricks to unlock customizations. Gain bricks from GitHub activity or from daily login.</p>
    </li>
    <li>
      <div className="welcome-illustration welcome-neighbors" aria-hidden="true">
        <img src="/images/invite-level-6.svg" alt=""/>
        <span className="welcome-neighbor-plus"><Plus size={25}/></span>
        <img src="/images/invite-level-3.svg" alt=""/>
      </div>
      <h3><span>3.</span> Invite others</h3>
      <p>Invite others to place their building nearby. Collaborate on public projects to reap massive rewards.</p>
    </li>
  </ol>;
}
