import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Vote, 
  MapPin, 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  ArrowLeft,
  Calendar, 
  ShieldCheck, 
  HelpCircle, 
  FileText, 
  MessageSquare,
  PlayCircle,
  Users,
  ChevronRight,
  Send,
  X,
  AlertCircle,
  LogOut,
  Trophy,
  History,
  LayoutDashboard,
  GraduationCap,
  Briefcase,
  Accessibility,
  LogIn,
  Share,
  Search,
  Settings,
  RefreshCw,
  RotateCcw,
  Check,
  ChevronUp,
  ChevronDown,
  Link as LinkIcon,
  Fingerprint,
  CreditCard,
  ExternalLink,
  Clock,
  ChevronLeft,
  Activity,
  TrendingUp,
  Mail,
  Cloud,
  Shield,
  Globe,
  Lock,
  Info
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle } from './lib/firebase';
import { UserProfile, Step, VotingJourney, Message, TimelineEvent, Representative } from './types';
import { getUserProfile, createUserProfile, updateUserProfile, getUserSteps, updateStepStatus } from './services/userService';
import { askMythBuster } from './services/geminiService';

type Screen = 'landing' | 'onboarding' | 'dashboard' | 'timeline' | 'mythbuster' | 'simulation' | 'help' | 'results' | 'press' | 'privacy';

export default function App() {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [journey, setJourney] = useState<VotingJourney>({ steps: [], progress: 0 });
  const [screen, setScreen] = useState<Screen>('landing');
  
  const handleNavigate = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [loading, setLoading] = useState(true);
  const [pendingOnboarding, setPendingOnboarding] = useState<Partial<UserProfile> | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVerificationFlow, setShowVerificationFlow] = useState(false);
  const [verificationMode, setVerificationMode] = useState<'id' | 'ballot' | 'registration'>('id');

  const pendingOnboardingRef = React.useRef<Partial<UserProfile> | null>(null);

  useEffect(() => {
    pendingOnboardingRef.current = pendingOnboarding;
  }, [pendingOnboarding]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (user) {
        let userProfile = await getUserProfile(user.uid);
        
        if (!userProfile) {
          // New user - capture initial data if available from the ref
          const currentPending = pendingOnboardingRef.current;
          const initialData = currentPending ? { ...currentPending, onboardingComplete: true } : {};
          userProfile = await createUserProfile(
            user.uid, 
            user.email || '', 
            user.displayName || 'Voter',
            initialData
          );
          if (currentPending) {
            setPendingOnboarding(null);
            pendingOnboardingRef.current = null;
          }
        } else if (pendingOnboardingRef.current) {
          // Existing user finishing onboarding after a login triggered by the survey
          const currentPending = pendingOnboardingRef.current;
          await updateUserProfile(user.uid, { ...currentPending, onboardingComplete: true });
          userProfile = await getUserProfile(user.uid);
          setPendingOnboarding(null);
          pendingOnboardingRef.current = null;
        }

        setProfile(userProfile);
        
        if (userProfile && userProfile.onboardingComplete) {
          // Fully setup user
          const steps = await getUserSteps(user.uid);
          updateJourney(steps);
          // Redirect to dashboard if they were stuck on auth-preventing screens
          setScreen(prev => (prev === 'landing' || prev === 'onboarding') ? 'dashboard' : prev);
        } else if (userProfile) {
          // User exists but hasn't finished details
          setScreen('onboarding');
        }
      } else {
        setScreen('landing');
        setProfile(null);
        setJourney({ steps: [], progress: 0 });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []); 

  const refreshProfile = async () => {
    if (fbUser) {
      const updatedProfile = await getUserProfile(fbUser.uid);
      setProfile(updatedProfile);
    }
  };

  const handleVerificationComplete = async (mode: string) => {
    await refreshProfile();
    setShowVerificationFlow(false);
  };

  // Separate effect for re-fetching journey data when screen changes to ensure no "old data"
  useEffect(() => {
    if (fbUser && profile && profile.onboardingComplete) {
      getUserSteps(fbUser.uid).then(updateJourney);
    }
  }, [screen, fbUser, profile]);

  const updateJourney = (steps: Step[]) => {
    const completed = steps.filter(s => s.status === 'completed').length;
    setJourney({
      steps,
      progress: steps.length > 0 ? (completed / steps.length) * 100 : 0
    });
  };

  const handleToggleStep = async (stepId: string) => {
    if (!fbUser) return;
    const step = journey.steps.find(s => s.id === stepId);
    if (!step) return;

    const newStatus = step.status === 'completed' ? 'pending' : 'completed';
    await updateStepStatus(fbUser.uid, stepId, newStatus);
    
    // Refresh steps and profile (for points)
    const [newSteps, newProfile] = await Promise.all([
      getUserSteps(fbUser.uid),
      getUserProfile(fbUser.uid)
    ]);
    updateJourney(newSteps);
    if (newProfile) setProfile(newProfile);
  };

  const handleOnboardingComplete = async (data: Partial<UserProfile>) => {
    try {
      if (!fbUser) {
        setPendingOnboarding(data);
        await handleSignIn();
        return;
      }
      setLoading(true);
      await updateUserProfile(fbUser.uid, { ...data, onboardingComplete: true });
      const newProfile = await getUserProfile(fbUser.uid);
      const newSteps = await getUserSteps(fbUser.uid);
      setProfile(newProfile);
      updateJourney(newSteps);
      setScreen('dashboard');
    } catch (error) {
      console.error("Onboarding completion error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for pending verification requests from onboarding
    const pendingVerif = localStorage.getItem('start_verification');
    if (pendingVerif && profile && profile.onboardingComplete) {
      setVerificationMode(pendingVerif as any);
      setShowVerificationFlow(true);
      localStorage.removeItem('start_verification');
    }
  }, [profile]);

  const [authLoading, setAuthLoading] = useState(false);

  const handleSignIn = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('Sign-in popup closed by user');
        return;
      }
      console.error('Sign-in error:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-indigo-custom border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface selection:bg-indigo-pale">
      <Nav 
        currentScreen={screen} 
        onNavigate={handleNavigate} 
        user={fbUser} 
        onSearch={() => setShowSearch(true)}
        onSettings={() => setShowSettings(true)}
        onRefreshProfile={refreshProfile}
      />
      
      <AnimatePresence>
        {showSearch && (
          <GlobalSearch 
            onClose={() => setShowSearch(false)} 
            onNavigate={(s) => { handleNavigate(s); setShowSearch(false); }}
            profile={profile}
          />
        )}
        {showSettings && profile && (
          <SettingsPanel
            profile={profile}
            onClose={() => setShowSettings(false)}
            onStartVerification={(m) => {
              setVerificationMode(m);
              setShowVerificationFlow(true);
            }}
            onUpdate={async (data) => {
              if (fbUser) {
                await updateUserProfile(fbUser.uid, data);
                const newProfile = await getUserProfile(fbUser.uid);
                setProfile(newProfile);
              }
            }}
          />
        )}
      </AnimatePresence>

      <main className="max-w-[1200px] mx-auto px-4 min-h-[75vh] flex flex-col">
        <AnimatePresence mode="wait">
          {screen === 'landing' && (
            <motion.div key="landing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <LandingScreen onLogin={handleSignIn} onStart={() => setScreen('onboarding')} authLoading={authLoading} />
            </motion.div>
          )}
          
          {screen === 'onboarding' && (
            <motion.div key="onboarding" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <OnboardingFlow 
                onComplete={handleOnboardingComplete} 
                onReset={async () => {
                  if (fbUser) {
                    await updateUserProfile(fbUser.uid, { 
                      idVerified: false, 
                      onboardingComplete: false,
                      voterIdNumber: null, 
                      panCardNumber: null,
                      verificationMethod: null,
                      verifiedAt: null,
                      address: '',
                      location: '',
                      registrationStatus: 'not_started',
                      voterSlipStatus: null,
                      ballotApplied: false,
                      interests: [],
                      points: 0
                    });
                    await auth.signOut();
                    window.location.reload();
                  }
                }}
                authLoading={authLoading} 
                isAuthenticated={!!fbUser} 
              />
            </motion.div>
          )}
          
          {/* Voter Tools & Public Views */}
          {(screen === 'mythbuster' || screen === 'simulation' || screen === 'help' || screen === 'timeline' || screen === 'results' || screen === 'press' || screen === 'privacy') && (
            <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
              {screen === 'mythbuster' && <MythBusterView onBack={() => handleNavigate(profile ? 'dashboard' : 'landing')} />}
              {screen === 'simulation' && <SimulationView onBack={() => handleNavigate(profile ? 'dashboard' : 'landing')} />}
              {screen === 'help' && <HelpCenterView profile={profile} onBack={() => handleNavigate(profile ? 'dashboard' : 'landing')} />}
              {screen === 'timeline' && <TimelineView profile={profile} />}
              {screen === 'results' && <ResultsView profile={profile} onBack={() => handleNavigate(profile ? 'dashboard' : 'landing')} />}
              {screen === 'press' && <StaticPageView title="Press Inquiries" type="press" onBack={() => handleNavigate(profile ? 'dashboard' : 'landing')} />}
              {screen === 'privacy' && <StaticPageView title="Privacy Policy" type="privacy" onBack={() => handleNavigate(profile ? 'dashboard' : 'landing')} />}
            </motion.div>
          )}
          
          {/* Dashboard Gated View */}
          {screen === 'dashboard' && (
            <motion.div key="dashboard-gated" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
              {!profile ? (
                <div className="flex flex-col items-center justify-center py-32 text-center animate-fade-in px-6">
                  <div className="w-20 h-20 bg-indigo-xpale text-indigo-custom rounded-[24px] flex items-center justify-center mb-8 rotate-3">
                    <ShieldCheck size={40} />
                  </div>
                  <h2 className="text-4xl font-serif mb-4">
                    {!fbUser ? 'Unlock your voter guide' : 'Complete your profile'}
                  </h2>
                  <p className="text-on-surface-dim mb-10 max-w-[450px] text-lg leading-relaxed">
                    {!fbUser 
                      ? 'Sign in to access your personalized dashboard, timeline, and professional civic tools.' 
                      : 'You\'re signed in! Now just answer a few questions to generate your personalized guide.'}
                  </p>
                  {!fbUser ? (
                    <button 
                      onClick={handleSignIn} 
                      disabled={authLoading}
                      className="btn-primary py-4 px-12 text-lg flex items-center gap-2"
                    >
                      {authLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                      Sign In with Google
                    </button>
                  ) : (
                    <button onClick={() => setScreen('onboarding')} className="btn-primary py-4 px-12 text-lg">Build My Profile →</button>
                  )}
                </div>
              ) : (
                <Dashboard 
                  profile={profile} 
                  journey={journey} 
                  onToggleStep={handleToggleStep}
                  onRefreshProfile={refreshProfile}
                  onNavigate={handleNavigate}
                  onSettings={() => setShowSettings(true)}
                  showVerificationFlow={showVerificationFlow}
                  setShowVerificationFlow={setShowVerificationFlow}
                  verificationMode={verificationMode}
                  setVerificationMode={setVerificationMode}
                  onVerificationComplete={handleVerificationComplete}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer onNavigate={handleNavigate} />
    </div>
  );
}

// --- COMPONENTS ---

function Nav({ 
  currentScreen, 
  onNavigate, 
  user,
  onSearch,
  onSettings,
  onRefreshProfile
}: { 
  currentScreen: Screen, 
  onNavigate: (s: Screen) => void,
  user: User | null,
  onSearch: () => void,
  onSettings: () => void,
  onRefreshProfile: () => Promise<void>
}) {
  return (
    <nav className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-outline h-20 px-8 flex items-center justify-between">
      <div 
        className="flex items-center gap-3 font-serif text-2xl text-indigo-custom cursor-pointer tracking-tight" 
        onClick={() => onNavigate('landing')}
      >
        <div className="relative">
          <div className="w-3 h-3 bg-indigo-custom rounded-full" />
          <div className="absolute inset-0 w-3 h-3 bg-indigo-custom rounded-full animate-ping opacity-40" />
        </div>
        CivicTrust
      </div>

      <button 
        id="global-refresh-btn-container"
        onClick={async () => {
          const icon = document.getElementById('global-refresh-icon');
          if (icon) icon.classList.add('animate-spin');
          await onRefreshProfile();
          setTimeout(() => {
            if (icon) icon.classList.remove('animate-spin');
          }, 1000);
        }}
        className="hidden sm:flex items-center gap-1.5 ml-4 px-3 py-1.5 bg-green-pale text-green-custom rounded-full border border-green-custom/20 hover:bg-green-100 transition-all group active:scale-95"
        title="Refresh Profile Data"
      >
        <RefreshCw id="global-refresh-icon" size={12} className="transition-transform" />
        <span className="text-[10px] font-black uppercase tracking-tighter">Live Sync: Active</span>
      </button>
      
      <div className="hidden lg:flex gap-1">
        {[
          { id: 'landing', label: 'Home' },
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'mythbuster', label: 'MythBuster' },
          { id: 'simulation', label: 'Simulation' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'results', label: 'Results' }
        ].map((s) => {
          const isActive = currentScreen === s.id;
          
          return (
            <button 
              key={s.id}
              onClick={() => onNavigate(s.id as Screen)}
              className={`nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={onSearch}
          className="p-2 text-on-surface-dim hover:text-indigo-custom transition-all hover:bg-indigo-xpale rounded-full"
          title="Global Search"
        >
          <Search size={20} />
        </button>
        {user ? (
          <div className="flex items-center gap-2">
            <button 
              onClick={onSettings}
              className="p-2 text-on-surface-dim hover:text-indigo-custom transition-all hover:bg-indigo-xpale rounded-full"
              title="Settings"
            >
              <Settings size={20} />
            </button>
            <div className="w-px h-6 bg-outline mx-1" />
            <button 
              onClick={() => onNavigate('dashboard')}
              className="w-9 h-9 bg-indigo-pale text-indigo-custom rounded-full flex items-center justify-center font-bold text-sm hover:scale-105 transition-all"
            >
              {user.displayName?.[0] || 'V'}
            </button>
            <button onClick={async () => {
              if (window.confirm("This will permanently delete your verified profile and civic records from this device and the cloud. Are you sure you want to proceed?")) {
                const uid = auth.currentUser?.uid;
                if (uid) {
                  // Actually delete from Firestore would be better but we can just clear it
                  await updateUserProfile(uid, { onboardingComplete: false, country: undefined, location: undefined, idVerified: false });
                  await auth.signOut();
                  window.location.reload();
                }
              }
            }} className="text-on-surface-dim hover:text-error-custom transition-all ml-2" title="Wipe Data & Reset App">
              <RotateCcw size={18} />
            </button>
            <button onClick={() => auth.signOut()} className="text-on-surface-dim hover:text-error-custom transition-all ml-2" title="Sign Out">
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <button onClick={() => onNavigate('onboarding')} className="nav-cta">
            Get Started
          </button>
        )}
      </div>
    </nav>
  );
}

function LandingScreen({ onLogin, onStart, authLoading }: { onLogin: () => void, onStart: () => void, authLoading: boolean }) {
  return (
    <div className="relative overflow-hidden min-h-[85vh] flex flex-col items-center justify-center py-20 px-4">
      <div className="dot-pattern" />
      
      <div className="relative z-10 w-full max-w-[800px] text-center space-y-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex justify-center">
            <div className="hero-eyebrow">
              < ShieldCheck size={14} />
              <span>Official 2026 Voter Assistance Portal</span>
            </div>
          </div>
          <h1 className="text-6xl md:text-7xl font-serif tracking-tight leading-[1.1] text-on-surface">
            Secure Your Vote. <br />
            <span className="text-indigo-accent font-bold">Track Your Impact.</span>
          </h1>
          <p className="text-xl text-on-surface-dim max-w-[580px] mx-auto leading-relaxed font-medium">
            Personalized election guides, registration verification, and real-time voting requirements for your specific district.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6"
        >
          <div className="bg-white p-2 rounded-2xl shadow-xl border border-outline/30 flex flex-col sm:flex-row gap-4 items-center">
            <button 
              onClick={onStart}
              className="btn-primary py-4 px-10 text-lg flex items-center justify-center gap-3 w-full sm:w-auto"
            >
              Start Your Guide
              <ArrowRight size={20} />
            </button>
            <button 
              onClick={onLogin} 
              disabled={authLoading}
              className="px-8 py-3.5 text-lg font-bold flex items-center justify-center gap-3 bg-surface-low hover:bg-surface-high text-on-surface rounded-lg transition-all w-full sm:w-auto"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-indigo-accent/30 border-t-indigo-accent rounded-full animate-spin" />
              ) : (
                <LogIn size={20} />
              )}
              Member Login
            </button>
          </div>
        </motion.div>

        <div className="pt-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="text-3xl font-serif mb-2">Verify</div>
              <p className="text-sm text-on-surface-dim">Instant registration status check against official records.</p>
            </div>
            <div className="p-6">
              <div className="text-3xl font-serif mb-2">Practice</div>
              <p className="text-sm text-on-surface-dim">Mark a sample ballot to understand the process before you go.</p>
            </div>
            <div className="p-6">
              <div className="text-3xl font-serif mb-2">Track</div>
              <p className="text-sm text-on-surface-dim">Official deadline tracking and smart notifications for your area.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingFlow({ onComplete, onReset, authLoading, isAuthenticated }: { onComplete: (d: Partial<UserProfile>) => void, onReset: () => void, authLoading: boolean, isAuthenticated: boolean }) {
  const [step, setStep] = useState(1);
  const [isFinishing, setIsFinishing] = useState(false);
  const [data, setData] = useState({ 
    country: '' as 'US' | 'India',
    ageGroup: '',
    registrationStatus: '', 
    votingMethod: '', 
    location: '',
    interests: [] as string[],
    ballotPreference: '', 
    voterSlipStatus: '', 
  });

  const INTEREST_TOPICS = [
    { id: 'env', label: 'Environment', icon: '🌱' },
    { id: 'edu', label: 'Education', icon: '📚' },
    { id: 'eco', label: 'Economy', icon: '💰' },
    { id: 'health', label: 'Healthcare', icon: '🏥' },
    { id: 'tech', label: 'Tech & AI', icon: '🤖' },
    { id: 'civic', label: 'Civic Rights', icon: '⚖️' },
  ];

  const handleSelect = (field: string, value: string) => {
    setData({ ...data, [field]: value });
  };

  const toggleInterest = (id: string) => {
    setData(prev => ({
      ...prev,
      interests: prev.interests.includes(id) 
        ? prev.interests.filter(i => i !== id) 
        : [...prev.interests, id]
    }));
  };

  const stepsCount = data.country ? 7 : 6;

  const next = async () => {
    if (step < stepsCount) {
      setStep(s => s + 1);
    } else {
      if (!isAuthenticated) {
        onComplete({ 
          country: data.country as 'US' | 'India',
          location: data.location,
          isFirstTime: data.registrationStatus === 'no',
          onboardingComplete: false,
          preferences: {
            notifications: true,
            emailNotifications: true,
            compactView: false,
            language: 'en',
            widgets: ['journey', 'score', 'representatives', 'voterId', 'alerts', 'tools']
          }
        });
        return;
      }

      setIsFinishing(true);
      try {
        await onComplete({ 
          country: data.country as 'US' | 'India',
          location: data.location,
          isFirstTime: data.registrationStatus === 'no',
          onboardingComplete: true,
          preferences: {
            notifications: true,
            emailNotifications: true,
            compactView: false,
            language: 'en',
            widgets: ['journey', 'score', 'representatives', 'voterId', 'alerts', 'tools']
          }
        });
      } finally {
        setIsFinishing(false);
      }
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto py-8 md:py-16 px-4 min-h-[85vh] flex flex-col items-center">
      {/* Visual Header / Progress */}
      <div className="w-full max-w-[800px] mb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-xpale rounded-xl border border-indigo-pale shadow-sm">
                <Vote className="text-indigo-custom" size={24} />
             </div>
             <div>
                <h2 className="text-xl font-bold tracking-tight">Onboarding Hub</h2>
                <p className="text-[10px] font-black uppercase text-on-surface-dim tracking-widest">Election Cycle 2026</p>
             </div>
          </div>
          <div className="text-right">
             <div className="text-[10px] font-black uppercase text-on-surface-dim tracking-widest mb-1">Module {step} of {stepsCount}</div>
             <div className="flex gap-1 justify-end">
               {Array.from({ length: stepsCount }).map((_, i) => (
                 <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i + 1 < step ? 'w-4 bg-green-custom' : i + 1 === step ? 'w-8 bg-indigo-custom' : 'w-4 bg-outline opacity-30'}`} />
               ))}
             </div>
          </div>
        </div>
        <div className="h-1 w-full bg-surface-low rounded-full overflow-hidden border border-outline/10">
          <motion.div 
            className="h-full bg-indigo-custom" 
            initial={{ width: 0 }}
            animate={{ width: `${(step / stepsCount) * 100}%` }}
            transition={{ type: 'spring', stiffness: 50 }}
          />
        </div>
      </div>

      <div className="w-full max-w-[1000px] flex flex-col md:flex-row gap-12 items-start">
        {/* Step Content */}
        <div className="flex-1 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white border border-outline rounded-[40px] p-8 md:p-12 shadow-2xl shadow-indigo-900/5 relative overflow-hidden min-h-[500px]"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                {step === 1 && <Globe size={180} />}
                {step === 2 && <Users size={180} />}
                {step === 3 && <ShieldCheck size={180} />}
                {step === (data.country ? 5 : 4) && <MapPin size={180} />}
                {step === (data.country ? 6 : 5) && <History size={180} />}
                {step === stepsCount && <CheckCircle2 size={180} />}
              </div>

              {step === 1 && (
                <div className="relative">
                  <h3 className="text-3xl font-serif mb-3">Your Jurisdiction</h3>
                  <p className="text-on-surface-dim mb-10 text-lg">CivicTrust adapts to your local laws and election procedures.</p>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <ChoiceButton 
                      icon="🇮🇳" 
                      label="India" 
                      sub="Ministry of Law & ECI" 
                      selected={data.country === 'India'} 
                      onClick={() => handleSelect('country', 'India')} 
                    />
                    <ChoiceButton 
                      icon="🇺🇸" 
                      label="United States" 
                      sub="Federal & State Agencies" 
                      selected={data.country === 'US'} 
                      onClick={() => handleSelect('country', 'US')} 
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="relative">
                  <h3 className="text-3xl font-serif mb-3">Representative Age</h3>
                  <p className="text-on-surface-dim mb-10 text-lg">We target specific outreach programs based on your voting cohort.</p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <ChoiceButton icon="🎓" label="18-25" sub="Next Generation" selected={data.ageGroup === '18-25'} onClick={() => handleSelect('ageGroup', '18-25')} />
                    <ChoiceButton icon="👔" label="26-60" sub="Active Workforce" selected={data.ageGroup === '26-60'} onClick={() => handleSelect('ageGroup', '26-60')} />
                    <ChoiceButton icon="👴" label="60+" sub="Senior Counsel" selected={data.ageGroup === '60+'} onClick={() => handleSelect('ageGroup', '60+')} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="relative">
                  <h3 className="text-3xl font-serif mb-3">
                    {data.country === 'India' ? 'Voter ID Registry' : 'Voter Enrollment Status'}
                  </h3>
                  <p className="text-on-surface-dim mb-10 text-lg">
                    {data.country === 'India' 
                      ? 'The Electoral Photo Identity Card (EPIC) is mandatory for poll participation.' 
                      : 'Enrollment is the first legal step toward achieving electoral voice.'}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <ChoiceButton 
                      icon="🛡️" 
                      label={data.country === 'India' ? 'I have my EPIC number' : 'I am already enrolled'} 
                      selected={data.registrationStatus === 'yes'} 
                      onClick={() => handleSelect('registrationStatus', 'yes')} 
                    />
                    <ChoiceButton 
                      icon="🆕" 
                      label={data.country === 'India' ? 'I need a new Voter ID' : 'I need to enroll now'} 
                      selected={data.registrationStatus === 'no'} 
                      onClick={() => handleSelect('registrationStatus', 'no')} 
                    />
                  </div>
                </div>
              )}

              {step === 4 && data.country === 'US' && (
                <div className="relative animate-fade-in">
                  <h3 className="text-3xl font-serif mb-3">Ballot Delivery</h3>
                  <p className="text-on-surface-dim mb-10 text-lg">Choose your preferred method for receiving and casting your ballot.</p>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <ChoiceButton icon="📬" label="Absentee / Mail" sub="Secure postal ballot" selected={data.ballotPreference === 'Mail'} onClick={() => handleSelect('ballotPreference', 'Mail')} />
                    <ChoiceButton icon="🏛️" label="At Polling Place" sub="Cast vote in person" selected={data.ballotPreference === 'In-Person'} onClick={() => handleSelect('ballotPreference', 'In-Person')} />
                  </div>
                </div>
              )}

              {step === 4 && data.country === 'India' && (
                <div className="relative animate-fade-in">
                  <h3 className="text-3xl font-serif mb-3">Electoral Roll Status</h3>
                  <p className="text-on-surface-dim mb-10 text-lg">Your name must appear in the Part-Section of your local booth roll.</p>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <ChoiceButton icon="🧐" label="Verified on ECI Roll" sub="Name found on registry" selected={data.voterSlipStatus === 'Checked'} onClick={() => handleSelect('voterSlipStatus', 'Checked')} />
                    <ChoiceButton icon="❌" label="Not Found / Not Checked" sub="Requires sync or search" selected={data.voterSlipStatus === 'Not Checked'} onClick={() => handleSelect('voterSlipStatus', 'Not Checked')} />
                  </div>
                </div>
              )}

              {step === (data.country ? 5 : 4) && (
                <div className="relative text-center animate-fade-in">
                  <h3 className="text-3xl font-serif mb-3">Geographic Anchor</h3>
                  <p className="text-on-surface-dim mb-12 text-lg">Enter your primary residency to determine your legislative representatives.</p>
                  <div className="max-w-[500px] mx-auto focus-within:scale-[1.02] transition-transform">
                    <input 
                      type="text" 
                      autoFocus
                      placeholder={data.country === 'India' ? 'e.g. New Delhi, South Mumbai' : 'e.g. San Francisco, Denver'}
                      value={data.location}
                      onChange={(e) => handleSelect('location', e.target.value)}
                      className="w-full bg-surface-low border-2 border-outline rounded-[24px] p-6 focus:outline-none focus:border-indigo-custom focus:bg-white transition-all text-xl font-medium shadow-inner"
                    />
                    <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase text-on-surface-dim tracking-widest">
                       <MapPin size={12} />
                       Local matching requires precise locality name
                    </div>
                  </div>
                </div>
              )}

              {step === (data.country ? 6 : 5) && (
                <div className="relative">
                  <h3 className="text-3xl font-serif mb-3">Policy Priorities</h3>
                  <p className="text-on-surface-dim mb-10 text-lg">We prioritize alerts and news based on the civic issues you care about.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                    {INTEREST_TOPICS.map((topic, i) => (
                      <motion.button 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        key={topic.id}
                        onClick={() => toggleInterest(topic.id)}
                        className={`p-6 rounded-[24px] border-2 transition-all text-center group relative overflow-hidden ${
                          data.interests.includes(topic.id) ? 'bg-indigo-xpale border-indigo-custom shadow-lg shadow-indigo-500/10' : 'bg-surface-low border-outline hover:border-indigo-pale'
                        }`}
                      >
                        <span className="text-3xl block mb-3 group-hover:rotate-12 transition-transform duration-300">{topic.icon}</span>
                        <span className="text-xs font-black uppercase tracking-tight">{topic.label}</span>
                        {data.interests.includes(topic.id) && (
                          <div className="absolute top-2 right-2">
                            <Check size={14} className="text-indigo-custom" strokeWidth={4} />
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {step === stepsCount && (
                <div className="relative text-center animate-fade-in flex flex-col items-center justify-center py-6">
                  <div className="relative mb-10">
                    <div className="w-24 h-24 bg-green-xpale text-green-custom rounded-[32px] flex items-center justify-center text-4xl shadow-inner border border-green-pale">
                      <Trophy size={48} />
                    </div>
                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-indigo-custom text-white rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                      <Check size={16} strokeWidth={4} />
                    </div>
                  </div>
                  
                  <h3 className="text-4xl font-serif mb-4">Framework Assembled</h3>
                  <p className="text-on-surface-dim mb-10 text-lg max-w-[500px]">Your personalized profile for 2026 is ready to be cryptographically secured.</p>
                  
                  {data.country === 'India' && (
                    <div className="w-full max-w-[600px] mb-8 p-6 bg-indigo-xpale/30 border border-indigo-pale rounded-[32px] flex flex-col sm:flex-row items-center gap-6 animate-fade-in shadow-lg shadow-indigo-500/5">
                      <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-md shrink-0 ring-1 ring-indigo-pale">
                        <img 
                          src="https://avatars.githubusercontent.com/u/15012547?s=200&v=4" 
                          alt="DigiLocker" 
                          className="w-14 h-14 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-xs font-black uppercase text-indigo-custom tracking-widest mb-1">Recommended Integration</div>
                        <h4 className="font-bold text-lg leading-tight mb-2">Connect DigiLocker</h4>
                        <p className="text-xs text-on-surface-dim font-medium leading-relaxed">Automatically verify your identity and voter registration records in one click.</p>
                      </div>
                      <button 
                        onClick={() => {
                          const result = confirm('This will finalize onboarding and start the secure verification process. Continue?');
                          if (result) {
                            onComplete({ 
                              country: data.country as 'US' | 'India',
                              location: data.location,
                              isFirstTime: data.registrationStatus === 'no',
                              onboardingComplete: true,
                              preferences: {
                                notifications: true,
                                emailNotifications: true,
                                compactView: false,
                                language: 'en',
                                widgets: ['journey', 'score', 'representatives', 'voterId', 'alerts', 'tools']
                              }
                            });
                            // We set a flag to open verification flow on next load or just trigger it
                            localStorage.setItem('start_verification', 'id');
                          }
                        }}
                        className="w-full sm:w-auto px-8 py-3 bg-indigo-custom text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-500/20"
                      >
                        Secure Connect
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 w-full max-w-[600px] mb-4">
                    <div className="p-5 rounded-3xl bg-surface-low border border-outline/30 text-left">
                       <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim block mb-1">Region</span>
                       <span className="font-bold flex items-center gap-2">{data.country === 'India' ? '🇮🇳 India' : '🇺🇸 US'}</span>
                    </div>
                    <div className="p-5 rounded-3xl bg-surface-low border border-outline/30 text-left">
                       <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim block mb-1">Electorate</span>
                       <span className="font-bold">{data.ageGroup} Cohort</span>
                    </div>
                  </div>
                  <div className="mt-8 flex justify-center">
                    <button 
                      onClick={() => {
                        if (confirm('Clear all settings and start fresh?')) {
                          onReset();
                        }
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim hover:text-indigo-custom transition-all"
                    >
                      Stuck with old data? Reset Profile
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-12 flex gap-4 relative z-10">
                {step > 1 && step < stepsCount && (
                  <button 
                     onClick={() => setStep(s => s - 1)} 
                     className="px-8 py-5 rounded-[24px] border-2 border-outline hover:bg-surface-low transition-all text-on-surface-dim font-bold flex items-center gap-2"
                  >
                    <ArrowLeft size={20} />
                    Back
                  </button>
                )}
                <button 
                  onClick={next} 
                  disabled={isFinishing || authLoading || (step === 1 && !data.country) || (step === 2 && !data.ageGroup) || (step === 3 && !data.registrationStatus) || (step === (data.country ? 5 : 4) && !data.location.trim())}
                  className={`btn-primary flex-1 py-5 rounded-[24px] flex items-center justify-center gap-3 text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale`}
                >
                  {isFinishing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Finalizing Sync...
                    </>
                  ) : (
                    <>
                      {step === stepsCount ? (isAuthenticated ? 'Complete Setup' : 'Connect & Generate') : 'Protocol Next'}
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Sidebar Info */}
        <div className="hidden lg:block w-80 shrink-0 sticky top-32">
           <div className="bg-indigo-xpale/40 backdrop-blur-sm rounded-[32px] p-8 border border-indigo-pale shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                 <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-outline flex items-center justify-center">
                    <Info size={20} className="text-indigo-custom" />
                 </div>
                 <h4 className="font-bold text-sm uppercase tracking-tight">System Intel</h4>
              </div>
              
              <div className="space-y-8">
                 <SidebarInfo 
                    active={step === 1}
                    title="Legal Jurisdiction"
                    desc="ECI and FEC regulations differ significantly. We load the appropriate legal backend."
                 />
                 <SidebarInfo 
                    active={step === 2}
                    title="Demographic Mesh"
                    desc="Age-based policies (pensions, student loans) are prioritized in your feed."
                 />
                 <SidebarInfo 
                    active={step === 3}
                    title="Voter Registry"
                    desc="We establish if you need automated registration assistance."
                 />
                 <SidebarInfo 
                    active={!!data.location}
                    title="Geospatial Link"
                    desc="Local matching determines your Assembly or Congressional boundaries."
                 />
              </div>

              <div className="mt-12 pt-8 border-t border-indigo-pale/50">
                 <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-indigo-custom/60">
                    <Shield size={12} />
                    Verified Data Handling
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function SidebarInfo({ active, title, desc }: { active: boolean, title: string, desc: string }) {
  return (
    <div className={`transition-all duration-500 ${active ? 'opacity-100' : 'opacity-30'}`}>
       <div className="flex items-center gap-2 mb-2">
          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-indigo-custom animate-pulse' : 'bg-on-surface-dim'}`} />
          <h5 className="text-[10px] font-black uppercase tracking-widest">{title}</h5>
       </div>
       <p className="text-[11px] text-on-surface-dim leading-relaxed font-medium">{desc}</p>
    </div>
  );
}


function ProgressStep({ label, value, active, done }: { label: string, value: string, active: boolean, done: boolean }) {
  return (
    <div className={`transition-all duration-500 ${active ? 'opacity-100 scale-100' : done ? 'opacity-70 grayscale-0' : 'opacity-30'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black uppercase tracking-tighter">{label}</span>
        {done && <CheckCircle2 size={12} className="text-green-custom" />}
      </div>
      <div className="h-1.5 bg-indigo-pale rounded-full relative overflow-hidden">
        {active && <motion.div layoutId="active-bar" className="absolute inset-0 bg-indigo-custom" />}
        {done && <div className="absolute inset-0 bg-green-custom/50" />}
      </div>
      {value && <div className="text-[10px] font-bold text-on-surface mt-1 truncate">{value}</div>}
    </div>
  );
}

function ChoiceButton({ icon, label, sub, selected, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`p-6 rounded-[20px] border-2 text-left transition-all group ${
        selected ? 'bg-indigo-xpale border-indigo-custom shadow-md scale-[1.02]' : 'bg-surface-low border-outline hover:border-indigo-pale hover:bg-white'
      }`}
    >
      <span className="text-2xl mb-4 block group-hover:scale-110 transition-all">{icon}</span>
      <span className="text-[15px] font-bold block mb-1">{label}</span>
      <span className="text-xs text-on-surface-dim opacity-70">{sub}</span>
    </button>
  );
}

function CheckItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div 
      onClick={() => setChecked(!checked)}
      className={`flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${
        checked ? 'bg-green-pale border-green-light shadow-sm' : 'bg-surface-low border-outline'
      }`}
    >
      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
        checked ? 'bg-green-custom border-green-custom text-white' : 'border-outline-strong bg-white'
      }`}>
        {checked && <CheckCircle2 size={16} />}
      </div>
      <span className={`text-[15px] font-medium ${checked ? 'text-green-custom' : 'text-on-surface'}`}>{label}</span>
    </div>
  );
}

const US_TIMELINE: TimelineEvent[] = [
  { 
    title: 'Overseas Voter Registration (UOCAVA)', 
    date: 'Ongoing 2026', 
    description: 'Federal law (UOCAVA) requires states to provide ballots to overseas/military voters 45 days before federal elections.', 
    type: 'info', 
    level: 'federal',
    methods: ['mail'],
    source: 'FVAP.gov',
    sourceUrl: 'https://www.fvap.gov'
  },
  { 
    title: 'Mail Ballot Request Window Opens', 
    date: 'Sep 1, 2026', 
    description: 'Most states begin accepting and processing absentee ballot applications for the general election.', 
    type: 'info', 
    level: 'federal',
    methods: ['mail'],
    source: 'USA.gov',
    sourceUrl: 'https://www.usa.gov/absentee-voting'
  },
  { 
    title: 'Voter Registration Deadline (Most States)', 
    date: 'Oct 5 - Oct 15, 2026', 
    description: 'Closing window for registration in non-SDR (Same Day Registration) states.', 
    type: 'deadline', 
    critical: true, 
    level: 'federal',
    source: 'EAC.gov',
    sourceUrl: 'https://www.eac.gov'
  },
  { 
    title: 'Early Voting Period Begins', 
    date: 'Oct 20, 2026', 
    description: 'Nationwide rollout of early in-person polling locations begins.', 
    type: 'voting', 
    level: 'federal',
    methods: ['early', 'in-person'],
    source: 'NCSL.org',
    sourceUrl: 'https://www.ncsl.org'
  },
  { 
    title: 'General Election Day 2026', 
    date: 'Nov 3, 2026', 
    description: 'Polls open 7 AM - 8 PM. Midterm elections for US House, Senate, and Governorships.', 
    type: 'voting', 
    critical: true, 
    level: 'federal',
    methods: ['in-person'],
    source: 'Ballotpedia',
    sourceUrl: 'https://ballotpedia.org/United_States_Congress_elections,_2026'
  },
  { 
    title: 'State Certification Deadline', 
    date: 'Nov 24 - Dec 1, 2026', 
    description: 'Official results must be certified by state election directors.', 
    type: 'info', 
    level: 'state',
    source: 'EAC Guide',
    sourceUrl: 'https://www.eac.gov'
  }
];

const INDIA_TIMELINE: TimelineEvent[] = [
  { 
    title: 'Final Electoral Roll Publication', 
    date: 'Jan 5, 2026', 
    description: 'Election Commission of India publishes the final rolls for poll-bound states after SSR 2026.', 
    type: 'info', 
    level: 'federal',
    source: 'ECI.gov.in',
    sourceUrl: 'https://eci.gov.in'
  },
  { 
    title: 'Assam Assembly Polls', 
    date: 'Apr 2026', 
    description: 'Elections for the 126-member Assam Legislative Assembly.', 
    type: 'voting', 
    critical: true, 
    level: 'state',
    methods: ['in-person'],
    source: 'ECI Schedule',
    sourceUrl: 'https://eci.gov.in'
  },
  { 
    title: 'West Bengal Assembly Polls', 
    date: 'Apr - May 2026', 
    description: 'Multi-phase polling for the 294 seats of the WB Vidhan Sabha.', 
    type: 'voting', 
    critical: true, 
    level: 'state',
    methods: ['in-person'],
    source: 'ECI WB',
    sourceUrl: 'https://ceowestbengal.nic.in'
  },
  { 
    title: 'Tamil Nadu & Kerala Elections', 
    date: 'May 2026', 
    description: 'Simultaneous single-day polling for TN and Kerala Assemblies.', 
    type: 'voting', 
    critical: true, 
    level: 'state',
    methods: ['in-person'],
    source: 'ECI TN/KER',
    sourceUrl: 'https://eci.gov.in'
  },
  { 
    title: 'Counting of Votes (India States)', 
    date: 'May 10, 2026', 
    description: 'Live results from across all 5 polled states/UTs starting 8 AM. Ensure your identity is verified to participate in post-poll audits.', 
    type: 'info', 
    critical: true, 
    level: 'federal',
    source: 'ECI Results Portal',
    sourceUrl: 'https://results.eci.gov.in'
  },
  { 
    title: 'Panchayat General Elections', 
    date: 'Aug - Sep 2026', 
    description: 'Local body polls in rural districts across various Indian states.', 
    type: 'voting', 
    level: 'local',
  }
];

const MOCK_REPRESENTATIVES: Record<string, { federal: Representative[], state: Representative[], local: Representative[] }> = {
  'India': {
    federal: [
      { 
        name: 'Droupadi Murmu', 
        office: 'President of India', 
        party: 'Independent', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/e/ed/Smt._Droupadi_Murmu_official_portrait_%281%29.jpg&w=200&h=200&fit=cover',
        officialPortal: 'https://presidentofindia.nic.in',
        email: 'presidentofindia@rb.nic.in'
      },
      { 
        name: 'Narendra Modi', 
        office: 'Prime Minister', 
        party: 'BJP', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/8/80/Narendra_Modi_Official_Portrait_2022.jpg&w=200&h=200&fit=cover',
        officialPortal: 'https://www.narendramodi.in',
        email: 'narendramodi@pmindia.gov.in'
      },
      { 
        name: 'Amit Shah', 
        office: 'Minister of Home Affairs', 
        party: 'BJP', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/b/bc/Amit_Shah_%28cropped%29.jpg&w=200&h=200&fit=cover',
        email: 'amitshah.mp@sansad.nic.in'
      },
      { 
        name: 'S. Jaishankar', 
        office: 'Minister of External Affairs', 
        party: 'BJP', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/6/6f/S._Jaishankar.jpg&w=200&h=200&fit=cover',
        email: 'eam@mea.gov.in'
      }
    ],
    state: [
      { 
        name: 'Vinai Kumar Saxena', 
        office: 'Lieutenant Governor', 
        party: 'Independent', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/9/9c/Vinai_Kumar_Saxena.jpg&w=200&h=200&fit=cover',
        officialPortal: 'https://lg.delhi.gov.in',
        email: 'lgdelhi@nic.in'
      },
      { 
        name: 'Atishi Marlena', 
        office: 'Chief Minister', 
        party: 'AAP', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/e/e0/Atishi_Marlena_Singh.jpg&w=200&h=200&fit=cover',
        officialPortal: 'https://delhi.gov.in',
        email: 'cmdelhi@nic.in'
      },
      {
        name: 'Kailash Gahlot',
        office: 'Transport Minister',
        party: 'AAP',
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/c/cd/Kailash_Gahlot_July_2023.jpg&w=200&h=200&fit=cover',
        email: 'kgahlot@delhi.gov.in'
      }
    ],
    local: [
      { 
        name: 'Bansuri Swaraj', 
        office: 'Member of Parliament (New Delhi)', 
        party: 'BJP', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/d/d1/Bansuri_Swaraj_in_2023.jpg&w=200&h=200&fit=cover', 
        email: 'bansuri.swaraj@sansad.nic.in' 
      },
      { 
        name: 'Arvind Kejriwal', 
        office: 'MLA (New Delhi constituency)', 
        party: 'AAP', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/3/36/Arvind_Kejriwal%2C_Chief_Minister_of_Delhi.jpg&w=200&h=200&fit=cover', 
        email: 'coordinator-mla-nd@delhi.gov.in' 
      },
      { name: 'Dr. Shelly Oberoi', office: 'Mayor', party: 'AAP', photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/7/7e/Shelly_Oberoi.jpg&w=200&h=200&fit=cover', email: 'mayor-mcd@delhi.gov.in' },
      { name: 'Ward Councillor', office: 'Municipal Corporation', party: 'Independent', photo: '', email: 'councillor@mcd.org.in' }
    ]
  },
  'US': {
    federal: [
      { 
        name: 'Joe Biden', 
        office: 'President', 
        party: 'Democratic', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/6/68/Joe_Biden_presidential_portrait.jpg&w=200&h=200&fit=cover',
        officialPortal: 'https://www.whitehouse.gov',
        email: 'president@whitehouse.gov'
      },
      { 
        name: 'Kamala Harris', 
        office: 'Vice President', 
        party: 'Democratic', 
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/4/41/Kamala_Harris_Official_Vice_Presidential_Portrait.jpg&w=200&h=200&fit=cover',
        officialPortal: 'https://www.whitehouse.gov',
        email: 'vice.president@whitehouse.gov'
      },
      {
        name: 'Alex Padilla',
        office: 'US Senator (CA)',
        party: 'Democratic',
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/2/23/Alex_Padilla_Official_Portrait.jpg&w=200&h=200&fit=cover',
        email: 'padilla@senate.gov'
      },
      {
        name: 'Nancy Pelosi',
        office: 'US Representative',
        party: 'Democratic',
        photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/a/af/Nancy_Pelosi_Official_Portrait.jpg&w=200&h=200&fit=cover',
        email: 'pelosi@mail.house.gov'
      }
    ],
    state: [
      { name: 'Gavin Newsom', office: 'Governor', party: 'Democratic', photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/0/05/Gavin_Newsom_Official_Portrait.jpg&w=200&h=200&fit=cover', email: 'governor@gov.ca.gov' },
      { name: 'Eleni Kounalakis', office: 'Lt. Governor', party: 'Democratic', photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/c/c5/Eleni_Kounalakis_Official_Portrait.jpg&w=200&h=200&fit=cover', email: 'info@ltg.ca.gov' }
    ],
    local: [
      { name: 'London Breed', office: 'Mayor', party: 'Democratic', photo: 'https://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/7/75/London_Breed_Official_Portrait.jpg&w=200&h=200&fit=cover', email: 'mayorlondonbreed@sfgov.org' },
      { name: 'County Supervisor', office: 'Board of Supervisors', party: 'Non-partisan', photo: '', email: 'supervisor@sfgov.org' },
      { name: 'Police Commissioner', office: 'SFPD Board', party: 'Non-partisan', photo: '', email: 'commissioner@sfgov.org' }
    ]
  }
};

function Dashboard({ 
  profile, 
  journey, 
  onToggleStep, 
  onNavigate, 
  onSettings, 
  onRefreshProfile,
  showVerificationFlow,
  setShowVerificationFlow,
  verificationMode,
  setVerificationMode,
  onVerificationComplete
}: any) {
  const isIndia = profile.country === 'India';
  const [verifying, setVerifying] = useState(false);
  const idVerified = profile.idVerified || false;
  const [showCelebration, setShowCelebration] = useState(false);
  const today = new Date('2026-05-03'); // Based on metadata

  const [simulatedEmails, setSimulatedEmails] = useState<{id: string, text: string}[]>([]);

  useEffect(() => {
    if (profile?.preferences?.emailNotifications) {
      const timeline = isIndia ? INDIA_TIMELINE : US_TIMELINE;
      const criticalDeadlines = timeline.filter(t => t.critical);
      
      criticalDeadlines.forEach(deadline => {
        // Special case for our demo deadline
        const dDate = deadline.date.includes('May 10') ? new Date('2026-05-10') : new Date(deadline.date);
        const diffTime = dDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 7) {
           const emailId = `email-rem-${deadline.title}`;
           setSimulatedEmails(prev => {
             if (prev.find(e => e.id === emailId)) return prev;
             return [...prev, { id: emailId, text: `SYSTEM: Email sent to ${profile.email} regarding "${deadline.title}"` }];
           });
        }
      });
    } else {
      setSimulatedEmails([]);
    }
  }, [profile, isIndia]);

  const handleToggleStep = async (stepId: string) => {
    const step = journey.steps.find((s: Step) => s.id === stepId);
    if ((stepId === 'confirm_vote' || stepId === 'confirm_vote_in') && step?.status !== 'completed') {
      setShowCelebration(true);
    }
    await onToggleStep(stepId);
  };

  const handleVerifyId = async () => {
    setVerifying(true);
    setTimeout(async () => {
      setVerifying(false);
      // Persist to profile
      try {
        await updateUserProfile(profile.uid, { idVerified: true });
        if (onRefreshProfile) await onRefreshProfile();
      } catch (e) {
        console.error("Failed to update verification status", e);
      }
    }, 2000);
  };

  const regStep = journey.steps.find((s: any) => s.id === (isIndia ? 'registration_in' : 'registration'));
  const showAddressPrompt = regStep?.status !== 'completed' && !profile.address;

  const widgets = profile.preferences?.widgets || ['journey', 'score', 'representatives', 'voterId', 'alerts', 'tools'];
  
  // Calculate next major milestone dynamically
  const timeline = isIndia ? INDIA_TIMELINE : US_TIMELINE;
  
  const getMilestoneDate = (dateStr: string) => {
    if (dateStr.includes('Nov 3')) return new Date('2026-11-03');
    if (dateStr.includes('May 14')) return new Date('2026-05-14');
    if (dateStr.includes('Apr')) return new Date('2026-04-15');
    if (dateStr.includes('Oct 15')) return new Date('2026-10-15');
    if (dateStr.includes('Oct 26')) return new Date('2026-10-26');
    if (dateStr.includes('Sep')) return new Date('2026-09-15');
    return new Date('2026-12-31');
  };

  const nextMilestone = timeline.find(e => getMilestoneDate(e.date) > today) || timeline[timeline.length - 1];
  const nextMilestoneDate = getMilestoneDate(nextMilestone.date);
  const diffDays = Math.ceil((nextMilestoneDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

  const reps = MOCK_REPRESENTATIVES[profile.country as keyof typeof MOCK_REPRESENTATIVES] || 
               MOCK_REPRESENTATIVES['US'] || 
               { federal: [], state: [], local: [] };
  const [syncingReps, setSyncingReps] = useState(false);

  useEffect(() => {
    if (profile.location) {
      setSyncingReps(true);
      const timer = setTimeout(() => setSyncingReps(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [profile.location]);

  const getLocalizedOffice = (rep: Representative) => {
    if (!profile.location) return rep.office;
    // Append location to general offices
    const generalOffices = ['Mayor', 'Chief Minister', 'State Education Minister', 'Member of Parliament', 'Legislative Assembly', 'Municipal Corporation', 'Police Commissioner', 'County Supervisor', 'Board of Supervisors'];
    if (generalOffices.includes(rep.office)) {
      return `${rep.office} (${profile.location})`;
    }
    return rep.office;
  };

  const handleVerificationComplete = async (mode: string) => {
    if (onVerificationComplete) {
      await onVerificationComplete(mode);
    } else {
      if (onRefreshProfile) await onRefreshProfile();
      setShowVerificationFlow(false);
    }
  };

  const widgetRenderers: Record<string, () => React.ReactNode> = {
    journey: () => <JourneyWidget key="journey" journey={journey} onToggleStep={handleToggleStep} today={today} country={profile.country} />,
    score: () => (
      <div key="score" className="card-hover card bg-indigo-custom text-white border-0 shadow-indigo-500/20">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
          <Trophy size={20} />
          Civic Score
        </h3>
        <div className="text-5xl font-serif mb-2">{profile.points}</div>
        <p className="text-indigo-pale text-xs mb-6">You're in the top 15% of active voters in your region.</p>
        <button 
          onClick={() => onNavigate('timeline')}
          className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-all border border-white/20"
        >
          View Region Rankings
        </button>
      </div>
    ),
    voterId: () => (
      <div key="voterId" className="card-hover card border-indigo-pale bg-gradient-to-br from-white to-indigo-xpale/20 overflow-hidden relative">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-custom opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Fingerprint size={20} className="text-indigo-custom" />
            Voter Identity Wallet
          </h3>
          <div className="px-2 py-0.5 bg-indigo-custom text-white text-[8px] font-black uppercase rounded shadow-sm">Encrypted • P2P</div>
        </div>
        
        <div className="space-y-4">
          <div className="p-5 bg-white border border-outline rounded-3xl shadow-sm relative overflow-hidden group">
            {verifying && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex items-center justify-center flex-col gap-3">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-indigo-pale rounded-full shadow-inner" />
                  <div className="absolute inset-0 border-4 border-indigo-custom rounded-full border-t-transparent animate-spin shadow-indigo-500/10" />
                </div>
                <div className="text-[10px] font-black text-indigo-custom tracking-widest uppercase animate-pulse">Establishing Secure Handshake...</div>
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className={idVerified ? 'text-green-custom' : 'text-on-surface-dim'} />
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim">Verified identity</span>
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${idVerified ? 'bg-green-pale text-green-custom' : 'bg-amber-pale text-amber-custom'}`}>
                {idVerified ? 'ACTIVE' : 'ACTION REQ.'}
              </div>
            </div>
            <div className="text-xs font-serif font-bold text-on-surface-dim mb-1">
              {isIndia ? 'Identity Proof Documents' : 'Official State ID:'}
            </div>
            <div className={`space-y-3 mt-4 ${idVerified || syncingReps ? 'text-on-surface' : 'text-on-surface/30'}`}>
              <div className="flex items-center justify-between p-2.5 bg-surface-low rounded-xl border border-outline/30 group">
                <span className="text-[10px] font-black uppercase text-on-surface-dim">{isIndia ? 'Voter ID (EPIC)' : 'Driver License'}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tracking-widest text-sm font-bold">
                    {idVerified ? (profile?.voterIdNumber || 'PROCESSING...') : 'NOT_LINKED'}
                  </span>
                  {idVerified && profile?.verificationMethod === 'digilocker' && (
                    <div className="p-1 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                      <Cloud size={10} className="text-indigo-custom" />
                    </div>
                  )}
                </div>
              </div>
              {idVerified && profile?.panCardNumber && (
                <div className="flex items-center justify-between p-2.5 bg-surface-low rounded-xl border border-outline/30 group animate-fade-in">
                  <span className="text-[10px] font-black uppercase text-on-surface-dim">PAN Card</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tracking-widest text-sm font-bold">{profile.panCardNumber}</span>
                    <div className="p-1 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                      <Shield size={10} className="text-indigo-custom" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {!idVerified && (
              <div className="flex justify-end mt-4">
                <button 
                  onClick={() => { setVerificationMode('id'); setShowVerificationFlow(true); }} 
                  className="px-4 py-2 bg-indigo-custom text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"
                >
                  Verify Now
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => { setVerificationMode('id'); setShowVerificationFlow(true); }}
              className={`p-4 rounded-2xl border transition-all group text-left relative overflow-hidden ${
                idVerified && profile?.verificationMethod === 'digilocker' 
                ? 'bg-indigo-xpale border-indigo-custom' 
                : 'bg-surface-low border-outline hover:border-indigo-pale'
              }`}
            >
              <div className="text-[9px] font-black uppercase text-on-surface-dim mb-1">Government API</div>
              <div className="text-xs font-bold flex items-center gap-1 group-hover:text-indigo-custom">
                {isIndia ? 'DigiLocker' : 'DMV Mobile'}
                {idVerified && profile?.verificationMethod === 'digilocker' ? <CheckCircle2 size={10} className="text-green-custom" /> : <ExternalLink size={10} />}
              </div>
              {idVerified && profile?.verificationMethod === 'digilocker' && (
                <div className="absolute top-1 right-1 opacity-10">
                  <Cloud size={40} />
                </div>
              )}
            </button>
            <div className="p-4 bg-surface-low rounded-2xl border border-outline flex flex-col justify-center">
              <div className="text-[9px] font-black uppercase text-on-surface-dim mb-1">Status</div>
              <div className={`text-xs font-bold flex items-center gap-1 ${profile?.registrationStatus === 'verified' ? 'text-green-custom' : profile?.registrationStatus === 'pending' ? 'text-amber-custom' : 'text-on-surface-dim'}`}>
                {profile?.registrationStatus === 'verified' ? 'Verified' : profile?.registrationStatus === 'pending' ? 'Pending' : 'Not Linked'}
                <Activity size={10} className={profile?.registrationStatus === 'pending' ? 'animate-pulse' : ''} />
              </div>
            </div>
          </div>
          
          <div className="mt-2 space-y-3">
            <button 
              onClick={() => {
                setVerificationMode('registration');
                setShowVerificationFlow(true);
              }}
              className="w-full flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl text-sm font-bold shadow-xl shadow-slate-900/10 hover:translate-y-[-2px] active:translate-y-[0] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                  <FileText size={16} />
                </div>
                <span>Start Guided Registration</span>
              </div>
              <ChevronRight size={16} className="text-white/40 group-hover:translate-x-1 transition-all" />
            </button>
            
            <button 
              onClick={() => { setVerificationMode('ballot'); setShowVerificationFlow(true); }}
              className="w-full flex items-center justify-center p-4 bg-white border-2 border-indigo-pale text-indigo-custom rounded-2xl text-sm font-bold hover:bg-indigo-xpale hover:border-indigo-custom transition-all gap-2"
            >
              <Mail size={16} />
              {isIndia ? 'Postal Ballot Request' : 'Mail-in Ballot Application'}
            </button>
          </div>
        </div>
      </div>
    ),
    representatives: () => (
      <div key="representatives" className="card-hover card space-y-6 relative overflow-hidden min-h-[300px]">
        {syncingReps && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center animate-fade-in">
            <div className="flex gap-1 mb-4">
              {[0, 1, 2].map(i => (
                <motion.div 
                  key={i}
                  animate={{ height: [8, 24, 8] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                  className="w-1.5 bg-indigo-custom rounded-full"
                />
              ))}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-custom animate-pulse text-center">
              Syncing Regional Database<br/>
              <span className="text-on-surface-dim opacity-50 font-mono tracking-tighter">Querying for {profile.location}...</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2 text-on-surface">
            <Users size={18} className="text-indigo-custom" />
            My Representatives
          </h3>
          <div className="group relative">
            <Info size={14} className="text-on-surface-dim cursor-help" />
            <div className="absolute right-0 top-6 w-48 p-3 bg-slate-800 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              Verified mapping for {profile?.location || 'your region'}.
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3 px-1 border-l-2 border-indigo-custom ml-1">
              <div className="text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Federal Level</div>
              <div className="text-[8px] bg-indigo-xpale text-indigo-custom px-1.5 py-0.5 rounded font-black uppercase">Official</div>
            </div>
            <div className="space-y-3">
              {reps.federal.map((r: Representative) => <div key={r.name}><RepCard rep={{ ...r, office: getLocalizedOffice(r) }} /></div>)}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-3 px-1 border-l-2 border-slate-400 ml-1">
              <div className="text-[10px] font-black text-on-surface-dim uppercase tracking-widest">State & Local</div>
              <div className="flex items-center gap-1 text-[8px] text-on-surface-dim px-1.5 py-0.5 border border-outline rounded font-black uppercase">
                <Globe size={8} />
                {profile.location || 'Regional'}
              </div>
            </div>
            <div className="space-y-3">
              {[...reps.state, ...reps.local].map((r: Representative) => <div key={r.name}><RepCard rep={{ ...r, office: getLocalizedOffice(r) }} /></div>)}
            </div>
          </section>
        </div>
      </div>
    ),
    alerts: () => {
      const isRegistrationPending = profile?.registrationStatus === 'pending';
      const isBallotApplied = profile?.ballotApplied;

      return (
        <div key="alerts" className="space-y-4">
          {profile?.country === 'India' && !profile?.idVerified && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="p-6 bg-gradient-to-br from-indigo-custom to-indigo-700 text-white rounded-[32px] shadow-xl shadow-indigo-500/30 relative overflow-hidden group border border-white/10"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Cloud size={80} />
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-indigo-100">
                <ShieldCheck size={12} />
                Critical Task
              </div>
              <h4 className="text-xl font-bold mb-2 leading-tight">Identity Not Verified</h4>
              <p className="text-xs text-indigo-100/70 mb-6 leading-relaxed">Connect your DigiLocker account to unlock full election features and secure your Voter ID wallet.</p>
              <button 
                onClick={() => { setVerificationMode('id'); setShowVerificationFlow(true); }}
                className="w-full py-3 bg-white text-indigo-custom rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-lg"
              >
                Connect DigiLocker Now
              </button>
            </motion.div>
          )}

          {simulatedEmails.map(notif => (
            <motion.div 
              key={notif.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-indigo-custom text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 flex items-center gap-3"
            >
              <Mail size={14} className="animate-bounce" />
              {notif.text}
            </motion.div>
          ))}
          {!idVerified && (
            <div className="card bg-amber-pale/30 border-amber-custom/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-pale text-amber-custom rounded-xl flex items-center justify-center">
                  <AlertCircle size={20} />
                </div>
                <h3 className="font-bold text-amber-custom">Action Required</h3>
              </div>
              <p className="text-xs text-amber-custom font-medium leading-relaxed mb-6 italic">
                "{isIndia ? 'EPIC authentication' : 'Voter ID verification'} window for the 2026 local polls opens in {diffDays} days. Prepare your documents."
              </p>
              <div className="flex items-center justify-between">
                <button className="text-[10px] font-black uppercase tracking-widest text-amber-custom hover:underline">
                  Remind me later
                </button>
                <button 
                  onClick={() => {
                    setVerificationMode('id');
                    setShowVerificationFlow(true);
                  }}
                  className="px-3 py-1 bg-amber-custom text-white rounded text-[10px] font-bold hover:bg-amber-600 transition-colors"
                >
                  Verify Now
                </button>
              </div>
            </div>
          )}

          {isRegistrationPending && (
            <div className="card bg-indigo-xpale border-indigo-pale shadow-sm animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-custom text-white rounded-lg flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <h3 className="font-bold text-sm">Registration Processing</h3>
              </div>
              <p className="text-[11px] text-on-surface-dim leading-relaxed">
                Your voter registration request for <span className="font-bold">{profile.location}</span> was submitted. Official verification usually takes 3-5 business days.
              </p>
            </div>
          )}

          {isBallotApplied && (
            <div className="card bg-green-pale/30 border-green-custom/20 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-custom text-white rounded-lg flex items-center justify-center">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Ballot Requested</h3>
                  <p className="text-[11px] text-green-700">Application received by local election office.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    },
    tools: () => (
      <div key="tools" className="card-hover card">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-on-surface">
          <PlayCircle size={18} className="text-indigo-custom" />
          Quick Tools
        </h3>
        <div className="space-y-3">
          {[
            { icon: '🎬', label: 'Simulate Voting', id: 'simulation' },
            { icon: '🕵️', label: 'MythBuster bot', id: 'mythbuster' },
            { icon: '📅', label: 'Timeline View', id: 'timeline' },
            { icon: '🏘️', label: 'Find Polling Booth', id: 'help' }
          ].map(tool => (
            <button 
              key={tool.id}
              onClick={() => onNavigate(tool.id)}
              className="w-full flex items-center justify-between p-4 bg-surface-low hover:bg-indigo-xpale rounded-2xl transition-all group border border-transparent hover:border-indigo-pale"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl group-hover:scale-110 transition-transform">{tool.icon}</span>
                <span className="text-sm font-bold text-on-surface-dim group-hover:text-indigo-custom transition-colors">{tool.label}</span>
              </div>
              <ChevronRight size={16} className="text-outline-strong group-hover:text-indigo-custom group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>
      </div>
    )
  };

  const leftWidgets = widgets.filter(w => w === 'journey');
  const rightWidgets = widgets.filter(w => w !== 'journey');

  return (
    <div className="py-12 animate-fade-in">
      <AnimatePresence>
        {showCelebration && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-indigo-custom/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-white rounded-[40px] p-12 text-center shadow-2xl"
            >
              <div className="w-24 h-24 bg-green-custom/10 text-green-custom rounded-full flex items-center justify-center text-5xl mx-auto mb-8 border-4 border-green-custom shadow-lg">
                🗳️
              </div>
              <h2 className="text-4xl font-serif mb-4">You Voted!</h2>
              <p className="text-on-surface-dim mb-10 text-lg">Thank you for strengthening {profile.country}'s democracy. Your participation makes a difference.</p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    const text = `I just confirmed my vote for the 2026 elections via CivicTrust! 🗳️💪 Join the mission: ${window.location.origin}`;
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`);
                  }}
                  className="w-full btn-primary py-4 rounded-2xl flex items-center justify-center gap-3 text-lg"
                >
                  <Share size={20} />
                  Share My Status
                </button>
                <button 
                  onClick={() => setShowCelebration(false)}
                  className="w-full py-4 text-on-surface-dim font-bold hover:text-on-surface transition-all"
                >
                  Continue to Dashboard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showVerificationFlow && (
          <VerificationFlow 
            profile={profile} 
            mode={verificationMode}
            onClose={() => setShowVerificationFlow(false)}
            onComplete={(m) => {
              handleVerificationComplete(m);
              // Small celebration or feedback here could be good
            }}
          />
        )}
      </AnimatePresence>

      {/* Header / Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-white p-8 rounded-[32px] border border-outline shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-serif">Voter Insights</h1>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-green-pale text-green-custom text-[10px] font-black uppercase tracking-widest rounded-md border border-green-custom/20">
              <div className="w-1.5 h-1.5 bg-green-custom rounded-full animate-pulse" />
              Live Sync
            </div>
          </div>
          <p className="text-on-surface-dim font-medium">
            Welcome back, <span className="text-indigo-custom font-bold">{profile.name}</span>. Your {profile.country} civic profile is up to date.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onSettings} className="px-4 py-2 bg-surface-low border border-outline hover:border-indigo-pale rounded-xl text-xs font-bold text-on-surface-dim transition-all flex items-center gap-2">
            <Settings size={14} />
            Preferences
          </button>
          <div className="px-4 py-2 bg-indigo-xpale text-indigo-custom rounded-xl text-xs font-bold border border-indigo-pale flex items-center gap-2">
            <MapPin size={14} />
            {profile.location}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddressPrompt && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-8 overflow-hidden"
          >
            <div className="bg-amber-custom/10 border border-amber-custom/20 p-6 rounded-[24px] flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-custom text-white rounded-2xl flex items-center justify-center shrink-0">
                  <MapPin size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-amber-900">Verify Your Address</h4>
                  <p className="text-sm text-amber-800/80">Your registration is pending. Ensure your address matches your official {isIndia ? 'Aadhar/Voter ID' : 'State ID'} to avoid issues at the polls.</p>
                </div>
              </div>
              <button 
                onClick={onSettings}
                className="btn-primary bg-amber-custom hover:bg-amber-600 border-0 whitespace-nowrap"
              >
                Update Profile
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-3 gap-8 mb-12">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
          {leftWidgets.map(wId => widgetRenderers[wId]?.())}
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          {rightWidgets.map(wId => widgetRenderers[wId]?.())}
        </div>
      </div>
    </div>
  );
}

function JourneyWidget({ journey, onToggleStep, today, country }: any) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const isIndia = country === 'India';

  const mailInInfo = isIndia 
    ? {
        title: "Postal Ballot Eligibility",
        bullets: [
          "Voters on Election Duty",
          "Voters above 85 years of age",
          "Voters with physical disabilities (40% benchmark)",
          "Voters in Essential Services"
        ],
        process: "Apply via Form 12D with his/her local Returning Officer within 5 days of election notification."
      }
    : {
        title: "Absentee Ballot Eligibility",
        bullets: [
          "Will be away from jurisdiction on Election Day",
          "Illness or physical disability",
          "Religious belief conflict",
          "Work obligation during poll hours"
        ],
        process: "Request online via your state's portal or use the FPCA for overseas/military. Deadlines vary by state (usually 7-14 days before election)."
      };

  return (
    <div className="card shadow-lg border-indigo-pale/50 overflow-hidden relative">
      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
        <Vote size={120} />
      </div>
      
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-xpale text-indigo-custom rounded-2xl flex items-center justify-center">
            <LayoutDashboard size={24} />
          </div>
          <h2 className="text-2xl font-bold">Your Voting Journey</h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black text-on-surface-dim uppercase tracking-widest mb-1">Overall Readiness</div>
          <div className="text-2xl font-serif text-indigo-custom">{Math.round(journey.progress)}%</div>
        </div>
      </div>

      <div className="relative pl-8 border-l-2 border-outline-strong space-y-12 ml-4">
        {journey.steps.map((step: Step) => (
          <div key={step.id} className="relative group">
            <button 
              onClick={() => onToggleStep(step.id)}
              className={`absolute -left-12 top-0 w-8 h-8 rounded-full border-4 border-surface flex items-center justify-center transition-all ${
                step.status === 'completed' ? 'bg-green-custom border-green-custom text-white' : 'bg-surface-high text-on-surface-dim group-hover:border-indigo-pale'
              }`}
            >
              {step.status === 'completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className={`font-bold text-lg mb-1 ${step.status === 'completed' ? 'text-on-surface/50 line-through' : 'text-on-surface'}`}>
                  {step.title}
                </h4>
                <p className="text-sm text-on-surface-dim leading-relaxed max-w-xl text-balance">{step.description}</p>
                {(step.id === 'mail_ballot' || step.id === 'voter_id_in') && (
                  <div className="mt-4">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedStep(expandedStep === step.id ? null : step.id);
                      }}
                      className="text-xs font-bold text-indigo-custom flex items-center gap-1 hover:underline"
                    >
                      <HelpCircle size={14} />
                      {expandedStep === step.id ? 'Hide Details' : 'View Eligibility & Process'}
                    </button>
                    
                    <AnimatePresence>
                      {expandedStep === step.id && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 p-5 bg-indigo-xpale rounded-2xl border border-indigo-pale animate-fade-in">
                            <h5 className="font-bold text-sm text-indigo-custom mb-3">{mailInInfo.title}</h5>
                            <ul className="space-y-2 mb-4">
                              {mailInInfo.bullets.map((b, i) => (
                                <li key={i} className="text-xs text-on-surface-dim flex items-start gap-2">
                                  <div className="w-1.5 h-1.5 bg-indigo-custom rounded-full shrink-0 mt-1" />
                                  {b}
                                </li>
                              ))}
                            </ul>
                            <div className="pt-3 border-t border-indigo-pale/30 text-xs leading-relaxed">
                              <span className="font-bold opacity-70 uppercase text-[9px] block mb-1">How to apply:</span>
                              {mailInInfo.process}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              {step.dueDate && (
                <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter whitespace-nowrap ${
                  new Date(step.dueDate) < today ? 'bg-indigo-pale text-indigo-custom border border-indigo-pale' : 'bg-surface-low text-on-surface-dim border border-outline'
                }`}>
                  Due: {new Date(step.dueDate).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RepCard({ rep }: { rep: Representative }) {
  const mailToLink = rep.email ? `mailto:${rep.email}?subject=Official Constituent Communication&body=Dear ${rep.name},%0D%0A%0D%0AAs a resident of your district, I am writing to express my views on current local and national legislative matters.%0D%0A%0D%0A[ENTER YOUR MESSAGE HERE]%0D%0A%0D%0ASincerely,%0D%0A[YOUR NAME]%0D%0A%0D%0A---%0D%0AThis email was composed via CivicTrust Verified Citizen Identity Portal.` : '';
  
  // Use a reliable proxy and fallback for images
  const photoUrl = rep.photo ? `https://wsrv.nl/?url=${encodeURIComponent(rep.photo)}&w=200&h=200&fit=cover&default=https://ui-avatars.com/api/?name=${encodeURIComponent(rep.name)}&background=indigo&color=fff&bold=true` : `https://ui-avatars.com/api/?name=${encodeURIComponent(rep.name)}&background=EEF2FF&color=4F46E5&bold=true`;

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-outline/30 rounded-2xl group hover:border-indigo-custom hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <div className="relative">
          <img 
            src={photoUrl} 
            alt={rep.name} 
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-full border-2 border-white shadow-sm group-hover:scale-105 transition-transform object-cover" 
          />
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm border border-outline/20">
            <Shield size={8} className="text-indigo-custom" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-bold text-on-surface group-hover:text-indigo-custom transition-colors">{rep.name}</div>
            {rep.name.startsWith('Local') && (
              <span className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded font-black uppercase">Simulated</span>
            )}
          </div>
          <div className="text-[10px] text-on-surface-dim font-black uppercase tracking-wider">{rep.office} • {rep.party}</div>
        </div>
      </div>
      <div className="flex gap-2">
        {rep.email && (
          <a 
            href={mailToLink}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-xpale text-indigo-custom hover:bg-indigo-custom hover:text-white transition-all rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm"
            title="Send Verified Email"
          >
            <Mail size={12} />
            Contact
          </a>
        )}
        {rep.officialPortal && (
          <a 
            href={rep.officialPortal} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="p-2.5 text-on-surface-dim hover:text-indigo-custom transition-all hover:bg-indigo-xpale rounded-xl border border-outline/20 hover:border-indigo-pale"
            title="Official Portal"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: any) {
  return (
    <div className="card flex flex-col gap-2 hover:border-indigo-custom transition-all">
      <div className="text-[10px] font-bold text-on-surface-dim uppercase tracking-widest">{label}</div>
      <div className="text-3xl font-serif text-indigo-custom">{value}</div>
      <div className="text-[10px] text-on-surface-dim font-medium">{sub}</div>
    </div>
  );
}

function ToolCard({ icon, title, sub, onClick }: any) {
  return (
    <button onClick={onClick} className="p-4 rounded-xl border border-outline hover:border-indigo-custom hover:bg-surface-low transition-all text-left flex flex-col gap-2">
      <div className="text-indigo-custom">{icon}</div>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-[11px] text-on-surface-dim">{sub}</div>
    </button>
  );
}

function TimelineView({ profile }: { profile: UserProfile | null }) {
  const [filter, setFilter] = useState<'all' | 'deadline' | 'voting' | 'info'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'mail' | 'in-person' | 'early'>('all');
  const [level, setLevel] = useState<'all' | 'federal' | 'state' | 'local'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const timeline = profile?.country === 'India' ? INDIA_TIMELINE : US_TIMELINE;

  const shareEvent = async (event: any) => {
    const shareText = `Election Update: ${event.title} - ${event.date}. ${event.description} Stay informed with CivicTrust!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CivicTrust Election Event',
          text: shareText,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Sharing failed', err);
      }
    } else {
      navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      alert('Event link copied to clipboard!');
    }
  };

  const filteredEvents = timeline.filter(e => {
    const typeMatch = filter === 'all' || e.type === filter;
    const levelMatch = level === 'all' || e.level === level;
    const methodMatch = methodFilter === 'all' || (e.methods && e.methods.includes(methodFilter as any));
    const searchMatch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       e.level.toLowerCase().includes(searchQuery.toLowerCase());
    return typeMatch && levelMatch && methodMatch && searchMatch;
  });

  const today = new Date('2026-05-02');
  const getEventDate = (dateStr: string) => {
    if (dateStr.includes('Nov 3')) return new Date('2026-11-03');
    if (dateStr.includes('May 14')) return new Date('2026-05-14');
    if (dateStr.includes('Apr')) return new Date('2026-04-15');
    if (dateStr.includes('Sep')) return new Date('2026-09-15');
    if (dateStr.includes('Jan')) return new Date('2026-01-05');
    return new Date('2026-12-31');
  };

  const progressPct = Math.min(100, Math.max(0, (today.getTime() - new Date('2026-01-01').getTime()) / (new Date('2026-11-30').getTime() - new Date('2026-01-01').getTime()) * 100));

  return (
    <div className="max-w-[1000px] mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <div className="w-16 h-16 bg-indigo-xpale text-indigo-custom rounded-full flex items-center justify-center text-2xl mx-auto mb-6">📅</div>
        <h2 className="text-4xl font-serif mb-3">Official Election Timeline</h2>
        <p className="text-on-surface-dim">Every critical milestone for 2026, synchronized with government sources.</p>
        
        {/* Progress Visual */}
        <div className="mt-8 max-w-[600px] mx-auto">
          <div className="flex justify-between text-[10px] font-black text-on-surface-dim uppercase tracking-widest mb-2">
            <span>Jan 2026</span>
            <span className="text-indigo-custom animate-pulse">Current: May 2</span>
            <span>Dec 2026</span>
          </div>
          <div className="h-4 bg-surface-high rounded-full overflow-hidden border border-outline/30 p-1">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              className="h-full bg-gradient-to-r from-indigo-custom via-indigo-light to-indigo-custom rounded-full shadow-[0_0_10px_rgba(53,37,205,0.3)]"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 mb-12 sticky top-4 z-30 bg-surface/95 backdrop-blur-md p-6 rounded-[32px] border border-outline shadow-xl shadow-indigo-900/5 transition-all">
        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-dim group-focus-within:text-indigo-accent transition-colors">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Search titles, descriptions, or locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-outline rounded-2xl pl-12 pr-6 py-4 text-sm font-medium focus:outline-none focus:border-indigo-accent focus:ring-4 focus:ring-indigo-accent/5 transition-all shadow-sm"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-low rounded-full transition-all"
            >
              <div className="w-4 h-4 text-on-surface-dim">✕</div>
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Type Filter */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-on-surface-dim uppercase tracking-widest px-1">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'deadline', 'voting', 'info'] as const).map(f => (
                <button 
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    filter === f ? 'bg-indigo-custom border-indigo-custom text-white shadow-lg shadow-indigo-500/20' : 'bg-white border-outline text-on-surface-dim hover:border-indigo-pale hover:bg-surface-low'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Method Filter */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-on-surface-dim uppercase tracking-widest px-1">Voting Method</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'mail', 'in-person', 'early'] as const).map(m => (
                <button 
                  key={m}
                  onClick={() => setMethodFilter(m)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    methodFilter === m ? 'bg-amber-custom border-amber-custom text-white shadow-lg shadow-amber-500/20' : 'bg-white border-outline text-on-surface-dim hover:border-amber-pale hover:bg-surface-low'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Scope Filter */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-on-surface-dim uppercase tracking-widest px-1">Admin Level</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'federal', 'state', 'local'] as const).map(l => (
                <button 
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    level === l ? 'bg-green-custom border-green-custom text-white shadow-lg shadow-green-500/20' : 'bg-white border-outline text-on-surface-dim hover:border-green-pale hover:bg-surface-low'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {filteredEvents.map((event, i) => {
          const isPast = getEventDate(event.date) < today;
          return (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`card p-6 flex flex-col md:flex-row gap-6 items-start border-l-4 group relative overflow-hidden ${
                isPast ? 'bg-surface-low/60 border-outline-strong grayscale-[0.5]' :
                event.critical ? 'border-amber-custom bg-amber-pale/20' : 'border-indigo-custom'
              }`}
            >
              {isPast && (
                <div className="absolute top-0 right-0 bg-outline-strong text-white text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest">
                  Archived
                </div>
              )}
              
              <div className="flex flex-col items-center md:w-36 shrink-0 text-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-sm ${
                  event.type === 'deadline' ? 'bg-amber-pale text-amber-custom' : 
                  event.type === 'voting' ? 'bg-indigo-pale text-indigo-custom' : 
                  'bg-green-pale text-green-custom'
                }`}>
                  {event.type === 'deadline' ? '⏰' : event.type === 'voting' ? '🗳️' : 'ℹ️'}
                </div>
                <div className="text-sm font-black text-on-surface mb-0.5 whitespace-nowrap">{event.date.split(',')[0]}</div>
                <div className="text-[10px] font-bold text-on-surface-dim uppercase tracking-tighter">{event.date.split(',')[1]}</div>
              </div>

                <div className="flex-1">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="px-2 py-0.5 bg-surface text-on-surface-dim text-[9px] font-black uppercase tracking-widest border border-outline rounded-md">
                        {event.level}
                      </span>
                      {event.methods?.map((m: string) => (
                        <span key={m} className="px-2 py-0.5 bg-indigo-xpale text-indigo-custom text-[9px] font-black uppercase tracking-widest border border-indigo-pale rounded-md">
                          {m}
                        </span>
                      ))}
                    </div>
                    <h3 className={`text-xl font-bold ${event.critical ? 'text-amber-custom' : 'text-on-surface'}`}>{event.title}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => shareEvent(event)}
                      className="p-3 rounded-full bg-surface-low text-on-surface-dim hover:bg-slate-800 hover:text-white transition-all active:scale-90"
                      title="Share Event"
                    >
                      <Share size={18} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-on-surface-dim leading-relaxed mb-6">{event.description}</p>
                
                {event.source && (
                  <div className="flex items-center justify-between border-t border-outline/30 pt-4">
                    <a 
                      href={event.sourceUrl || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-black uppercase text-green-custom hover:underline flex items-center gap-1"
                    >
                      Official Source: {event.source}
                      <ChevronRight size={10} />
                    </a>
                    {event.critical && <span className="text-[9px] font-black uppercase text-amber-custom animate-pulse">Required Action</span>}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        {filteredEvents.length === 0 && (
          <div className="text-center py-32 bg-surface-low rounded-[40px] border-4 border-dashed border-outline/30">
            <History size={64} className="mx-auto text-on-surface-dim opacity-20 mb-6" />
            <h3 className="text-2xl font-serif text-on-surface-dim">No milestones found</h3>
            <p className="text-on-surface-dim mt-2 max-w-sm mx-auto">Try resetting filters or checking your region settings to see more data.</p>
            <button 
              onClick={() => { setFilter('all'); setMethodFilter('all'); setLevel('all'); setSearchQuery(''); }}
              className="mt-8 btn-outline px-10 py-3"
            >
              Reset View
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MythBusterView({ onBack }: { onBack: () => void }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hi there! I\'m your Civic AI Assistant. Ask me anything about voting rules, deadlines, or common myths.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await askMythBuster(input);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="max-w-[700px] mx-auto py-12 px-4 h-[700px] flex flex-col">
      <div className="flex-1 brutalist-card p-0 overflow-hidden flex flex-col shadow-2xl">
      <div className="bg-indigo-custom p-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare size={20} />
          <h3 className="font-bold">MythBuster AI</h3>
        </div>
        <button onClick={onBack} className="p-1 hover:bg-white/20 rounded">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-surface-low">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-indigo-custom text-white rounded-br-none' : 'bg-white border border-outline text-on-surface rounded-bl-none'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isTyping && <div className="text-xs text-on-surface-dim italic">MythBuster is thinking...</div>}
      </div>

      <div className="p-4 border-t border-outline flex gap-2 bg-white">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question..."
          className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:border-indigo-custom"
        />
        <button onClick={handleSend} className="w-10 h-10 rounded-full bg-indigo-custom text-white flex items-center justify-center hover:bg-indigo-light transition-all">
          <Send size={18} />
        </button>
      </div>
    </div>
    </div>
  );
}

function SimulationView({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: 'At the Polling Place', sub: 'Arrival & Verification', icon: '🏛', text: 'You arrive at Jefferson Community Center. A volunteer asks for your Photo ID to verify your registration against the poll book.' },
    { title: 'Check-in & Ballot', sub: 'Voter Authentication', icon: '📋', text: 'Success! Your name is on the list. You receive a paper ballot and a privacy folder. You\'re directed to a private booth.' },
    { title: 'Marking the Ballot', sub: 'The Voting Act', icon: '✏️', text: 'Go to a private booth. Use the provided pen to completely fill in the ovals for your selected candidates and measures.' },
    { title: 'Submission', sub: 'Finalizing Your Vote', icon: '🗳', text: 'Place your marked ballot into the electronic scanner. The screen displays: "Ballot Counted". Congratulations, you voted!' },
  ];

  return (
    <div className="max-w-[700px] mx-auto py-12 px-6">
      <div className="card shadow-2xl p-12 text-center animate-fade-in relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-pale shadow-inner">
          <motion.div 
            className="h-full bg-indigo-custom" 
            initial={{ width: 0 }}
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="w-20 h-20 bg-indigo-xpale text-indigo-custom rounded-3xl flex items-center justify-center text-3xl mx-auto mb-8 shadow-sm">
          {steps[step].icon}
        </div>
        
        <div className="mb-8">
          <div className="text-[10px] font-bold text-indigo-custom uppercase tracking-[0.2em] mb-2">{steps[step].sub}</div>
          <h3 className="text-4xl font-serif">{steps[step].title}</h3>
        </div>

        <p className="text-lg text-on-surface-dim leading-relaxed mb-12 max-w-[500px] mx-auto min-h-[80px]">
          {steps[step].text}
        </p>
        
        <div className="flex items-center justify-center gap-3 mb-12">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-500 ${
                i === step ? 'w-12 bg-indigo-custom' : i < step ? 'w-2 bg-indigo-pale' : 'w-2 bg-outline'
              }`} 
            />
          ))}
        </div>

        <div className="flex gap-4 max-w-[400px] mx-auto">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="btn-outline flex-1">Previous</button>
          )}
          <button 
            onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onBack()} 
            className="btn-primary flex-1 shadow-lg shadow-indigo-custom/20"
          >
            {step === steps.length - 1 ? 'Finish Simulation' : 'Next Step →'}
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-center text-on-surface-dim text-xs opacity-60">
        This is a simulated experience for educational purposes. Actual polling procedures may vary by jurisdiction.
      </div>
    </div>
  );
}

function HelpCenterView({ profile, onBack }: { profile: UserProfile | null, onBack: () => void }) {
  const isIndia = profile?.country === 'India';
  const [geoLoading, setGeoLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [stationFound, setStationFound] = useState(false);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);

  const [manualInput, setManualInput] = useState('');

  const findStation = (input?: string) => {
    setGeoLoading(true);
    setLocationError(null);
    
    // Support for manual input
    if (input) {
      setTimeout(() => {
        setGeoLoading(false);
        setCoords({ lat: isIndia ? 19.0760 : 34.0522, lng: isIndia ? 72.8777 : -118.2437 }); // Mumbai or LA for manual demo
        setStationFound(true);
      }, 1500);
      return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Location found:", position);
          setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
          // Simulate API call to election office
          setTimeout(() => {
            setGeoLoading(false);
            setStationFound(true);
          }, 1500);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setGeoLoading(false);
          // Fallback coordinates for demo if denied but button clicked
          setCoords({ lat: isIndia ? 28.6139 : 37.7749, lng: isIndia ? 77.2090 : -122.4194 });
          setLocationError("Location access denied. Using district capital as default.");
          setTimeout(() => {
            setStationFound(true);
          }, 1000);
        },
        { timeout: 10000 }
      );
    } else {
      setGeoLoading(false);
      setLocationError("Geolocation is not supported by your browser.");
    }
  };
  
  const faqs = isIndia ? [
    { q: "What ID do I need to bring to the polls?", a: "Your Voter ID (EPIC) is the primary document. If you don't have it, you can use Aadhaar, PAN Card, Driving License, or Passport with your voter slip." },
    { q: "Can I register to vote online?", a: "Yes, you can register via the Voter Helpline App or the NVSP portal (voters.eci.gov.in). Use Form 6 for new registration." },
    { q: "What is VVPAT?", a: "VVPAT (Voter Verifiable Paper Audit Trail) is a machine attached to the EVM that prints a paper slip of your vote for verification. It stays visible for 7 seconds." },
    { q: "How do I find my booth number?", a: "Check your voter slip issued by the BLO, or use the 'Know Your Polling Station' feature on the ECI website using your EPIC number." }
  ] : [
    { q: "What ID do I need to bring to the polls?", a: "In your district, a valid Photo ID is required. This includes a Driver's License, State-issued ID, Passport, or Military ID. Student IDs from accredited institutions are also accepted." },
    { q: "Can I register to vote on Election Day?", a: "Your current jurisdiction does NOT allow same-day registration. The final deadline is October 15, 2026. Please ensure your registration is active before then." },
    { q: "What if I can't leave work on Election Day?", a: "By law, many employers must grant up to 2 hours of paid time off to vote if you don't have sufficient time outside working hours. Early voting is also highly recommended." },
    { q: "How do I vote from abroad?", a: "Overseas citizens and military members can use the Federal Post Card Application (FPCA) to request an absentee ballot. Our MythBuster can guide you through the process." }
  ];

  return (
    <div className="max-w-[800px] mx-auto py-12 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-serif">Help Center</h2>
          <p className="text-on-surface-dim mt-2">Find answers to common questions about your local process.</p>
        </div>
        <button onClick={onBack} className="btn-outline px-6 py-2.5 self-start whitespace-nowrap">
          Back to Dashboard
        </button>
      </div>

      {/* Polling Station Finder */}
      <div className="card bg-surface-high border-indigo-pale p-8 mb-12 shadow-inner relative overflow-hidden">
        {geoLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-custom border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-bold text-indigo-custom animate-pulse">Scanning Precincts...</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mb-10">
          <div className="w-16 h-16 bg-indigo-custom text-white rounded-[24px] flex items-center justify-center shadow-xl shadow-indigo-500/20">
            <MapPin size={36} />
          </div>
          <div>
            <h3 className="text-4xl font-serif tracking-tight text-slate-900">Election Logistics</h3>
            <div className="flex items-center gap-2 text-on-surface-dim font-medium">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Verified local infrastructure for {profile?.country === 'India' ? 'ECI' : 'Federal'} Polls 2026
            </div>
          </div>
        </div>
        
        {stationFound ? (
          <div className="animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <div className="p-10 bg-white rounded-3xl border border-indigo-pale shadow-sm mb-6 overflow-hidden">
                  <div className="h-48 -mx-10 -mt-10 mb-6 overflow-hidden relative group">
                    <img 
                      src="https://images.unsplash.com/photo-1540910419892-f0e74c04b266?q=80&w=2070&auto=format&fit=crop" 
                      alt="Polling Station" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  </div>
                  <div className="flex items-center gap-2 mb-2 text-green-custom font-bold text-xs">
                    <CheckCircle2 size={14} />
                    Registration Verified at this Booth
                  </div>
                  <h4 className="font-bold text-xl mb-1">
                    {manualInput ? (
                      (manualInput.toLowerCase().includes('india') || manualInput.toLowerCase().includes('delhi') || isIndia) 
                        ? `Booth #18: ${manualInput.split(',')[0].toUpperCase()} Station` 
                        : `Precinct 102: ${manualInput.split(',')[0]} Regional Center`
                    ) : (isIndia ? `Booth #${Math.abs(profile?.location?.length || 0) * 7 + 10}: Local School @ ${profile?.location || 'Central Desk'}` : `Precinct ${Math.abs(profile?.location?.length || 0) * 3 + 100}: Public Library @ ${profile?.location || 'District Center'}`)}
                  </h4>
                  <p className="text-sm text-on-surface-dim mb-4">
                    {manualInput ? (
                      (manualInput.length > 20 || manualInput.includes(',')) 
                        ? manualInput 
                        : `${manualInput}, ${isIndia ? 'Sector 4, New Delhi' : 'San Francisco, CA'}`
                    ) : (profile?.location ? `Assigned to your registered zone in ${profile.location}` : (isIndia ? 'Plot 12, Janpath Road, New Delhi 110001' : '1550 Scott St, San Francisco, CA 94115'))}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-3 bg-surface-low rounded-xl border border-outline/50">
                      <div className="text-[10px] font-black uppercase text-on-surface-dim mb-1 flex items-center gap-1">
                        <Clock size={10} className="text-indigo-custom" />
                        Hours
                      </div>
                      <div className="text-xs font-bold text-on-surface">7:00 AM - 8:00 PM</div>
                    </div>
                    <div className="p-3 bg-surface-low rounded-xl border border-outline/50">
                      <div className="text-[10px] font-black uppercase text-on-surface-dim mb-1 flex items-center gap-1">
                        <Accessibility size={10} className="text-indigo-custom" />
                        Access
                      </div>
                      <div className="text-xs font-bold text-on-surface">ADA Compliant & Braille Support</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <a 
                      href={coords ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}` : '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 shadow-lg shadow-indigo-500/20"
                    >
                      <MapPin size={16} />
                      Navigate in Real-time
                    </a>
                    <button onClick={() => { setStationFound(false); setManualInput(''); }} className="btn-outline px-4 hover:bg-slate-50">Reset</button>
                  </div>
                </div>
              </div>
              <div className="w-full lg:w-[400px] h-[300px] bg-slate-100 rounded-3xl border border-outline relative overflow-hidden shadow-inner">
                {coords ? (
                  <iframe 
                    width="100%" 
                    height="100%" 
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng-0.01},${coords.lat-0.01},${coords.lng+0.01},${coords.lat+0.01}&layer=mapnik&marker=${coords.lat},${coords.lng}`}
                    className="w-full h-full border-0"
                    title="Map"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-200 animate-pulse text-xs font-bold text-on-surface-dim">
                    Loading Map Data...
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-on-surface-dim mb-8">Enter your {isIndia ? 'EPIC Number or Pincode' : 'Address or Zip Code'} to locate your assigned precinct.</p>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <input 
                type="text" 
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && manualInput && findStation(manualInput)}
                placeholder={isIndia ? "ABC1234567 or 110001..." : "123 Main St, 90210..."}
                className="flex-1 bg-white border border-outline rounded-2xl p-4 text-sm font-medium focus:outline-none focus:border-indigo-custom"
              />
              <button 
                onClick={() => manualInput ? findStation(manualInput) : findStation()}
                className="btn-primary py-4 px-10 shadow-lg shadow-indigo-500/20 whitespace-nowrap"
              >
                {manualInput ? 'Search Station' : 'Scan My Location'}
              </button>
            </div>
            {locationError && <p className="text-xs text-red-500 mt-4 font-bold">⚠️ {locationError}</p>}
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-on-surface-dim bg-outline/10 px-3 py-1.5 rounded-lg">
            <CheckCircle2 size={12} className="text-green-custom" />
            Official Government Data
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-on-surface-dim bg-outline/10 px-3 py-1.5 rounded-lg">
            <ShieldCheck size={12} className="text-indigo-custom" />
            Encrypted Search
          </div>
        </div>
      </div>
      
      <div className="grid gap-4">
        {faqs.map((faq, i) => (
          <div key={i} className="card hover:border-indigo-custom transition-all group p-8">
            <h4 className="font-bold text-lg mb-3 flex items-start gap-3">
              <HelpCircle className="text-indigo-custom shrink-0 mt-1" size={20} />
              {faq.q}
            </h4>
            <p className="text-on-surface-dim leading-relaxed ml-8">{faq.a}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 bg-gradient-to-br from-indigo-xpale to-white rounded-[40px] p-12 border border-indigo-pale/50 flex flex-col md:flex-row items-center gap-12 shadow-xl shadow-indigo-900/5">
        <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center text-5xl shadow-card rotate-3 shrink-0">🤖</div>
        <div className="flex-1">
          <h3 className="text-3xl font-serif mb-4">MythBuster AI</h3>
          <p className="text-on-surface-dim mb-8 leading-relaxed text-lg">Still confused? Our AI Assistant is trained on the latest {isIndia ? 'ECI' : 'EAC'} manuals and voter guidelines to help you navigate {profile?.country} election laws.</p>
          <button className="btn-primary px-10" onClick={() => (window as any).setScreen?.('mythbuster')}>
            Ask a Question
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsView({ profile, onBack }: { profile: UserProfile | null, onBack: () => void }) {
  const isIndia = profile?.country === 'India';
  const [isLive, setIsLive] = useState(false);
  const [liveData, setLiveData] = useState<{ party: string, votes: number, color: string, pct: number }[]>([]);
  const [precinctsReporting, setPrecinctsReporting] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [recentEvents, setRecentEvents] = useState<{ id: string, text: string, time: string }[]>([]);

  // Simulation of live updates
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLive) {
      interval = setInterval(() => {
        setLiveData(prev => {
          const totalVotes = prev.reduce((acc, curr) => acc + curr.votes, 0);
          return prev.map(p => {
            const added = Math.floor(Math.random() * 5000) + 1000;
            const newVotes = p.votes + added;
            return {
              ...p,
              votes: newVotes,
              pct: (newVotes / (totalVotes + added * prev.length)) * 100
            };
          });
        });
        
        setPrecinctsReporting(prev => Math.min(100, prev + Math.random() * 0.5));
        setLastUpdate(new Date().toLocaleTimeString());
        
        const events = [
          "Large batch of suburban ballots verified",
          "Precinct 42 reporting final numbers",
          "Surge in youth turnout detected in urban centers",
          "Counting underway in postal ballot division",
          "Observation teams confirm integrity checks passed"
        ];
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        setRecentEvents(prev => [{ id: Date.now().toString(), text: randomEvent, time: 'Just now' }, ...prev].slice(0, 5));
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  const startLiveResults = () => {
    setIsLive(true);
    setPrecinctsReporting(12.4);
    setLastUpdate(new Date().toLocaleTimeString());
    setLiveData(isIndia ? [
      { party: 'BJP', votes: 1245000, color: '#FF9933', pct: 42 },
      { party: 'INC', votes: 1102000, color: '#138808', pct: 38 },
      { party: 'AAP', votes: 450000, color: '#000080', pct: 12 },
      { party: 'OTH', votes: 320000, color: '#64748B', pct: 8 }
    ] : [
      { party: 'DEM', votes: 54000000, color: '#00AEF3', pct: 50.2 },
      { party: 'REP', votes: 52000000, color: '#E91D0E', pct: 48.3 },
      { party: 'LIB', votes: 1200000, color: '#FED105', pct: 1.1 },
      { party: 'GRN', votes: 800000, color: '#17AA5C', pct: 0.4 }
    ]);
    setRecentEvents([
      { id: '1', text: 'Live broadcast initiated from central counting hall', time: '1m ago' },
      { id: '2', text: 'Pre-check protocols completed by neutral observers', time: '5m ago' }
    ]);
  };
  
  const historicalData = isIndia ? [
    { year: '2004', turnout: 58.1 },
    { year: '2009', turnout: 58.2 },
    { year: '2014', turnout: 66.4 },
    { year: '2019', turnout: 67.4 },
    { year: '2024', turnout: 65.8 }
  ] : [
    { year: '2004', turnout: 60.1 },
    { year: '2008', turnout: 61.6 },
    { year: '2012', turnout: 58.6 },
    { year: '2016', turnout: 60.1 },
    { year: '2020', turnout: 66.8 }
  ];

  const demographicData = [
    { name: '18-24', turnout: 48, potential: 100 },
    { name: '25-44', turnout: 62, potential: 100 },
    { name: '45-64', turnout: 71, potential: 100 },
    { name: '65+', turnout: 76, potential: 100 }
  ];

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 animate-fade-in">
      {/* Live Status Banner */}
      {isLive && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-8 p-6 bg-red-600 text-white rounded-[32px] flex flex-wrap items-center justify-between gap-6 shadow-2xl shadow-red-500/20 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-red-500 to-red-600 group-hover:translate-x-full transition-transform duration-1000 opacity-50" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center animate-pulse">
              <Activity size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Live Official Feed Active</span>
              </div>
              <h3 className="text-xl font-bold font-serif">Real-Time Election Monitoring</h3>
            </div>
          </div>
          <div className="flex items-center gap-8 relative z-10 px-6 py-3 bg-black/10 rounded-2xl backdrop-blur-md border border-white/10">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase opacity-60">System Sync</span>
              <span className="text-sm font-mono font-bold">{lastUpdate}</span>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase opacity-60">Reporting</span>
              <span className="text-sm font-mono font-bold">{precinctsReporting.toFixed(1)}%</span>
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex items-center justify-between mb-12">
        <div>
          <h2 className="text-4xl lg:text-5xl font-serif mb-2 font-medium">Results Explorer</h2>
          <p className="text-on-surface-dim text-lg">Integrated civic data, historical turnout, and real-time candidate metrics.</p>
        </div>
        <button onClick={onBack} className="btn-outline flex items-center gap-2 bg-white">
          <ChevronLeft size={18} />
          Dashboard
        </button>
      </div>

      <AnimatePresence>
        {isLive && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mb-12 overflow-hidden"
          >
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Live Scoreboard */}
              <div className="lg:col-span-2 bg-slate-950 text-white p-10 rounded-[40px] shadow-2xl border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                  <Activity size={240} />
                </div>
                
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="text-red-custom" />
                    <h3 className="text-2xl font-bold">Consolidated Vote Count</h3>
                  </div>
                  <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/10 text-xs font-mono text-slate-400">
                    STATUS: ACTIVE COUNT
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-8 mb-10">
                  {liveData.map(data => (
                    <div key={data.party} className="p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md shadow-inner transition-all hover:bg-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                          <div className="text-sm font-black uppercase tracking-widest text-slate-400">{data.party}</div>
                        </div>
                        <div className="text-xl font-bold text-white font-mono tabular-nums">{data.pct.toFixed(1)}%</div>
                      </div>
                      <div className="text-3xl font-serif font-medium tabular-nums mb-4">
                        {data.votes.toLocaleString()}
                      </div>
                      <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${data.pct}%` }}
                          transition={{ type: 'spring', stiffness: 50 }}
                          className="h-full shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                          style={{ backgroundColor: data.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    <span>Overall Reporting Progress</span>
                    <span>{precinctsReporting.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${precinctsReporting}%` }}
                      className="h-full bg-indigo-accent"
                    />
                  </div>
                </div>
              </div>

              {/* Live Activity Stream */}
              <div className="bg-surface-low border border-outline rounded-[40px] p-8 flex flex-col">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                  <Clock size={20} className="text-indigo-custom" />
                  Live Feed
                </h3>
                <div className="flex-1 space-y-6 overflow-y-auto max-h-[480px] scrollbar-hide pr-2">
                  <AnimatePresence initial={false}>
                    {recentEvents.map(event => (
                      <motion.div 
                        key={event.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex gap-4 group"
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-custom group-first:animate-ping" />
                          <div className="w-0.5 h-full bg-outline/20 mt-1" />
                        </div>
                        <div className="pb-6">
                          <div className="text-[10px] font-black text-red-custom uppercase tracking-tighter mb-1">{event.time}</div>
                          <p className="text-xs font-semibold text-on-surface leading-normal">{event.text}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="mt-4 pt-4 border-t border-outline flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-custom rounded-full" />
                  <span className="text-[10px] font-black uppercase text-on-surface-dim">Encrypted Connection Verified</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        <div className="card shadow-lg p-10 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-serif">Turnout History (%)</h3>
            <div className="text-[10px] font-black text-on-surface-dim uppercase px-2 py-1 bg-surface-low rounded border border-outline">National Benchmark</div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="year" fontSize={12} stroke="#94A3B8" axisLine={false} tickLine={false} dy={10} />
                <YAxis fontSize={12} stroke="#94A3B8" domain={[0, 100]} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                  cursor={{ stroke: '#4f46e5', strokeWidth: 2 }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${value}%`, 'Turnout']}
                />
                <Line 
                  type="monotone" 
                  dataKey="turnout" 
                  stroke="#4f46e5" 
                  strokeWidth={4} 
                  dot={{ r: 6, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 8, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card shadow-lg p-10 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-serif">Demographic Surge</h3>
            <div className="text-[10px] font-black text-on-surface-dim uppercase px-2 py-1 bg-surface-low rounded border border-outline">Age 18-99</div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={demographicData} layout="vertical" barSize={32}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" fontSize={12} stroke="#94A3B8" domain={[0, 100]} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" fontSize={12} stroke="#94A3B8" axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${value}%`, 'Turnout']}
                />
                <Bar dataKey="turnout" fill="#10b981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-indigo-custom text-white p-12 rounded-[48px] flex flex-col md:flex-row items-center justify-between gap-12 shadow-2xl shadow-indigo-900/40 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/40 to-transparent pointer-events-none" />
        <div className="max-w-xl relative z-10">
          <h3 className="text-4xl font-serif mb-6">{isLive ? 'Live Election Monitoring Active' : 'Enable Live 2026 Projections'}</h3>
          <p className="text-indigo-pale text-lg leading-relaxed mb-0">
            {isLive 
              ? 'Our systems are connected via secured government API gateways. We are observing real-time reporting from over 12,000 counting centers.' 
              : 'Our data models analyze local registration surges and live civic activity to project final election participation across the country.'}
          </p>
        </div>
        {!isLive ? (
          <button 
            onClick={startLiveResults}
            className="px-10 py-5 bg-white text-indigo-custom rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 group relative z-10"
          >
            Start Real-time Results →
          </button>
        ) : (
          <button 
            onClick={() => setIsLive(false)}
            className="px-10 py-5 bg-white/10 text-white border border-white/20 rounded-2xl font-bold hover:bg-white/20 transition-all group relative z-10"
          >
            Disable Live View
          </button>
        )}
      </div>
    </div>
  );
}

function StaticPageView({ title, type, onBack }: { title: string, type: 'press' | 'privacy', onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto py-12 px-6"
    >
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-on-surface-dim hover:text-indigo-custom transition-all mb-10 group">
        <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={16} />
        Back
      </button>

      <div className="max-w-4xl">
        <h1 className="text-4xl lg:text-6xl font-serif mb-12">{title}</h1>
        
        <div className="prose prose-indigo max-w-none space-y-8">
          {type === 'press' ? (
            <>
              <section>
                <h3 className="text-xl font-bold mb-4">Press Office</h3>
                <p className="text-on-surface-dim leading-relaxed">
                  For all media inquiries, interview requests, and press kit access, please contact our global communications team. We aim to respond to all qualified press inquiries within 24 hours.
                </p>
              </section>
              <section className="bg-surface-low border border-outline rounded-3xl p-8">
                <h3 className="font-bold mb-4">Contact Details</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail size={16} className="text-indigo-custom" />
                    <span className="font-bold">press@civictrust.org</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Accessibility size={16} className="text-indigo-custom" />
                    <span className="font-bold">+1 (555) 234-5678</span>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <section>
                <h3 className="text-xl font-bold mb-4">Your Data, Your Control</h3>
                <p className="text-on-surface-dim leading-relaxed">
                  CivicTrust is built on the principle of minimal data retention. We provide the tools you need to engage with your government without tracking your every move.
                </p>
              </section>
              <section className="grid md:grid-cols-2 gap-8">
                <div className="p-6 bg-surface-low rounded-2xl border border-outline">
                  <ShieldCheck className="text-indigo-custom mb-4" size={24} />
                  <h4 className="font-bold mb-2">Zero Tracking</h4>
                  <p className="text-xs text-on-surface-dim leading-relaxed">We do not sell your personal data or use it for targeted advertising. Your civic profile is and always will be yours alone.</p>
                </div>
                <div className="p-6 bg-surface-low rounded-2xl border border-outline">
                  <Fingerprint className="text-indigo-custom mb-4" size={24} />
                  <h4 className="font-bold mb-2">Encryption</h4>
                  <p className="text-xs text-on-surface-dim leading-relaxed">Sensitive documents and ID records are stored with end-to-end encryption. Not even CivicTrust staff can access your verified credentials.</p>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
} 

function VerificationFlow({ 
  profile, 
  mode, 
  onClose, 
  onComplete 
}: { 
  profile: UserProfile, 
  mode: 'id' | 'ballot' | 'registration', 
  onClose: () => void, 
  onComplete: (mode: string) => void 
}) {
  const [step, setStep] = useState(0); // 0: Country, 1: Details/Method, 2: Verification
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ mobile: '', pin: '' });

  const [selectedCountry, setSelectedCountry] = useState(profile.country || 'India'); // Default to India if profile.country is missing for better UX in this context
  const [idType, setIdType] = useState<'voter' | 'pan'>('voter');
  const [verificationMethod, setVerificationMethod] = useState<'manual' | 'external'>(profile.idVerified ? 'manual' : 'external');
  const [formData, setFormData] = useState({
    idNumber: '',
    reason: 'Medical/Age',
    addressConfirm: true,
    fullName: profile.name || '',
    dob: '1995-01-01',
    constituency: '',
    pincode: ''
  });

  const isIndia = selectedCountry === 'India';

  const handleNext = async () => {
    // Validation
    if (step === 1) {
      if (!formData.fullName || !formData.dob) {
        alert("Please provide your full legal name and date of birth.");
        return;
      }
    }
    
    if (step === 2 && verificationMethod === 'external' && !loggingIn && !syncing) {
      handleExternalSync();
      return;
    }

    if (step === 2 && verificationMethod === 'manual') {
      if (!formData.idNumber || formData.idNumber.length < 4) {
        alert("Please enter a valid identification number.");
        return;
      }
    }

    if (step < 2) {
      setStep(step + 1);
    } else {
      setChecking(true);
      // Simulate Government API connection and record validation
      setTimeout(async () => {
        setChecking(false);
        setSuccess(true);
        const updates: Partial<UserProfile> = { 
            country: selectedCountry as any,
            verifiedAt: new Date().toISOString(),
            verificationMethod: 'manual'
          };
          
          if (mode === 'id') {
            updates.idVerified = true;
            if (idType === 'voter') updates.voterIdNumber = formData.idNumber;
            if (idType === 'pan') updates.panCardNumber = formData.idNumber;
          }
          else if (mode === 'registration') updates.registrationStatus = 'pending';
          else if (mode === 'ballot') updates.ballotApplied = true;
          
          await updateUserProfile(profile.uid, updates);
          setTimeout(() => onComplete(mode), 1500);
        }, 3500);
      }
    };
  
    const handleExternalSync = () => {
      console.log("Starting external sync for country:", selectedCountry);
      if (isIndia) {
        setLoggingIn(true);
      } else {
        startSyncProcess();
      }
    };

    const startSyncProcess = () => {
      setLoggingIn(false);
      setSyncing(true);
      setSyncStatus("Initializing Handshake...");
      // Simulate secure handshake with DigiLocker or DMV Mobile
      setTimeout(() => setSyncStatus("Verifying OAuth Token..."), 1500);
      setTimeout(() => setSyncStatus("Fetching Verified Identity..."), 3000);
      
      setTimeout(() => {
        const data = {
          fullName: profile.name || 'CITIZEN_HOLDER',
          dob: '1990-05-15',
          pincode: '110001',
          voterId: isIndia 
            ? `ECI${Math.floor(100000 + Math.random() * 900000)}IND` 
            : `USA-${Math.floor(1000 + Math.random() * 9000)}-SYNC`,
          pan: isIndia ? `ABCDE${Math.floor(1000 + Math.random() * 9000)}F` : null,
          issuer: isIndia ? 'Ministry of Electronics & IT (DigiLocker)' : 'Department of Motor Vehicles'
        };
        setExtractedData(data);
        setSyncing(false);
        setReviewing(true);
      }, 4500);
    };

    const handleDigiLockerLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (loginForm.mobile.length < 10 || loginForm.pin.length < 6) {
        alert("Please enter a valid 10-digit mobile number and 6-digit PIN.");
        return;
      }
      setIsAuthenticating(true);
      setTimeout(() => {
        setIsAuthenticating(false);
        startSyncProcess();
      }, 2000);
    };
  
    const handleFinalConfirm = async () => {
      setReviewing(false);
      setChecking(true);
      setSyncStatus("Linking Secure Records...");
      
      setTimeout(async () => {
        const updates: Partial<UserProfile> = { 
          idVerified: true,
          verificationMethod: isIndia ? 'digilocker' : 'dmv_mobile',
          verifiedAt: new Date().toISOString(),
          voterIdNumber: extractedData.voterId,
          // Sync location from the extracted data
          location: extractedData.pincode === '110001' ? 'New Delhi' : (extractedData.pincode ? `Area ${extractedData.pincode}` : profile.location || 'New Delhi'),
          address: isIndia ? `${extractedData.fullName}, B-63, Lakshmi Park, Nangloi, New Delhi - 110041` : '1550 Scott St, San Francisco, CA'
        };
        
        if (extractedData.pan) {
          updates.panCardNumber = extractedData.pan;
        }
        
        await updateUserProfile(profile.uid, updates);
        setChecking(false);
        setSuccess(true);
        setTimeout(() => onComplete(mode), 2000);
      }, 3000);
    };

  const [syncStatus, setSyncStatus] = useState("Connecting...");

  const getModeTitle = () => {
    if (success) return 'Submission Received';
    if (mode === 'id') return 'Anchor Your Identity';
    if (mode === 'registration') return 'Official Voter Registration';
    return isIndia ? 'Postal Ballot Request' : 'Absentee Ballot Application';
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: 50, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 50, scale: 0.9, opacity: 0 }}
        className="w-full max-w-[550px] bg-white rounded-[48px] shadow-3xl overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="bg-indigo-custom p-10 pt-12 text-white relative">
          <button 
            onClick={onClose} 
            className="absolute top-8 right-8 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all"
          >
            <X size={20} />
          </button>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border border-white/10">
            <Lock size={12} />
            Secure Government Gateway
          </div>

          <h2 className="text-4xl font-serif leading-tight">
            {getModeTitle()}
          </h2>
          {!success && (
            <p className="text-indigo-pale mt-3 text-lg font-medium">
              Guided flow for {selectedCountry} citizens.
            </p>
          )}
        </div>

        <div className="p-10">
          {loggingIn ? (
            <div className="animate-fade-in space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white border border-outline rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-2">
                    <img 
                      src="https://avatars.githubusercontent.com/u/15012547?s=200&v=4" 
                      alt="DigiLocker" 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold">DigiLocker Login</h3>
                    <p className="text-[10px] text-on-surface-dim font-black uppercase tracking-widest">Official Gateway</p>
                  </div>
                </div>
                <button 
                  onClick={() => setLoggingIn(false)}
                  className="w-10 h-10 rounded-full bg-surface-low border border-outline flex items-center justify-center text-on-surface-dim hover:bg-white hover:text-indigo-custom transition-all"
                  title="Go Back"
                >
                  <ArrowLeft size={18} />
                </button>
              </div>

              <form onSubmit={handleDigiLockerLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-on-surface-dim ml-1">Mobile Number</label>
                  <input 
                    type="tel" 
                    placeholder="Enter registered mobile number"
                    className="w-full p-4 bg-surface-low border border-outline rounded-2xl font-mono text-sm focus:ring-2 focus:ring-indigo-custom outline-none transition-all"
                    value={loginForm.mobile}
                    onChange={e => setLoginForm({...loginForm, mobile: e.target.value})}
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-on-surface-dim ml-1">6-digit security PIN</label>
                  <input 
                    type="password" 
                    placeholder="••••••"
                    className="w-full p-4 bg-surface-low border border-outline rounded-2xl font-mono text-lg tracking-widest focus:ring-2 focus:ring-indigo-custom outline-none transition-all"
                    value={loginForm.pin}
                    onChange={e => setLoginForm({...loginForm, pin: e.target.value})}
                    maxLength={6}
                  />
                </div>
                <div className="pt-6 space-y-4">
                  <button 
                    type="submit"
                    disabled={isAuthenticating}
                    className="w-full bg-indigo-custom text-white py-5 rounded-[24px] shadow-2xl shadow-indigo-500/30 flex flex-col items-center justify-center gap-1 text-sm font-black uppercase tracking-[0.15em] transition-all hover:bg-indigo-600 active:scale-[0.98] disabled:opacity-70 disabled:grayscale relative overflow-hidden"
                  >
                    {isAuthenticating ? (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Establishing Session...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <ShieldCheck size={20} />
                        <span>Authorize CivicTrust</span>
                        <ArrowRight size={20} />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 h-1 bg-white/20 transition-all duration-[3000ms]" style={{ width: isAuthenticating ? '100%' : '0%' }} />
                  </button>
                  
                  <div className="flex items-center gap-3 p-4 bg-indigo-xpale rounded-2xl border border-indigo-pale/50">
                    <Info size={16} className="text-indigo-custom shrink-0" />
                    <p className="text-[10px] text-indigo-900/60 leading-relaxed font-bold uppercase tracking-tight">
                      This is a secure MeitY-compliant handshake. Your data remains encrypted end-to-end.
                    </p>
                  </div>
                </div>
                <p className="text-center text-[11px] text-on-surface-dim px-6">
                  By logging in, you agree to allow CivicTrust to fetch your verified identity documents from DigiLocker archives.
                </p>
              </form>
            </div>
          ) : syncing ? (
            <div className="py-20 text-center animate-fade-in">
              <div className="relative w-32 h-32 mx-auto mb-10">
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-dashed border-indigo-custom/30 rounded-full" 
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 bg-indigo-custom rounded-3xl rotate-45 flex items-center justify-center shadow-2xl shadow-indigo-500/40">
                    <div className="-rotate-45">
                      <Globe size={40} className="text-white animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3">Connecting to {isIndia ? 'DigiLocker' : 'DMV Cloud'}</h3>
              <p className="text-indigo-custom text-sm mb-8 animate-pulse font-mono tracking-tighter">{syncStatus}</p>
              <p className="text-on-surface-dim max-w-xs mx-auto text-sm leading-relaxed mb-8">Establishment of secure SSL-encoded handshake between CivicTrust and government archives...</p>
              <div className="bg-slate-100 p-4 rounded-2xl font-mono text-[10px] text-on-surface-dim text-left max-w-sm mx-auto border border-outline/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-indigo-custom">GET /api/v1/verify_identity</span>
                  <span className="text-green-600">200 OK</span>
                </div>
                <div className="opacity-50">SYNCING_METADATA_ANCHORS...</div>
                <div className="opacity-50">VALIDATING_ECC_SIGNATURE...</div>
              </div>
            </div>
          ) : reviewing ? (
            <div className="animate-fade-in space-y-8">
              <div className="text-center mb-8 relative">
                <div className="absolute inset-x-0 -top-10 flex justify-center opacity-5">
                   <Shield size={120} className="text-indigo-custom" />
                </div>
                <div className="w-16 h-16 bg-green-pale text-green-custom rounded-3xl flex items-center justify-center mx-auto mb-4 border border-green-custom/10 relative shadow-inner">
                  <Fingerprint size={32} />
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-custom text-white rounded-full flex items-center justify-center border-2 border-white">
                    <Check size={12} strokeWidth={4} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold">Verified Data Anchors</h3>
                <p className="text-sm text-on-surface-dim">Cryptographically linked from {extractedData?.issuer}.</p>
              </div>

              <div className="bg-surface-low border border-outline rounded-[32px] p-8 space-y-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                  <Globe size={80} />
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-outline/30 group">
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim">Full Legal Name</span>
                  <span className="text-base font-bold text-on-surface group-hover:text-indigo-custom transition-colors">{extractedData?.fullName}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-outline/30 group">
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim">Date of Birth</span>
                  <span className="text-base font-mono font-bold group-hover:text-indigo-custom transition-colors">{extractedData?.dob}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-outline/30 group">
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim">Voter ID (EPIC)</span>
                  <span className="text-base font-mono font-black tracking-widest group-hover:text-indigo-custom transition-colors">{extractedData?.voterId}</span>
                </div>
                {extractedData?.pan && (
                  <div className="flex justify-between items-center group">
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim">PAN Number</span>
                    <span className="text-base font-mono font-black tracking-widest group-hover:text-indigo-custom transition-colors">{extractedData?.pan}</span>
                  </div>
                )}
              </div>

              <div className="p-4 bg-amber-pale/30 border border-amber-custom/20 rounded-2xl flex gap-3">
                <AlertCircle size={16} className="text-amber-custom shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  By clicking confirm, you authorize CivicTrust to store these encrypted identifiers in your private digital wallet. This cannot be undone from the client.
                </p>
              </div>

              <div className="flex gap-4 pt-4 border-t border-outline/30">
                <button 
                  onClick={() => { setReviewing(false); setStep(2); }}
                  className="flex-1 py-4 text-sm font-bold text-on-surface-dim hover:text-indigo-custom transition-all"
                >
                  Edit Manually
                </button>
                <button 
                  onClick={handleFinalConfirm}
                  className="flex-[2] btn-primary py-4 rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest"
                >
                  Confirm & Link Identity
                  <Check size={18} />
                </button>
              </div>
            </div>
          ) : checking ? (
            <div className="py-20 text-center">
              <div className="relative w-24 h-24 mx-auto mb-10">
                <div className="absolute inset-0 border-4 border-indigo-pale rounded-full" />
                <div className="absolute inset-0 border-4 border-indigo-custom rounded-full border-t-transparent animate-spin" />
                <div className="absolute inset-4 bg-indigo-xpale rounded-full flex items-center justify-center">
                  <Activity size={24} className="text-indigo-custom animate-pulse" />
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3">Syncing with {isIndia ? 'ECI' : 'Federal'} Registry</h3>
              <p className="text-on-surface-dim max-w-xs mx-auto">Please do not refresh. We are verifying your biometric and address markers against official archives.</p>
            </div>
          ) : success ? (
            <div className="text-center py-10 animate-fade-in">
              <motion.div 
                initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                className="w-24 h-24 bg-green-pale text-green-custom rounded-[32px] flex items-center justify-center text-4xl mx-auto mb-8 border-4 border-green-custom/20 shadow-xl shadow-green-500/10"
              >
                <CheckCircle2 size={48} />
              </motion.div>
              <h3 className="text-3xl font-serif mb-4 italic">Verification Successful</h3>
              <p className="text-on-surface-dim mb-8 text-lg leading-relaxed max-w-sm mx-auto">
                {mode === 'id' && 'Your Voter ID has been successfully verified. Your digital wallet is now live.'}
                {mode === 'registration' && 'Registration submitted via the official API. Status expected in 48-72 hours.'}
                {mode === 'ballot' && 'Ballot request received. Your local precinct will contact you via encoded mail.'}
              </p>
              
              <div className="w-full max-w-[280px] h-40 mx-auto rounded-3xl overflow-hidden mb-10 border-4 border-white shadow-2xl relative group">
                <img 
                  src="https://images.unsplash.com/photo-1590247813693-5541d1c609fd?q=80&w=2070&auto=format&fit=crop" 
                  alt="Ballot Box" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-indigo-custom/10 mix-blend-overlay" />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-indigo-custom shadow-sm">
                  Verified Node
                </div>
              </div>

              <button onClick={onClose} className="w-full btn-primary py-5 rounded-2xl text-lg group shadow-xl shadow-indigo-500/20">
                Enter Dashboard
              </button>
            </div>
          ) : (
            <div className="animate-fade-in">
              {/* Stepper */}
              <div className="flex gap-3 mb-10">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full relative overflow-hidden bg-surface-high border border-outline/10`}>
                    {step >= i && (
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        className="absolute inset-0 bg-indigo-custom"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="min-h-[300px]">
                {step === 0 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div>
                      <h4 className="text-xl font-bold mb-2">Voting Jurisdiction</h4>
                      <p className="text-sm text-on-surface-dim">We customize the flow based on your country's official API requirements.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {['India', 'US'].map(c => (
                        <button 
                          key={c}
                          onClick={() => setSelectedCountry(c as any)}
                          className={`p-6 rounded-[32px] border-2 text-left flex items-center justify-between transition-all group ${
                            selectedCountry === c ? 'border-indigo-custom bg-indigo-xpale shadow-lg shadow-indigo-500/5' : 'border-outline hover:border-indigo-pale bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-4xl group-hover:scale-110 transition-transform">{c === 'India' ? '🇮🇳' : '🇺🇸'}</span>
                            <div>
                              <div className="font-bold text-lg">{c === 'US' ? 'United States' : c}</div>
                              <div className="text-xs text-on-surface-dim uppercase font-black tracking-widest">{c === 'India' ? 'ECI Network' : 'State/Federal Sync'}</div>
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedCountry === c ? 'bg-indigo-custom border-indigo-custom' : 'border-outline'}`}>
                            {selectedCountry === c && <Check className="text-white" size={14} />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div>
                      <h4 className="text-xl font-bold mb-2">Guided Data Entry</h4>
                      <p className="text-sm text-on-surface-dim">Some details have been pre-filled from your profile to expedite the process.</p>
                    </div>
                    
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim px-1">Full Legal Name</label>
                        <input 
                          type="text" 
                          value={formData.fullName}
                          onChange={e => setFormData({...formData, fullName: e.target.value})}
                          className="w-full bg-surface-low border border-outline rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-indigo-custom focus:bg-white transition-all shadow-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim px-1">Date of Birth</label>
                        <input 
                          type="date" 
                          value={formData.dob}
                          onChange={e => setFormData({...formData, dob: e.target.value})}
                          className="w-full bg-surface-low border border-outline rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-indigo-custom focus:bg-white transition-all shadow-sm"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim px-1">
                          {isIndia ? 'State / Assembly Constituency' : 'Residential Address for Registration'}
                        </label>
                        <input 
                          type="text"
                          value={formData.constituency}
                          onChange={e => setFormData({...formData, constituency: e.target.value})}
                          placeholder={isIndia ? "e.g. Maharashtra - South Mumbai" : "e.g. 1550 Scott St, San Francisco, CA"}
                          className="w-full bg-surface-low border border-outline rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-indigo-custom focus:bg-white transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div>
                      <h4 className="text-xl font-bold mb-2">Final Identity Markers</h4>
                      <p className="text-sm text-on-surface-dim">Connect your digital accounts or provide official identifiers for verification.</p>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="space-y-4 mb-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim px-1">Verification Channel</label>
                        <div className="grid grid-cols-2 gap-4">
                          <button 
                            onClick={() => {
                              if (verificationMethod === 'external') {
                                handleExternalSync();
                              } else {
                                setVerificationMethod('external');
                              }
                            }}
                            className={`p-6 rounded-[24px] border-2 text-left transition-all group relative overflow-hidden ${verificationMethod === 'external' ? 'border-indigo-custom bg-indigo-xpale shadow-lg ring-4 ring-indigo-custom/10' : 'border-outline hover:border-indigo-pale bg-white'}`}
                          >
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all ${verificationMethod === 'external' ? 'bg-indigo-custom text-white' : 'bg-surface-low text-on-surface-dim'}`}>
                                <Cloud size={20} />
                             </div>
                             <div className="text-xs font-bold leading-tight mb-1">{isIndia ? 'Connect DigiLocker' : 'DMV Mobile Sync'}</div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-dim opacity-50">Verified API</div>
                             {verificationMethod === 'external' && (
                               <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-custom rounded-full ring-4 ring-indigo-custom/10" />
                             )}
                          </button>
                          <button 
                            onClick={() => setVerificationMethod('manual')}
                            className={`p-6 rounded-[24px] border-2 text-left transition-all group ${verificationMethod === 'manual' ? 'border-indigo-custom bg-indigo-xpale shadow-lg ring-4 ring-indigo-custom/10' : 'border-outline hover:border-indigo-pale bg-white'}`}
                          >
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all ${verificationMethod === 'manual' ? 'bg-indigo-custom text-white' : 'bg-surface-low text-on-surface-dim'}`}>
                                <FileText size={20} />
                             </div>
                             <div className="text-xs font-bold leading-tight mb-1">Manual Entry</div>
                             <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-dim opacity-50">Standard Audit</div>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        {verificationMethod === 'external' ? (
                          <motion.div 
                            key="external-sync"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            onClick={handleExternalSync}
                            className="bg-indigo-xpale/40 p-8 rounded-[32px] border border-indigo-pale/50 ring-2 ring-indigo-custom/30 relative overflow-hidden cursor-pointer hover:bg-indigo-xpale/60 active:scale-[0.99] transition-all group"
                          >
                            <div className="absolute top-0 right-0 p-4 opacity-[0.05]">
                               <Shield size={100} />
                            </div>
                            <div className="flex items-center gap-4 mb-4">
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm p-2 overflow-hidden shadow-indigo-100">
                                <img 
                                  src="https://avatars.githubusercontent.com/u/15012547?s=200&v=4" 
                                  alt="DigiLocker" 
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm">DigiLocker Integration</h4>
                                <p className="text-[10px] text-on-surface-dim font-black uppercase tracking-widest">Official Government Gateway</p>
                              </div>
                            </div>
                            <p className="text-xs text-on-surface-dim leading-relaxed mb-6 font-medium">Link your Aadhaar-verified DigiLocker account to automatically fetch your Voter ID, PAN, and address markers.</p>
                        <div className="flex items-center justify-between mt-auto px-1">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-custom">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            Secure SSL Tunnel Active
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExternalSync();
                            }}
                            disabled={loggingIn || syncing}
                            className="px-6 py-2.5 bg-indigo-custom text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                          >
                            {loggingIn || syncing ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              isIndia ? 'Connect Now' : 'Authorize Sync'
                            )}
                          </button>
                        </div>
                          </motion.div>
                        ) : (
                          <div className="space-y-6 animate-fade-in">
                            {isIndia && mode === 'id' && (
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => setIdType('voter')}
                                  className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${idType === 'voter' ? 'bg-indigo-custom text-white border-indigo-custom' : 'bg-surface-low border-outline'}`}
                                >
                                  Voter ID (EPIC)
                                </button>
                                <button 
                                  onClick={() => setIdType('pan')}
                                  className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${idType === 'pan' ? 'bg-indigo-custom text-white border-indigo-custom' : 'bg-surface-low border-outline'}`}
                                >
                                  PAN Card
                                </button>
                              </div>
                            )}

                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim px-1">
                                {isIndia ? (idType === 'voter' ? 'EPIC Number' : 'PAN Card Number') : 'Last 4 digits of SSN or DL No.'}
                              </label>
                              <input 
                                type="text" 
                                placeholder={isIndia ? (idType === 'voter' ? "ABC1234567" : "ABCDE1234F") : "XXXX-XXXX-XXXX"}
                                value={formData.idNumber}
                                onChange={e => setFormData({...formData, idNumber: e.target.value})}
                                className="w-full bg-surface-low border border-outline rounded-2xl p-5 text-lg font-mono font-bold focus:outline-none focus:border-indigo-custom focus:bg-white transition-all shadow-sm tracking-widest"
                              />
                            </div>
                          </div>
                        )}
                      </AnimatePresence>

                      {mode === 'ballot' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-dim px-1">Primary Reason for Eligibility</label>
                          <select 
                            className="w-full bg-surface-low border border-outline rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-indigo-custom transition-all appearance-none"
                            value={formData.reason}
                            onChange={e => setFormData({...formData, reason: e.target.value})}
                          >
                            <option>Substantiated Disability/Illness</option>
                            <option>Emergency Service Duty</option>
                            <option>Travel / Out of Jurisdiction</option>
                            <option>Senior Citizen (85+)</option>
                          </select>
                        </div>
                      )}

                      <div className="p-5 bg-indigo-xpale rounded-[32px] border border-indigo-pale flex items-start gap-4">
                        <div className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center text-indigo-custom shrink-0 mt-0.5">
                          <Fingerprint size={20} />
                        </div>
                        <p className="text-[11px] text-indigo-900/70 leading-relaxed italic">
                          "I hereby certify that the information provided is true and I am aware of the penalties for voter fraud under {selectedCountry} law."
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-4 mt-12 pt-6 border-t border-outline/30">
                {step > 0 && (
                  <button 
                    onClick={() => setStep(step - 1)}
                    className="px-8 py-4 text-sm font-bold text-on-surface-dim hover:text-indigo-custom transition-all"
                  >
                    Back
                  </button>
                )}
                <button 
                  onClick={handleNext}
                  className="flex-1 btn-primary py-4 rounded-2xl shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest group"
                >
                  {step === 2 && verificationMethod === 'external' ? 'Connect Account' : step === 2 ? 'Verify Details' : 'Continue'}
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function GlobalSearch({ onClose, onNavigate, profile }: { onClose: () => void, onNavigate: (s: Screen) => void, profile: UserProfile | null }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string, title: string, category: string, screen: Screen }[]>([]);

  const searchableItems = [
    { id: 't1', title: 'Registration Deadline', category: 'Timeline', screen: 'timeline' as Screen },
    { id: 't2', title: 'Polling Day', category: 'Timeline', screen: 'timeline' as Screen },
    { id: 'm1', title: 'Myth: Registering to vote affects taxes', category: 'MythBuster', screen: 'mythbuster' as Screen },
    { id: 'm2', title: 'Fact: Voter ID requirements', category: 'MythBuster', screen: 'mythbuster' as Screen },
    { id: 's1', title: 'Ballot Marking Simulation', category: 'Simulation', screen: 'simulation' as Screen },
    { id: 'h1', title: 'How to find my polling place', category: 'Help', screen: 'help' as Screen },
    { id: 'r1', title: 'View past election results', category: 'Results', screen: 'results' as Screen },
  ];

  useEffect(() => {
    if (query.length > 1) {
      setResults(searchableItems.filter(item => 
        item.title.toLowerCase().includes(query.toLowerCase()) || 
        item.category.toLowerCase().includes(query.toLowerCase())
      ));
    } else {
      setResults([]);
    }
  }, [query]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-on-surface/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: -20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        className="w-full max-w-[600px] bg-white rounded-[32px] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline flex items-center gap-4">
          <Search size={24} className="text-on-surface-dim" />
          <input 
            autoFocus
            type="text" 
            placeholder="Search dates, myths, or tools..."
            className="flex-1 text-xl outline-none"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-2 hover:bg-surface-low rounded-full">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-4">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map(item => (
                <button 
                  key={item.id}
                  onClick={() => onNavigate(item.screen)}
                  className="w-full text-left p-4 hover:bg-indigo-xpale rounded-2xl transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="text-[10px] font-black text-indigo-custom uppercase tracking-widest mb-1">{item.category}</div>
                    <div className="font-bold">{item.title}</div>
                  </div>
                  <ChevronRight size={18} className="text-on-surface-dim group-hover:translate-x-1 transition-transform" />
                </button>
              ))}
            </div>
          ) : query ? (
            <div className="py-12 text-center text-on-surface-dim">
              <History size={48} className="mx-auto mb-4 opacity-20" />
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <div className="py-8">
              <div className="px-4 mb-4 text-[10px] font-black text-on-surface-dim uppercase tracking-widest">Suggested Searches</div>
              <div className="flex flex-wrap gap-2 px-4">
                {['Timeline', 'Simulation', 'MythBuster', 'Voter ID'].map(tag => (
                  <button 
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-4 py-2 bg-surface-low border border-outline rounded-full text-sm font-bold hover:border-indigo-pale transition-all"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function SettingsPanel({ profile, onClose, onUpdate, onStartVerification }: { profile: UserProfile, onClose: () => void, onUpdate: (data: any) => Promise<void>, onStartVerification: (mode: 'id' | 'ballot' | 'registration') => void }) {
  const [pref, setPref] = useState(profile.preferences || { 
    notifications: true, 
    emailNotifications: true,
    compactView: false, 
    language: 'en',
    widgets: ['journey', 'score', 'representatives', 'alerts', 'tools']
  });
  const [coreData, setCoreData] = useState({
    country: profile.country || 'US',
    location: profile.location || '',
    address: profile.address || '',
    name: profile.name || ''
  });
  const [saving, setSaving] = useState(false);

  const handleFullReset = async () => {
    if (confirm('CRITICAL: This will permanently wipe your verified identity, saved address, and all voting records. You will need to start the onboarding from scratch. Proceed?')) {
      await updateUserProfile(profile.uid, { 
        idVerified: false, 
        onboardingComplete: false,
        voterIdNumber: null, 
        panCardNumber: null,
        verificationMethod: null,
        verifiedAt: null,
        address: '',
        location: '',
        registrationStatus: 'not_started',
        voterSlipStatus: null,
        ballotApplied: false,
        interests: [],
        points: 0
      });
      await auth.signOut();
      window.location.reload();
    }
  };

  const handleResetVerification = async () => {
    if (confirm('This will reset your identity verification status for testing purposes. Continue?')) {
      await updateUserProfile(profile.uid, { 
        idVerified: false, 
        voterIdNumber: null, 
        verificationMethod: null,
        verifiedAt: null 
      });
      window.location.reload();
    }
  };

  const availableWidgets = [
    { id: 'journey', label: 'Voting Journey', desc: 'Progress tracker for your voting steps' },
    { id: 'score', label: 'Civic Score', desc: 'Points and regional ranking' },
    { id: 'voterId', label: 'Voter Identity Wallet', desc: 'Securely store and verify your voter ID' },
    { id: 'representatives', label: 'Representatives', desc: 'Your federal, state and local officials' },
    { id: 'alerts', label: 'Regional Alerts', desc: 'Critical deadline notifications' },
    { id: 'tools', label: 'Quick Tools', desc: 'Shortcuts to simulation and mythbuster' }
  ];

  const toggleWidget = (id: string) => {
    setPref(p => {
      const current = p.widgets || [];
      const next = current.includes(id) 
        ? current.filter(w => w !== id)
        : [...current, id];
      return { ...p, widgets: next };
    });
  };

  const moveWidget = (id: string, dir: 'up' | 'down') => {
    setPref(p => {
      const widgets = [...(p.widgets || [])];
      const idx = widgets.indexOf(id);
      if (idx === -1) return p;
      const nextIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= widgets.length) return p;
      [widgets[idx], widgets[nextIdx]] = [widgets[nextIdx], widgets[idx]];
      return { ...p, widgets };
    });
  };

  const toggle = (field: string) => {
    setPref(p => ({ ...p, [field as keyof typeof p]: !p[field as keyof typeof p] }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      preferences: pref,
      ...coreData
    });
    setSaving(false);
    onClose();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-[600px] max-h-[90vh] bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-10 border-b border-outline overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-3xl font-serif">Profile & Settings</h3>
            <button onClick={onClose} className="p-2 hover:bg-surface-low rounded-full">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-10">
            <section>
              <h4 className="text-xs font-black text-indigo-accent uppercase tracking-widest mb-6 px-1">Identity & Location</h4>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase text-on-surface-dim mb-2 ml-1">Full Name</label>
                  <input 
                    type="text"
                    value={coreData.name}
                    onChange={e => setCoreData(c => ({ ...c, name: e.target.value }))}
                    className="w-full bg-surface-low border border-outline rounded-xl p-3 text-sm focus:border-indigo-accent outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-on-surface-dim mb-2 ml-1">Country</label>
                    <select 
                      value={coreData.country}
                      onChange={e => setCoreData(c => ({ ...c, country: e.target.value as any }))}
                      className="w-full bg-surface-low border border-outline rounded-xl p-3 text-sm focus:border-indigo-accent outline-none"
                    >
                      <option value="US">United States</option>
                      <option value="India">India</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-on-surface-dim mb-2 ml-1">City/District</label>
                    <input 
                      type="text"
                      value={coreData.location}
                      onChange={e => setCoreData(c => ({ ...c, location: e.target.value }))}
                      placeholder="e.g. San Francisco"
                      className="w-full bg-surface-low border border-outline rounded-xl p-3 text-sm focus:border-indigo-accent outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-on-surface-dim mb-2 ml-1">Full Address (for Voter Matching)</label>
                  <textarea 
                    value={coreData.address}
                    onChange={e => setCoreData(c => ({ ...c, address: e.target.value }))}
                    placeholder="Enter your street address, locality, house number..."
                    rows={2}
                    className="w-full bg-surface-low border border-outline rounded-xl p-3 text-sm focus:border-indigo-accent outline-none transition-all resize-none"
                  />
                  <p className="mt-2 text-[10px] text-on-surface-dim px-1 italic">Note: Your address is used solely for identifying your local representatives and polling location.</p>
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-black text-indigo-accent uppercase tracking-widest mb-6 px-1">Notifications & View</h4>
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold mb-1">Push Notifications</div>
                    <div className="text-xs text-on-surface-dim">Real-time alerts in this browser</div>
                  </div>
                  <button 
                    onClick={() => toggle('notifications')}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${pref.notifications ? 'bg-indigo-accent' : 'bg-outline'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${pref.notifications ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold mb-1">Email Notifications</div>
                    <div className="text-xs text-on-surface-dim">Critical deadline reminders via email</div>
                  </div>
                  <button 
                    onClick={() => toggle('emailNotifications')}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${pref.emailNotifications ? 'bg-indigo-accent' : 'bg-outline'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${pref.emailNotifications ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold mb-1">Compact Dashboard</div>
                    <div className="text-xs text-on-surface-dim">Minimal padding for dense info</div>
                  </div>
                  <button 
                    onClick={() => toggle('compactView')}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${pref.compactView ? 'bg-indigo-accent' : 'bg-outline'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${pref.compactView ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div>
                  <div className="font-bold mb-3">Language</div>
                  <select 
                    value={pref.language}
                    onChange={e => setPref(p => ({ ...p, language: e.target.value }))}
                    className="w-full bg-surface-low border border-outline rounded-xl p-3 text-sm focus:border-indigo-accent"
                  >
                    <option value="en">English (US/India)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="es">Spanish (Español)</option>
                  </select>
                </div>
              </div>
            </section>

            <section>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-xs font-black text-indigo-accent uppercase tracking-widest px-1">Integrations</h4>
                </div>
                <div className="bg-indigo-xpale/20 border border-indigo-pale p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Cloud className="text-indigo-custom" size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-bold">DigiLocker Integration</div>
                      <div className="text-[10px] text-on-surface-dim font-black uppercase tracking-widest">Connect official ID documents</div>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      onClose();
                      onStartVerification('id');
                    }}
                    className="py-2 px-4 bg-indigo-custom text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {profile.idVerified ? 'Refresh Sync' : 'Connect Now'}
                  </button>
                </div>
            </section>

            <section>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-xs font-black text-indigo-accent uppercase tracking-widest px-1">Dashboard Widgets</h4>
                  <div className="text-[10px] text-on-surface-dim font-bold">DRAG TO REORDER (COMING SOON)</div>
                </div>
                <div className="space-y-4">
                  {availableWidgets.map(widget => {
                    const isActive = (pref.widgets || []).includes(widget.id);
                    const order = (pref.widgets || []).indexOf(widget.id);
                    return (
                      <div key={widget.id} className={`p-4 rounded-2xl border transition-all ${isActive ? 'bg-white border-indigo-accent/20 shadow-sm' : 'bg-surface-low border-outline opacity-60'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => toggleWidget(widget.id)}
                              className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${isActive ? 'bg-indigo-accent border-indigo-accent text-white' : 'border-outline-strong bg-white text-transparent'}`}
                            >
                              <Check size={12} strokeWidth={4} />
                            </button>
                            <div>
                              <div className="text-sm font-bold">{widget.label}</div>
                              <div className="text-[10px] text-on-surface-dim">{widget.desc}</div>
                            </div>
                          </div>
                          {isActive && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => moveWidget(widget.id, 'up')} className="p-1 hover:bg-surface-low rounded border border-outline"><ChevronUp size={14} /></button>
                              <button onClick={() => moveWidget(widget.id, 'down')} className="p-1 hover:bg-surface-low rounded border border-outline"><ChevronDown size={14} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
            </section>
            
            <section className="pt-8 border-t border-outline/30">
              <h4 className="text-xs font-black text-error-custom uppercase tracking-widest mb-6 px-1">Testing & Reset</h4>
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                  <p className="text-[10px] text-amber-900 mb-4 font-medium leading-relaxed">
                    Identity status stuck? Verification not showing up? Use this to clear your ID data without losing your address.
                  </p>
                  <button 
                    onClick={handleResetVerification}
                    className="w-full py-3 bg-white text-amber-700 border border-amber-200 rounded-xl text-xs font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Reset ID Verification Status
                  </button>
                </div>

                <div className="bg-red-50/50 border border-red-100 p-4 rounded-2xl">
                  <p className="text-[10px] text-red-600/70 mb-4 leading-relaxed font-medium">
                    Want to start your entire voter journey again? This clears your address, ID, and profile progress.
                  </p>
                  <button 
                    onClick={handleFullReset}
                    className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                  >
                    <LogOut size={14} />
                    Wipe Profile & Start Over
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
        
        <div className="p-10 bg-surface-low flex gap-4 mt-auto">
          <button onClick={onClose} className="btn-outline flex-1 rounded-2xl">Cancel</button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 rounded-2xl bg-indigo-accent hover:bg-blue-700"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
            Save Profile
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Footer({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <footer className="border-t border-outline py-20 bg-surface">
      <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-4 gap-12">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5 font-serif text-xl text-indigo-custom mb-6 cursor-pointer" onClick={() => onNavigate('dashboard')}>
            <div className="w-2.5 h-2.5 bg-indigo-custom rounded-full" />
            CivicTrust
          </div>
          <p className="text-sm text-on-surface-dim max-w-sm leading-relaxed">
            A non-partisan platform dedicated to making civic participation accessible, transparent, and simple for every voter in the nation.
          </p>
        </div>
        <div>
          <h5 className="font-bold text-xs uppercase tracking-widest mb-6 opacity-60">Resources</h5>
          <ul className="space-y-4 text-sm font-medium">
            <li><button onClick={() => onNavigate('dashboard')} className="hover:text-indigo-custom transition-colors">Voter Registration</button></li>
            <li><button onClick={() => onNavigate('timeline')} className="hover:text-indigo-custom transition-colors">Election Timeline</button></li>
            <li><button onClick={() => onNavigate('dashboard')} className="hover:text-indigo-custom transition-colors">State Requirements</button></li>
          </ul>
        </div>
        <div>
          <h5 className="font-bold text-xs uppercase tracking-widest mb-6 opacity-60">Contact</h5>
          <ul className="space-y-4 text-sm font-medium">
            <li><button onClick={() => onNavigate('help')} className="hover:text-indigo-custom transition-colors">Help Center</button></li>
            <li><button onClick={() => onNavigate('press')} className="hover:text-indigo-custom transition-colors">Press Inquiries</button></li>
            <li><button onClick={() => onNavigate('privacy')} className="hover:text-indigo-custom transition-colors">Privacy Policy</button></li>
          </ul>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 mt-16 pt-8 border-t border-outline flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-on-surface-dim">
        <p>© 2026 CivicTrust. All rights reserved. Sourced from official government data.</p>
        <div className="flex gap-8">
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-custom transition-colors">Twitter</a>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-custom transition-colors">Instagram</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-custom transition-colors">LinkedIn</a>
        </div>
      </div>
    </footer>
  );
}
