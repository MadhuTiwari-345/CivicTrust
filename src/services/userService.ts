import { doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, query, orderBy } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "../lib/firebase";
import { UserProfile, Step } from "../types";
import { DEFAULT_STEPS_US, DEFAULT_STEPS_IN } from "../lib/constants";

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const path = `users/${uid}`;
  try {
    const userDoc = await getDoc(doc(db, path));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};

export const createUserProfile = async (uid: string, email: string, name: string, initialData?: Partial<UserProfile>): Promise<UserProfile> => {
  const path = `users/${uid}`;
  const newUser: UserProfile = {
    uid,
    email,
    name,
    points: 0,
    onboardingComplete: false,
    preferences: {
      notifications: true,
      emailNotifications: true,
      compactView: false,
      language: 'en',
      widgets: ['journey', 'score', 'representatives', 'alerts', 'tools']
    },
    ...initialData
  };
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, path), newUser);
    
    // Initialize default steps
    const defaultSteps = newUser.country === 'India' ? DEFAULT_STEPS_IN : DEFAULT_STEPS_US;

    defaultSteps.forEach(step => {
      const stepRef = doc(collection(db, `${path}/steps`), step.id);
      batch.set(stepRef, step);
    });
    
    await batch.commit();
    return newUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, path), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const getUserSteps = async (uid: string): Promise<Step[]> => {
  const path = `users/${uid}/steps`;
  try {
    const q = query(collection(db, path), orderBy("order", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Step);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
};

export const updateStepStatus = async (uid: string, stepId: string, status: 'pending' | 'completed') => {
  const path = `users/${uid}/steps/${stepId}`;
  try {
    await updateDoc(doc(db, path), { status });
    
    // Nudge points if completed
    if (status === 'completed') {
      const userRef = doc(db, `users/${uid}`);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentPoints = userDoc.data().points || 0;
        await updateDoc(userRef, { points: currentPoints + 50 });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
