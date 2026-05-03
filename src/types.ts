export type UserProfile = {
  uid: string;
  email: string;
  name: string;
  country?: 'US' | 'India';
  ageRange?: string;
  location?: string;
  address?: string;
  isFirstTime?: boolean;
  points: number;
  onboardingComplete: boolean;
  idVerified?: boolean;
  verificationMethod?: 'manual' | 'digilocker' | 'dmv_mobile';
  verifiedAt?: string;
  voterIdNumber?: string;
  panCardNumber?: string;
  registrationStatus?: 'verified' | 'pending' | 'not_started';
  voterSlipStatus?: string | null;
  ballotApplied?: boolean;
  interests?: string[];
  preferences?: {
    notifications: boolean;
    emailNotifications: boolean;
    compactView: boolean;
    language: string;
    widgets: string[]; // List of widget IDs in order
  };
  representatives?: {
    federal: Representative[];
    state: Representative[];
    local: Representative[];
  };
};

export type Representative = {
  name: string;
  office: string;
  party?: string;
  phone?: string;
  email?: string;
  url?: string;
  photo?: string;
  officialPortal?: string;
};

export type Step = {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'completed';
  dueDate?: string;
  order: number;
};

export type VotingJourney = {
  steps: Step[];
  progress: number;
};

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  id: string;
};

export type TimelineEvent = {
  title: string;
  date: string;
  description: string;
  type: 'deadline' | 'voting' | 'info';
  level: 'federal' | 'state' | 'local';
  methods?: ('mail' | 'in-person' | 'early')[];
  source?: string;
  sourceUrl?: string;
  critical?: boolean;
};
