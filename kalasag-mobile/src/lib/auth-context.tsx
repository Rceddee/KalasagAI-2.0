import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface CitizenProfile {
  name: string;
  contact: string;
  email: string;
  created_at?: any;
  updated_at?: any;
}

interface AuthContextType {
  user: User | null;
  citizenProfile: CitizenProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  citizenProfile: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [citizenProfile, setCitizenProfile] = useState<CitizenProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.emailVerified) {
        setUser(firebaseUser);

        // Load citizen profile from Firestore with fallback to Auth user
        try {
          const profileDoc = await getDoc(doc(db, 'citizens', firebaseUser.uid));
          if (profileDoc.exists()) {
            setCitizenProfile(profileDoc.data() as CitizenProfile);
          } else {
            setCitizenProfile({
              name: firebaseUser.displayName || 'Resident',
              contact: '',
              email: firebaseUser.email || '',
            });
          }
        } catch {
          // Graceful fallback to Auth user details if Firestore rules restrict citizens collection
          setCitizenProfile({
            name: firebaseUser.displayName || 'Resident',
            contact: '',
            email: firebaseUser.email || '',
          });
        }
      } else {
        setUser(null);
        setCitizenProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setCitizenProfile(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, citizenProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
