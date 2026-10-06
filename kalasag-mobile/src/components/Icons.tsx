import React from 'react';
import { Platform, View, Text } from 'react-native';
import { 
  Shield, 
  FileText, 
  MapPin, 
  AlertTriangle,
  Sun,
  Moon,
  Map,
  BookOpen,
  Phone,
  PhoneCall,
  User,
  Flame,
  Waves,
  Activity,
  AlertCircle,
  CheckCircle2,
  X,
  Camera,
  Building2
} from 'lucide-react-native';

interface IconProps {
  size?: number;
  color?: string;
  style?: any;
}

export const ShieldIcon = ({ size = 20, color = '#FFF', style }: IconProps) => (
  <Shield size={size} color={color} style={style} />
);

export const FileIcon = ({ size = 20, color = '#FFF', style }: IconProps) => (
  <FileText size={size} color={color} style={style} />
);

export const PinIcon = ({ size = 20, color = '#FFF', style }: IconProps) => (
  <MapPin size={size} color={color} style={style} />
);

export const AlertIcon = ({ size = 20, color = '#FFF', style }: IconProps) => (
  <AlertTriangle size={size} color={color} style={style} />
);

export const SunIcon = ({ size = 16, color = '#FFF', style }: IconProps) => (
  <Sun size={size} color={color} style={style} />
);

export const MoonIcon = ({ size = 16, color = '#FFF', style }: IconProps) => (
  <Moon size={size} color={color} style={style} />
);

export const MapIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Map size={size} color={color} style={style} />
);

export const DirectoryIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <BookOpen size={size} color={color} style={style} />
);

export const PhoneIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Phone size={size} color={color} style={style} />
);

export const PhoneCallIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <PhoneCall size={size} color={color} style={style} />
);

export const UserIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <User size={size} color={color} style={style} />
);

export const FlameIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Flame size={size} color={color} style={style} />
);

export const WaterIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Waves size={size} color={color} style={style} />
);

export const MedicalIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Activity size={size} color={color} style={style} />
);

export const RoadIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <AlertCircle size={size} color={color} style={style} />
);

export const CheckIcon = ({ size = 16, color = '#FFF', style }: IconProps) => (
  <CheckCircle2 size={size} color={color} style={style} />
);

export const CloseIcon = ({ size = 16, color = '#FFF', style }: IconProps) => (
  <X size={size} color={color} style={style} />
);

export const CameraIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Camera size={size} color={color} style={style} />
);

export const BuildingIcon = ({ size = 18, color = '#FFF', style }: IconProps) => (
  <Building2 size={size} color={color} style={style} />
);

export const GoogleIcon = ({ size = 18 }: { size?: number }) => {
  if (Platform.OS === 'web') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'inline-block', flexShrink: 0 } as any}>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"/>
      </svg>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: size * 0.65, lineHeight: size * 0.8 }}>G</Text>
    </View>
  );
};
